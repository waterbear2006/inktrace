from fastapi import APIRouter
from backend.core.store import store
from backend.schemas.responses import LibraryResponse
import json
import os

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
