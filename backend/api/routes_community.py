"""社区 API —— 分享笔记到社区 + 获取社区 Feed"""

import json
import os
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/api/v1/community", tags=["community"])

COMMUNITY_FILE = os.path.join("data", "community_posts.json")
tz = timezone(timedelta(hours=8))  # 北京时间


def _load_posts() -> list:
    if os.path.exists(COMMUNITY_FILE):
        with open(COMMUNITY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def _save_posts(posts: list):
    os.makedirs(os.path.dirname(COMMUNITY_FILE), exist_ok=True)
    with open(COMMUNITY_FILE, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)


class ShareRequest(BaseModel):
    author_name: str = "逸尘"
    book_title: str
    content: str  # 笔记原文
    quote: str = ""  # 摘录的简短引用
    thought: str = ""  # 用户附加的想法
    post_type: str = "思考"  # 思考/困惑/荐书/攻略


@router.post("/share")
async def share_to_community(request: ShareRequest):
    """分享一条笔记到社区。"""
    posts = _load_posts()
    post = {
        "id": str(uuid.uuid4())[:8],
        "author_name": request.author_name,
        "book_title": request.book_title,
        "content": request.content,
        "quote": request.quote or request.content[:80],
        "thought": request.thought,
        "type": request.post_type,
        "created_at": datetime.now(tz).isoformat(),
        "likes": 0,
        "comments": 0,
    }
    posts.insert(0, post)
    _save_posts(posts)
    return {"success": True, "post": post}


@router.get("/feed")
async def get_community_feed(
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    post_type: str = Query("全部"),
):
    """获取社区帖子流，按时间倒序，支持类型筛选。"""
    posts = _load_posts()
    if post_type != "全部":
        posts = [p for p in posts if p.get("type") == post_type]
    total = len(posts)
    page = posts[offset:offset + limit]
    return {"posts": page, "total": total, "has_more": offset + limit < total}
