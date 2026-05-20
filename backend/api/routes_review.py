"""每日回顾 API —— 返回笔记卡片 + 跨书碰撞卡混合列表"""

import asyncio
import random
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import List, Optional
from backend.services.semantic_index import get_index
from backend.services.llm_service import AsyncLLMService

router = APIRouter(prefix="/api/v1/review", tags=["review"])


class DailyReviewRequest(BaseModel):
    count: int = 12
    exclude_hashes: List[str] = []
    collision_interval: int = 6  # 每 N 张笔记卡插入一张碰撞卡


@router.post("/daily")
async def get_daily_review(request: DailyReviewRequest):
    """
    返回每日回顾的混合卡片列表。
    - 随机采样笔记块
    - 每隔 collision_interval 张插入一张跨书碰撞卡
    - 如果没有足够数据做碰撞，返回纯笔记列表
    """
    index = get_index()
    if index.index.ntotal == 0:
        return {"cards": [], "total": 0}

    notes = index.get_random_notes(k=request.count * 2, exclude_hashes=request.exclude_hashes)
    if not notes:
        return {"cards": [], "total": 0}

    # 构建碰撞对（简单语义组合：取前 N 个两两配对做跨书 collide）
    collision_pairs = _build_collision_pairs(notes, index)

    # 交织：每 collision_interval 张笔记卡插入一张碰撞卡
    cards = []
    collision_idx = 0
    for i, note in enumerate(notes[:request.count]):
        cards.append({
            "type": "note",
            "data": {
                "book_title": note.get("book_title", ""),
                "core_concept": note.get("core_concept", ""),
                "markdown": note.get("markdown", ""),
                "md5_hash": note.get("md5_hash", ""),
                "distance": note.get("distance"),
            },
        })
        # 每隔几张贴一张碰撞卡
        if (i + 1) % request.collision_interval == 0 and collision_idx < len(collision_pairs):
            pair = collision_pairs[collision_idx]
            collision_idx += 1
            cards.append({
                "type": "collision",
                "data": {
                    "source_book": pair["source"].get("book_title", ""),
                    "source_concept": pair["source"].get("core_concept", ""),
                    "source_text": pair["source"].get("markdown", ""),
                    "target_book": pair["target"].get("book_title", ""),
                    "target_concept": pair["target"].get("core_concept", ""),
                    "target_text": pair["target"].get("markdown", ""),
                    "tension_type": pair.get("tension_type", ""),
                    "tension_reason": pair.get("tension_reason", ""),
                    "provocation_question": pair.get("provocation_question", ""),
                    "similarity": pair.get("similarity", 0),
                },
            })

    return {"cards": cards, "total": len(cards)}


@router.get("/collisions/teaser")
async def get_collision_teaser():
    """返回可用的跨书碰撞配对，用于库页面 teaser 提示"""
    index = get_index()
    if index.index.ntotal < 2:
        return {"pair": None, "cards": []}

    notes = index.get_random_notes(k=min(30, len(index.metadata)))
    pairs = _build_collision_pairs(notes, index)

    if not pairs:
        return {"pair": None, "cards": []}

    for p in pairs:
        book_a = p["source"].get("book_title", "")
        book_b = p["target"].get("book_title", "")
        if book_a and book_b and book_a != book_b:
            source_text = p["source"].get("markdown", "")
            target_text = p["target"].get("markdown", "")

            # 用 LLM 生成洞察
            analysis = await _analyze_collision(source_text, book_a, target_text, book_b)

            return {
                "pair": {
                    "book_a": book_a,
                    "book_b": book_b,
                    "similarity": p.get("similarity", 0),
                    "tension_type": analysis.get("tension_type", p.get("tension_type", "")),
                    "insight": analysis.get("insight", ""),
                    "provocation_question": analysis.get("provocation", p.get("provocation_question", "")),
                },
                "cards": [{
                    "type": "collision",
                    "data": {
                        "source_book": book_a,
                        "source_concept": p["source"].get("core_concept", ""),
                        "source_text": source_text,
                        "target_book": book_b,
                        "target_concept": p["target"].get("core_concept", ""),
                        "target_text": target_text,
                        "tension_type": analysis.get("tension_type", p.get("tension_type", "")),
                        "tension_reason": analysis.get("insight", p.get("tension_reason", "")),
                        "provocation_question": analysis.get("provocation", p.get("provocation_question", "")),
                        "similarity": p.get("similarity", 0),
                    },
                }],
            }

    return {"pair": None, "cards": []}


def _build_collision_pairs(notes: list, index) -> list:
    """在随机笔记列表中寻找跨书碰撞对。取每段笔记跨书最相似的匹配，不设硬阈值。"""
    pairs = []
    used = set()

    for i, note_a in enumerate(notes):
        book_a = note_a.get("book_title", "")
        text_a = note_a.get("core_concept", "") or note_a.get("markdown", "")

        results = index.search(text_a, top_k=20)
        for r in results:
            book_b = r.get("book_title", "")
            if book_b == book_a or not book_b:
                continue
            pair_key = tuple(sorted([note_a.get("md5_hash", ""), r.get("md5_hash", "")]))
            if pair_key in used:
                continue
            distance = r.get("distance", 0)
            similarity = round(1.0 / (1.0 + distance), 3)
            used.add(pair_key)
            pairs.append({
                "source": note_a,
                "target": r,
                "similarity": similarity,
                "tension_type": _guess_tension_type(note_a, r),
                "tension_reason": "两段笔记来自不同书籍，但语义上存在关联",
                "provocation_question": "它们在不同的语境里指向了同一个问题吗？",
            })
            break

        if len(pairs) >= 6:
            break

    return pairs


def _guess_tension_type(note_a: dict, note_b: dict) -> str:
    """基于相似度猜测 tension type（不调 LLM 的轻量版本）。"""
    return "互补"


async def _analyze_collision(source_text: str, source_book: str, target_text: str, target_book: str) -> dict:
    """用 LLM 生成跨书碰撞的洞察——口语化、1-2句话、像朋友分享发现。"""
    try:
        llm = AsyncLLMService()
        prompt = f"""你是阅读同伴，语气像朋友聊天。

两条来自不同书的笔记产生了有趣的碰撞，请简单说说它们之间的联系或张力。

《{source_book}》的笔记：
{source_text[:300]}

《{target_book}》的笔记：
{target_text[:300]}

请严格返回 JSON：
{{"insight": "1-2句话（50字内），口语化，像朋友分享发现", "tension_type": "支持/反驳/互补/案例化 四选一", "provocation": "一个让人好奇想继续探索的问题"}}"""

        result = await asyncio.wait_for(
            llm.generate_json(prompt, system_msg="你是阅读同伴——记性好、联想力强，但从不假装全知。口语化、谦虚、偶尔有点可爱。"),
            timeout=8.0
        )
        return result
    except Exception:
        return {
            "insight": f"《{source_book}》和《{target_book}》的两段笔记，在语义上意外地靠近",
            "tension_type": "互补",
            "provocation": "它们在不同的语境里指向了同一个问题吗？",
        }


class RecommendRequest(BaseModel):
    note_samples: List[str] = []  # 用户笔记摘要（核心概念+文本）
    owned_books: List[str] = []  # 已拥有的书名
    count: int = 4


@router.post("/recommendations")
async def get_recommendations(request: RecommendRequest):
    """
    基于用户笔记内容推荐书籍。
    分析笔记中的主题和兴趣方向，推荐可能感兴趣的阅读。
    如果 note_samples 为空，自动从语义索引中采样。
    """
    note_samples = request.note_samples
    if not note_samples:
        index = get_index()
        if index.index.ntotal == 0:
            return {"recommendations": [], "based_on": "还没有笔记数据，导入书籍并划线后即可获得推荐"}
        notes = index.get_random_notes(k=8)
        note_samples = [n.get("core_concept", "") + ": " + n.get("markdown", "")[:150] for n in notes]

    if not note_samples:
        return {"recommendations": [], "based_on": "还没有笔记数据，导入书籍并划线后即可获得推荐"}

    # 合并笔记样本
    combined_notes = "\n".join(
        f"- {note[:200]}" for note in request.note_samples[:8]
    )

    owned_hint = ""
    if request.owned_books:
        owned_hint = f"用户已读过的书：{'、'.join(request.owned_books[:8])}\n请注意不要推荐这些已读过的书，除非它们是不同译版或相关延伸读物。"

    try:
        llm = AsyncLLMService()
        prompt = f"""你是一位阅读推荐伙伴，擅长根据读者的笔记痕迹发现他们可能会被打动的下一本书。

用户的笔记片段：
{combined_notes}

{owned_hint}

请根据笔记中体现的兴趣方向、思维方式和关注主题，推荐 {request.count} 本书。
每本书需要有明确的推荐理由——为什么这些笔记暗示读者会喜欢这本书。

请严格返回 JSON 数组：
[
  {{"title": "书名", "author": "作者", "reason": "1句话推荐理由（30字内），连接用户的笔记特点，口语化"}}
]

推荐原则：
- 不要推荐用户已经读过的书
- 推荐要有依据，基于笔记中体现的阅读品味
- 兼顾经典与新锐，不要全是畅销书
- 优先推荐能够在思维上拓宽用户视野的书"""

        result = await asyncio.wait_for(
            llm.generate_json(prompt, system_msg="你是阅读推荐伙伴——博览群书、品味独特。你推荐的书总能让人眼前一亮。推荐基于读者的真实阅读痕迹，而非热门榜单。口语化、真诚。"),
            timeout=15.0
        )

        if isinstance(result, list):
            return {"recommendations": result, "based_on": f"基于 {len(request.note_samples)} 条笔记的阅读轨迹"}
        return {"recommendations": [], "based_on": "暂时无法生成推荐"}

    except Exception as e:
        return {"recommendations": [], "based_on": "推荐服务暂时不可用"}
