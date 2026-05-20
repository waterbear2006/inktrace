"""
微信读书导入路由
通过用户提供的 API Key 调用微信读书 Agent Gateway，导入划线 + 想法
"""

import os
import uuid
import httpx
import asyncio
import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

from backend.core.store import store
from backend.services.note_orchestrator import NoteOrchestrator
from backend.schemas.responses import (
    PublicHighlightsResponse,
    PersonaResponse,
    PerspectiveCollisionResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/weread", tags=["weread"])

WEREAD_GATEWAY = "https://i.weread.qq.com/api/agent/gateway"
SKILL_VERSION = "1.0.3"
DIRTY_DIR = os.path.join("data", "raw_notes")
OUTPUT_DIR = os.path.join("data", "output")

orchestrator = NoteOrchestrator()


# ── Pydantic models ──────────────────────────────

class VerifyRequest(BaseModel):
    api_key: str


class NotebookBook(BaseModel):
    bookId: str
    title: str
    author: str
    cover: str
    noteCount: int
    reviewCount: int
    bookmarkCount: int


class VerifyResponse(BaseModel):
    success: bool
    totalBookCount: int = 0
    books: list[NotebookBook] = []


class ImportRequest(BaseModel):
    api_key: str
    book_ids: list[str]


class ImportedBook(BaseModel):
    bookId: str
    title: str
    noteCount: int
    noteId: str


class ImportResponse(BaseModel):
    success: bool
    imported: list[ImportedBook] = []
    message: str = ""


class CleanRequest(BaseModel):
    note_ids: list[str]


class CleanResponse(BaseModel):
    success: bool
    message: str = ""
    count: int = 0


# ── helpers ──────────────────────────────────────

async def _call_weread(api_key: str, api_name: str, **params) -> dict:
    """调用微信读书 Agent Gateway"""
    body = {"api_name": api_name, "skill_version": SKILL_VERSION, **params}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            WEREAD_GATEWAY,
            json=body,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("errcode", 0) != 0:
            raise HTTPException(status_code=400, detail=f"微信读书 API 错误: {data}")
        return data


def _format_highlights(title: str, author: str, bookmarks: list, reviews: list) -> str:
    """将划线 + 想法格式化为 pipeline 可处理的 markdown"""
    lines = [f"# {title} - {author}\n"]

    # 按章节组织划线
    chapters: dict[int, dict] = {}  # chapterUid -> {title, highlights: [(text, range)]}
    chapter_order: list[int] = []

    if bookmarks:
        chapter_map = bookmarks.get("chapters", [])
        chapter_titles = {c["chapterUid"]: c["title"] for c in chapter_map}

        for bm in bookmarks.get("updated", []):
            cid = bm.get("chapterUid", 0)
            if cid not in chapters:
                chapters[cid] = {
                    "title": chapter_titles.get(cid, f"章节 {cid}"),
                    "highlights": [],
                }
                chapter_order.append(cid)
            chapters[cid]["highlights"].append(bm.get("markText", ""))

    # 按章节输出
    for cid in chapter_order:
        ch = chapters[cid]
        lines.append(f"## {ch['title']}\n")
        for h in ch["highlights"]:
            lines.append(h.strip())
            lines.append("")

    # 输出想法
    if reviews:
        lines.append("## 想法与思考\n")
        for r in reviews.get("reviews", []):
            review = r.get("review", {})
            content = review.get("content", "").strip()
            abstract = review.get("abstract", "").strip()
            chapter_name = review.get("chapterTitle", "")
            if content:
                location = f"（{chapter_name}）" if chapter_name else ""
                if abstract:
                    lines.append(f"> {abstract}\n")
                lines.append(f"{content}{location}\n")
            elif abstract:
                lines.append(f"> {abstract}\n")

    return "\n".join(lines)


async def _import_one_book(api_key: str, book: dict) -> dict:
    """导入单本书：拉取划线 + 想法，存盘，加入 store"""
    book_id = book["bookId"]
    title = book.get("title", f"未知书名_{book_id}")
    author = book.get("author", "未知作者")
    cover = book.get("cover", "")

    # 1. 并发拉取划线和想法
    bookmarks, reviews = await asyncio.gather(
        _call_weread(api_key, "/book/bookmarklist", bookId=book_id),
        _call_weread(api_key, "/review/list/mine", bookid=book_id, count=50),
        return_exceptions=True,
    )

    if isinstance(bookmarks, Exception):
        logger.warning(f"拉取划线失败 {title}: {bookmarks}")
        bookmarks = {"updated": [], "chapters": []}
    if isinstance(reviews, Exception):
        logger.warning(f"拉取想法失败 {title}: {reviews}")
        reviews = {"reviews": []}

    # 2. 格式化 markdown
    md = _format_highlights(title, author, bookmarks, reviews)

    # 3. 保存文件
    os.makedirs(DIRTY_DIR, exist_ok=True)
    safe_title = title.replace("《", "").replace("》", "").replace("/", "_")
    filename = f"{safe_title}_WeRead.md"
    filepath = os.path.join(DIRTY_DIR, filename)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(md)

    # 4. 注册到 store
    note_id = f"note_{str(uuid.uuid5(uuid.NAMESPACE_URL, safe_title))[:8]}"

    total_notes = len(bookmarks.get("updated", [])) + len(reviews.get("reviews", []))
    store.books[note_id] = {
        "id": note_id,
        "title": safe_title,
        "author": author,
        "source": "WeRead",
        "progress": 0,
        "status": "待清洗",
        "statusColor": "bg-red-500",
        "isError": True,
        "img": cover,
        "filePath": filepath,
    }

    return {"bookId": book_id, "title": safe_title, "noteCount": total_notes, "noteId": note_id, "filepath": filepath}


async def _run_cleaning(filepath: str, note_id: str, title: str, on_progress=None):
    """后台清洗任务"""

    async def progress_cb(pct: int, label: str = ""):
        """将进度同步写入 store，供前端轮询"""
        if note_id in store.books:
            store.books[note_id]["progress"] = pct
            store.books[note_id]["status"] = f"清洗中 ({pct}%)"
        if on_progress:
            await on_progress(pct, label)

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            raw_text = f.read()

        if not raw_text or len(raw_text.strip()) < 10:
            logger.warning(f"[WeRead清洗] 内容过短: {title}")
            return

        if note_id in store.books:
            store.books[note_id]["status"] = "清洗中"
            store.books[note_id]["progress"] = 10
            store.books[note_id]["statusColor"] = "bg-blue-400"

        await progress_cb(15, "L1: 解析笔记结构...")

        clean_md = await orchestrator.process_all_notes(
            raw_text,
            enable_l3=True,
            enable_l4=True,
            on_progress=progress_cb,
        )

        await progress_cb(90, "保存结果...")

        os.makedirs(OUTPUT_DIR, exist_ok=True)
        output_subdir = os.path.join(OUTPUT_DIR, title)
        os.makedirs(output_subdir, exist_ok=True)
        output_file = os.path.join(output_subdir, f"{title}_Notes.md")
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(clean_md)

        if note_id in store.books:
            store.books[note_id]["status"] = "已完成"
            store.books[note_id]["progress"] = 100
            store.books[note_id]["statusColor"] = "bg-green-500"
            store.books[note_id]["isError"] = False

        await progress_cb(100, "完成")

        logger.info(f"[WeRead清洗] 完成: {title}")

    except Exception as e:
        logger.error(f"[WeRead清洗] 失败: {title}, {e}")
        if note_id in store.books:
            store.books[note_id]["status"] = "清洗失败"
            store.books[note_id]["statusColor"] = "bg-red-500"
            store.books[note_id]["isError"] = True


# ── endpoints ────────────────────────────────────

@router.post("/verify", response_model=VerifyResponse)
async def verify_key(req: VerifyRequest):
    """验证 API Key 并返回可导入的笔记本列表"""
    try:
        data = await _call_weread(req.api_key, "/user/notebooks", count=100)

        books = []
        for b in data.get("books", []):
            book_info = b.get("book", {})
            books.append(
                NotebookBook(
                    bookId=b["bookId"],
                    title=book_info.get("title", "未知书名"),
                    author=book_info.get("author", "未知作者"),
                    cover=book_info.get("cover", ""),
                    noteCount=b.get("noteCount", 0),
                    reviewCount=b.get("reviewCount", 0),
                    bookmarkCount=b.get("bookmarkCount", 0),
                )
            )

        # 按总笔记数降序
        books.sort(key=lambda x: x.noteCount + x.reviewCount + x.bookmarkCount, reverse=True)

        return VerifyResponse(
            success=True,
            totalBookCount=data.get("totalBookCount", len(books)),
            books=books,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"验证失败: {str(e)}")


@router.post("/import", response_model=ImportResponse)
async def import_books(req: ImportRequest, background_tasks: BackgroundTasks):
    """导入选中的书籍"""
    if not req.book_ids:
        raise HTTPException(status_code=400, detail="请选择至少一本书")

    # 先获取完整笔记本列表,拿到书籍信息
    try:
        nb_data = await _call_weread(req.api_key, "/user/notebooks", count=100)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"获取笔记本列表失败: {str(e)}")

    book_map = {}
    for b in nb_data.get("books", []):
        bi = b.get("book", {})
        book_map[b["bookId"]] = {
            "bookId": b["bookId"],
            "title": bi.get("title", "未知书名"),
            "author": bi.get("author", "未知作者"),
            "cover": bi.get("cover", ""),
            "noteCount": b.get("noteCount", 0),
            "reviewCount": b.get("reviewCount", 0),
            "bookmarkCount": b.get("bookmarkCount", 0),
        }

    imported = []
    for book_id in req.book_ids:
        book = book_map.get(book_id, {"bookId": book_id, "title": f"未知_{book_id}", "author": "未知", "cover": ""})
        try:
            result = await _import_one_book(req.api_key, book)
            imported.append(
                ImportedBook(
                    bookId=result["bookId"],
                    title=result["title"],
                    noteCount=result["noteCount"],
                    noteId=result["noteId"],
                )
            )
        except Exception as e:
            logger.error(f"导入失败 {book.get('title', book_id)}: {e}")

    return ImportResponse(
        success=len(imported) > 0,
        imported=imported,
        message=f"成功导入 {len(imported)} 本书" if imported else "导入失败",
    )


@router.post("/clean", response_model=CleanResponse)
async def start_cleaning(req: CleanRequest, background_tasks: BackgroundTasks):
    """用户确认后启动后台清洗（导入 + 原著上传完成后调用）"""
    if not req.note_ids:
        raise HTTPException(status_code=400, detail="请提供至少一个笔记 ID")

    count = 0
    for note_id in req.note_ids:
        book = store.books.get(note_id)
        if not book:
            logger.warning(f"[清洗触发] 笔记不存在: {note_id}")
            continue
        filepath = book.get("filePath")
        if not filepath or not os.path.exists(filepath):
            logger.warning(f"[清洗触发] 文件不存在: {filepath}")
            continue
        title = book.get("title", "未知")
        logger.info(f"[清洗触发] 启动后台清洗: {title} ({note_id})")
        background_tasks.add_task(_run_cleaning, filepath, note_id, title)
        count += 1

    return CleanResponse(
        success=True,
        count=count,
        message=f"已启动 {count} 本书的后台清洗" if count > 0 else "没有可清洗的书籍",
    )


@router.get("/status/{note_id}")
async def get_cleaning_status(note_id: str):
    """查询单本书的清洗进度"""
    book = store.books.get(note_id)
    if not book:
        raise HTTPException(status_code=404, detail=f"未找到笔记: {note_id}")
    return {
        "note_id": note_id,
        "title": book.get("title", ""),
        "status": book.get("status", "未知"),
        "progress": book.get("progress", 0),
        "isError": book.get("isError", False),
    }


# ==========================================
# WeRead 深度集成 Demo 数据
# ==========================================

_PUBLIC_HIGHLIGHTS_DEMO = {
    "万历十五年": {
        "author": "黄仁宇",
        "highlights": [
            {
                "id": "ph_1",
                "text": "就算贵为天子，也不过是一种制度所需要的产物。",
                "chapter": "第一章 万历皇帝",
                "likeCount": 2847,
                "readerCount": 156,
                "readerQuotes": [
                    {"username": "山月不知心底事", "avatar": "", "comment": "读到这句真的愣了很久。我们总觉得皇帝是权力的顶点，但这本书让我看到——皇帝自己也是制度的囚徒。不是某个人在压迫他，是整个结构不需要一个'真人'。"},
                    {"username": "纸舟", "avatar": "", "comment": "跟海瑞的篇章对照着看，感受特别深。清官想救系统，但系统本身不需要被救。万历想做一个有血肉的皇帝，但制度只需要一个符号。"},
                ]
            },
            {
                "id": "ph_2",
                "text": "朝廷最大的任务是促进文官之间的互相信赖与和谐。",
                "chapter": "第二章 申时行",
                "likeCount": 1932,
                "readerCount": 98,
                "readerQuotes": [
                    {"username": "林间", "avatar": "", "comment": "表面说的是'信赖与和谐'，实际上写的是——当一个系统的首要目标是'维稳'而不是'解决问题'，那么这个系统本身就已经是问题了。"},
                ]
            },
            {
                "id": "ph_3",
                "text": "难道一个人熟读经史，文笔华美，就具备了在御前为皇帝作顾问的条件？难道学术上造诣深厚，就能成为大政治家？",
                "chapter": "申时行章节",
                "likeCount": 2103,
                "readerCount": 134,
                "readerQuotes": [
                    {"username": "素心", "avatar": "", "comment": "这个问题放在今天依然成立——技术专家直接等于好的管理者吗？黄仁宇在四百年前就在问这个问题了。"},
                    {"username": "知微", "avatar": "", "comment": "这句话其实是在质疑整个科举制度背后的预设。'学而优则仕'不等于'学而优能仕'，张居正就是最好的例子。"},
                ]
            },
            {
                "id": "ph_4",
                "text": "清官真的能救一个系统吗？",
                "chapter": "海瑞章节",
                "likeCount": 3201,
                "readerCount": 201,
                "readerQuotes": [
                    {"username": "逸尘", "avatar": "", "comment": "海瑞太孤独了。他不是在对抗某个人，他是在对抗一整套几百年来形成的文官运作逻辑。"},
                    {"username": "山月不知心底事", "avatar": "", "comment": "读完这一章我合上书想了很久——如果海瑞生在今天，他会是什么样的人？一个举报者？一个异见者？还是一个无法被系统容纳的'纯粹的人'？"},
                ]
            },
            {
                "id": "ph_5",
                "text": "道德不是万能。它不能代替技术，更不能代替制度。",
                "chapter": "海瑞章节",
                "likeCount": 1856,
                "readerCount": 89,
                "readerQuotes": [
                    {"username": "纸舟", "avatar": "", "comment": "黄仁宇写了整本书，最后其实就落在这一句上。道德不能救国，制度可以。但制度怎么建？他没说。也许他也不知道。"},
                ]
            },
            {
                "id": "ph_6",
                "text": "中国两千年来，以道德代替法制，至明代而极。",
                "chapter": "结论章节",
                "likeCount": 4218,
                "readerCount": 267,
                "readerQuotes": [
                    {"username": "知微", "avatar": "", "comment": "全书最狠的一句。不是在骂明朝，是在解释为什么中国走了这条路。'至明代而极'——不是说明代最道德，是说这套逻辑在明代走到了尽头。"},
                    {"username": "林间", "avatar": "", "comment": "如果黄仁宇是对的，那我们今天的很多问题，是不是也能追溯到'以道德代替法制'的惯性？这本书虽然写的是一五八七年，但读起来像是写给我们这代人的。"},
                ]
            },
        ]
    },
    "红玫瑰与白玫瑰": {
        "author": "张爱玲",
        "highlights": [
            {
                "id": "ph_7",
                "text": "也许每一个男子全都有过这样的两个女人，至少两个。娶了红玫瑰，久而久之，红的变了墙上的一抹蚊子血，白的还是'床前明月光'；娶了白玫瑰，白的便是衣服上沾的一粒饭黏子，红的却是心口上一颗朱砂痣。",
                "chapter": "正文",
                "likeCount": 5632,
                "readerCount": 312,
                "readerQuotes": [
                    {"username": "素心", "avatar": "", "comment": "这段每一次重读都像第一次读到。张爱玲把'未得到'和'已得到'之间的心理落差写到了极致。"},
                    {"username": "山月不知心底事", "avatar": "", "comment": "有一个问题是——振保知道自己想要什么吗？还是说他只是在'应该要什么'和'实际有什么'之间来回摆荡？"},
                ]
            },
        ]
    },
}

_PERSONA_DEMO = {
    "万历十五年": {
        "personaTitle": "制度观察者",
        "personaDescription": "你在阅读中表现出一种独特的'俯瞰视角'——不是沉浸式代入的读者，而更像一位冷静的观察者。你习惯性地将人物的命运放回他们所在的系统中去理解，对'个体与制度结构'的张力特别敏感。大多数读者被黄仁宇笔下的人物悲剧打动，但你总能在悲剧背后找到那张看不见的制度之网。",
        "readingStats": {
            "totalBooks": 1,
            "totalHighlights": 48,
            "avgHighlightDensity": "每3.2页划线一次",
            "activeTimeSlots": "晚上8点-凌晨1点",
            "readingSpeed": "细读型",
            "genreTags": ["历史", "制度分析", "人物传记"],
            "highlightStyle": "长摘录型——偏好整段标注，喜欢保留上下文"
        },
        "insightScores": [
            {"label": "制度敏感度", "score": 92, "description": "比93%的读者更关注制度结构性分析"},
            {"label": "人物共情度", "score": 67, "description": "对个人命运的感知力正常偏上"},
            {"label": "跨书联想力", "score": 85, "description": "能从单本书延伸到更广泛的历史议题"}
        ],
        "companionComment": "说起来，我发现你划线最密集的地方，往往不是'金句'，而是作者在解释某个制度运作原理的长段落。你好像特别喜欢看黄仁宇怎么把一个复杂的事情一层层剥开——这种阅读品味，放在《万历十五年》的读者里还挺少见的。大多数人在划线'金句'，你在划线'逻辑'。",
        "shareCardData": {
            "title": "阅读人设",
            "personaEmoji": "🔭",
            "personaTitle": "制度观察者",
            "stats": [
                {"icon": "📖", "label": "共阅读", "value": "1 本"},
                {"icon": "✏️", "label": "划线", "value": "48 条"},
                {"icon": "🌙", "label": "活跃时段", "value": "深夜读者"},
                {"icon": "🎯", "label": "偏好", "value": "制度与权力结构"}
            ]
        }
    },
    "红玫瑰与白玫瑰": {
        "personaTitle": "情感解剖师",
        "personaDescription": "你读张爱玲的方式像一位外科医生——不是在感受情感的流动，而是在解剖它。你喜欢在她最锋利的比喻处停下划线，像是在说'等等，让我看看这句话是怎么运作的'。你对'未得到'和'已得到'的心理张力特别敏感，能从一段感情描写中读出整个关系结构的必然宿命。",
        "readingStats": {
            "totalBooks": 1,
            "totalHighlights": 32,
            "avgHighlightDensity": "每2.8页划线一次",
            "activeTimeSlots": "晚上10点-凌晨2点",
            "readingSpeed": "沉浸型",
            "genreTags": ["文学", "情感分析", "心理描写"],
            "highlightStyle": "金句狙击型——偏好短小精悍的致命比喻"
        },
        "insightScores": [
            {"label": "文字敏感度", "score": 94, "description": "对修辞和比喻的感知力极强"},
            {"label": "情感洞察力", "score": 88, "description": "能从一段感情中读出结构性矛盾"},
            {"label": "社会观察力", "score": 72, "description": "对社会规范如何塑造个人情感的敏感度"}
        ],
        "companionComment": "有一个细节我注意到了——你在张爱玲写得最冷的句子旁边划线最多。你不像是在'享受'她的文字，更像是在'研究'她是怎么做到的。这种距离感其实挺像张爱玲自己的——她不写温暖的感情，她写感情的病理学。你好像也本能地在读病理，而不是在读浪漫。",
        "shareCardData": {
            "title": "阅读人设",
            "personaEmoji": "🔬",
            "personaTitle": "情感解剖师",
            "stats": [
                {"icon": "📖", "label": "共阅读", "value": "1 本"},
                {"icon": "✏️", "label": "划线", "value": "32 条"},
                {"icon": "🌙", "label": "活跃时段", "value": "深夜读者"},
                {"icon": "🎯", "label": "偏好", "value": "情感与关系结构"}
            ]
        }
    },
}

_COLLISION_DEMO = {
    "万历十五年": {
        "author": "黄仁宇",
        "totalHotHighlights": 12,
        "userHighlightCount": 48,
        "overlapCount": 3,
        "collisions": [
            {
                "id": "pc_1",
                "hotHighlight": {
                    "text": "就算贵为天子，也不过是一种制度所需要的产物。",
                    "chapter": "第一章 万历皇帝",
                    "likeCount": 2847
                },
                "userHighlight": {
                    "text": "难道一个人熟读经史，文笔华美，就具备了在御前为皇帝作顾问的条件？难道学术上造诣深厚，就能成为大政治家？",
                    "chapter": "申时行章节"
                },
                "collisionType": "独到",
                "insight": "大多数读者被万历皇帝个人的悲剧击中——'皇帝也是制度的产物'。但你注意到了另一个层次：当皇帝的问题出在'制度'时，他身边那些'熟读经史'的官僚，同样被困在同一个系统里。你在看系统内部的人，多数读者在看系统顶端的人。",
                "provocation": "如果万历不是皇帝而是内阁首辅，他的个人悲剧还会发生吗？"
            },
            {
                "id": "pc_2",
                "hotHighlight": {
                    "text": "朝廷最大的任务是促进文官之间的互相信赖与和谐。",
                    "chapter": "第二章 申时行",
                    "likeCount": 1932
                },
                "userHighlight": {
                    "text": "但国家的最大问题也就是文官",
                    "chapter": "第二章"
                },
                "collisionType": "分歧",
                "insight": "这是一个很有意思的对照。热门划线选了黄仁宇描述'文官和谐'的句子，像是在肯定一种理想秩序。但你紧接着划了后面的那句'国家的问题是文官'——你好像特别警惕作者表面上的描述，总是等着看他笔锋一转。这种阅读直觉让人想起侦探读案卷，而不是游客逛博物馆。",
                "provocation": "黄仁宇自己到底站哪边？他是在客观描述，还是在借历史人物之口说自己的话？"
            },
            {
                "id": "pc_3",
                "hotHighlight": {
                    "text": "清官真的能救一个系统吗？",
                    "chapter": "海瑞章节",
                    "likeCount": 3201
                },
                "userHighlight": {
                    "text": "道德不是万能。它不能代替技术，更不能代替制度。",
                    "chapter": "海瑞章节"
                },
                "collisionType": "互补",
                "insight": "热门读者在海瑞的故事里感受到的是'悲壮'——一个清官对抗一个系统。但你关注的是黄仁宇从海瑞事件中提炼出来的那个冷静的结论：道德不能救国。你好像比大多数读者更快地跨过了'感动'，直接进入了'分析'。",
                "provocation": "如果海瑞本人读到黄仁宇对他的评价——'道德不是万能'——他会认同，还是会觉得被背叛？"
            },
            {
                "id": "pc_4",
                "hotHighlight": {
                    "text": "中国两千年来，以道德代替法制，至明代而极。",
                    "chapter": "结论章节",
                    "likeCount": 4218
                },
                "userHighlight": None,
                "collisionType": "共鸣",
                "insight": "这是全书最热门的划线——黄仁宇的终极判断。虽然你没有在这段上划线，但你其他章节的标注（关于申时行的无奈、海瑞的孤独、张居正的困境）其实一直在为这个结论提供具体案例。你在用自己的方式接近同一个答案，只是你选择了从'人的故事'进入，而黄仁宇从'制度的逻辑'进入。殊途同归。",
                "provocation": "如果你可以给一万个微信读书读者推荐你的第一条划线，你会推荐哪一条？"
            }
        ],
        "companionSummary": "做了个小小的人格画像，基于你的划线习惯推测的。你有没有发现，你对《万历十五年》的反应跟大多数微信读书读者形成了一个特别有意思的夹角？别人在读'人'，你在读'结构'。这不是谁对谁错——是两种不同的阅读基因。"
    },
    "红玫瑰与白玫瑰": {
        "author": "张爱玲",
        "totalHotHighlights": 8,
        "userHighlightCount": 32,
        "overlapCount": 2,
        "collisions": [
            {
                "id": "pc_5",
                "hotHighlight": {
                    "text": "也许每一个男子全都有过这样的两个女人，至少两个。",
                    "chapter": "正文",
                    "likeCount": 5632
                },
                "userHighlight": {
                    "text": "振保很知道，和一个女人发生关系之前，是必须下一些决心的。",
                    "chapter": "正文"
                },
                "collisionType": "独到",
                "insight": "大多数人被张爱玲那个著名的红白玫瑰比喻抓住——它太精巧了，一读完就想划线。但你注意到的却是振保的'决心'——一个男人在感情里的计算和权衡。你好像在读振保的行为逻辑，而不是在欣赏张爱玲的修辞。这种读法更冷，但也许更接近张爱玲的本意。",
                "provocation": "振保的'决心'是爱还是表演？他是在选择感情，还是在选择那个'正确的人设'？"
            }
        ],
        "companionSummary": "说起来挺有意思的——你读张爱玲的时候好像在读一本'关系逻辑学'教材。你不是在感受爱情的甜蜜或痛苦，你是在解构它。这份距离感，说实话，跟张爱玲自己写东西时的态度有点像。"
    },
}


# ==========================================
# WeRead 深度集成端点
# ==========================================

@router.get("/community/public-highlights", response_model=PublicHighlightsResponse)
async def get_public_highlights(book_title: str, limit: int = 6):
    """获取微信读书公开热门划线，为社区提供冷启动内容"""
    demo = _PUBLIC_HIGHLIGHTS_DEMO.get(book_title)
    if not demo:
        return PublicHighlightsResponse(
            success=True,
            bookTitle=book_title,
            bookAuthor="",
            highlights=[]
        )
    highlights = demo["highlights"][:limit]
    return PublicHighlightsResponse(
        success=True,
        bookTitle=book_title,
        bookAuthor=demo["author"],
        highlights=highlights
    )


@router.get("/persona", response_model=PersonaResponse)
async def get_reading_persona(book_title: str):
    """生成阅读人设卡片——分析划线习惯，描绘阅读人格"""
    demo = _PERSONA_DEMO.get(book_title)
    if not demo:
        return PersonaResponse(success=True)
    return PersonaResponse(
        success=True,
        personaTitle=demo["personaTitle"],
        personaDescription=demo["personaDescription"],
        readingStats=demo["readingStats"],
        insightScores=demo["insightScores"],
        companionComment=demo["companionComment"],
        shareCardData=demo.get("shareCardData")
    )


@router.get("/perspective-collision", response_model=PerspectiveCollisionResponse)
async def get_perspective_collision(book_title: str):
    """对比微信读书热门划线与用户个人划线，发现阅读视角的碰撞"""
    demo = _COLLISION_DEMO.get(book_title)
    if not demo:
        return PerspectiveCollisionResponse(success=True, bookTitle=book_title)
    return PerspectiveCollisionResponse(
        success=True,
        bookTitle=book_title,
        bookAuthor=demo["author"],
        totalHotHighlights=demo["totalHotHighlights"],
        userHighlightCount=demo["userHighlightCount"],
        overlapCount=demo["overlapCount"],
        collisions=demo["collisions"],
        companionSummary=demo["companionSummary"]
    )
