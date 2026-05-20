from fastapi import APIRouter, HTTPException, BackgroundTasks
from backend.core.store import store
from backend.schemas.responses import LibraryResponse
from backend.services.semantic_index import get_index
import json
import os
import shutil
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/library", tags=["library"])

SESSIONS_FILE = os.path.join("data", "deepwork_sessions.json")

def load_deepwork_sessions():
    if not os.path.exists(SESSIONS_FILE):
        return []
    try:
        with open(SESSIONS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return []

@router.get("/books", response_model=LibraryResponse)
async def get_library_books():
    """
    获取图书馆预置的书籍列表。
    这些数据来自对 data 目录的实时扫描。
    同时检查每条笔记是否有 DeepWork 内容。
    """
    sessions = load_deepwork_sessions()
    notes_with_deepwork = {s["note_id"] for s in sessions if s.get("right_cards") or s.get("chat_history")}

    books = list(store.books.values())
    for book in books:
        has_deep_work = book["id"] in notes_with_deepwork
        book["hasDeepWorkContent"] = has_deep_work

        # 如果有 DeepWork 内容，更新状态显示
        if has_deep_work:
            book["status"] = "已深度思考"
            book["statusColor"] = "bg-amber-500"
            book["progress"] = 100
            book["isError"] = False

    return LibraryResponse(books=books)

@router.post("/refresh")
async def refresh_library():
    """
    手动触发磁盘扫描，同步 data 文件夹下的新文件。
    """
    store.reset()
    return {"status": "success", "count": len(store.books)}


@router.delete("/books/{book_id}")
async def delete_book(book_id: str, background_tasks: BackgroundTasks):
    """
    删除指定图书及其关联的所有文件：
    - data/source_books/ 或 data/raw_notes/ 下的源文件
    - data/output/ 下的清洗结果
    - L3 缓存中对应的条目
    - 语义搜索索引中对应的记录
    """
    book = store.books.get(book_id)
    if not book:
        raise HTTPException(status_code=404, detail=f"未找到 ID 为 {book_id} 的书籍")

    title = book.get("title", "")
    source = book.get("source", "")
    current_file = os.path.abspath(__file__)
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(current_file)))
    deleted_files = []
    errors = []

    # 1. 删除源文件
    if source == "Library":
        search_dir = os.path.join(base_dir, "data", "source_books")
    elif source == "WeRead":
        search_dir = os.path.join(base_dir, "data", "raw_notes")
    else:
        search_dir = os.path.join(base_dir, "data", "raw_notes")

    if os.path.exists(search_dir):
        for root, dirs, files in os.walk(search_dir):
            for f in files:
                file_title = os.path.splitext(f)[0]
                clean_title = title.replace("《", "").replace("》", "")
                if file_title == title or file_title == clean_title or title in file_title:
                    filepath = os.path.join(root, f)
                    try:
                        os.remove(filepath)
                        deleted_files.append(filepath)
                    except Exception as e:
                        errors.append(f"删除源文件失败 {filepath}: {e}")

    # 2. 删除 output 目录下的清洗结果
    output_dir = os.path.join(base_dir, "data", "output")
    if os.path.exists(output_dir):
        safe_title = "".join([c for c in title if c.isalnum() or c in (' ', '-', '_')]).strip()
        for item in os.listdir(output_dir):
            item_path = os.path.join(output_dir, item)
            if safe_title in item or title in item:
                try:
                    if os.path.isdir(item_path):
                        shutil.rmtree(item_path)
                    else:
                        os.remove(item_path)
                    deleted_files.append(item_path)
                except Exception as e:
                    errors.append(f"删除输出文件失败 {item_path}: {e}")

    # 3. 清理 L3 语义缓存中对应的条目
    cache_file = os.path.join(base_dir, "backend", "data", "l3_semantic_cache.json")
    alt_cache_file = os.path.join(base_dir, "data", "l3_semantic_cache.json")
    for cf in [cache_file, alt_cache_file]:
        if os.path.exists(cf):
            try:
                with open(cf, "r", encoding="utf-8") as fh:
                    cache_data = json.load(fh)
                keys_to_remove = [k for k in cache_data if title[:8] in k]
                for k in keys_to_remove:
                    del cache_data[k]
                with open(cf, "w", encoding="utf-8") as fh:
                    json.dump(cache_data, fh, ensure_ascii=False, indent=2)
                if keys_to_remove:
                    deleted_files.append(f"L3缓存: {len(keys_to_remove)} 条")
            except Exception as e:
                errors.append(f"清理L3缓存失败 {cf}: {e}")

    # 4. 从内存 store 中移除
    del store.books[book_id]

    # 5. 重建语义索引（后台执行，不阻塞响应）
    background_tasks.add_task(_rebuild_index_after_delete, title)

    logger.info(f"🗑️ 已删除书籍: {title} (ID: {book_id})")
    return {
        "success": True,
        "message": f"已删除《{title}》",
        "deleted_files": deleted_files,
        "errors": errors if errors else None
    }


def _rebuild_index_after_delete(book_title: str):
    """后台重建语义索引"""
    try:
        index = get_index()
        index.rebuild_from_files()
        logger.info(f"✅ 删除《{book_title}》后索引已重建: {len(index.metadata)} 条记录")
    except Exception as e:
        logger.error(f"❌ 删除后索引重建失败: {e}")


@router.get("/books/{book_id}/source")
async def get_book_source(book_id: str):
    """读取原著全文（仅 Library 类型）"""
    book = store.books.get(book_id)
    if not book:
        raise HTTPException(status_code=404, detail=f"未找到 ID 为 {book_id} 的书籍")
    if book.get("source") != "Library":
        raise HTTPException(status_code=400, detail="该书籍不是原著类型")

    title = book.get("title", "")
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    source_dir = os.path.join(base_dir, "data", "source_books")

    title_no_brackets = title.replace("《", "").replace("》", "")
    possible_paths = [
        os.path.join(source_dir, f"{title}.txt"),
        os.path.join(source_dir, f"{title_no_brackets}.txt"),
        os.path.join(source_dir, f"{title}.md"),
        os.path.join(source_dir, f"{title_no_brackets}.md"),
    ]

    for path in possible_paths:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            return {"success": True, "title": title, "content": content, "length": len(content)}

    # 递归搜索
    if os.path.exists(source_dir):
        for root, dirs, files in os.walk(source_dir):
            for f in files:
                if title_no_brackets in f or title in f:
                    filepath = os.path.join(root, f)
                    with open(filepath, "r", encoding="utf-8") as fh:
                        content = fh.read()
                    return {"success": True, "title": title, "content": content, "length": len(content)}

    raise HTTPException(status_code=404, detail=f"未找到原著文件: {title}")
