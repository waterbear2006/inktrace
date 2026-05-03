"""
文件上传路由
支持上传原著和待处理笔记，上传后自动触发清洗流程
"""

import os
import uuid
import shutil
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

from backend.core.store import store
from backend.services.note_orchestrator import NoteOrchestrator

router = APIRouter(prefix="/api/v1/upload", tags=["upload"])

# 上传目录配置
UPLOAD_BASE_DIR = os.path.join("data", "uploads")
ORIGINALS_DIR = os.path.join("data", "source_books")
DIRTY_DIR = os.path.join("data", "raw_notes")
OUTPUT_DIR = os.path.join("data", "output")

# 允许的文件类型
ALLOWED_EXTENSIONS = {'.txt', '.md'}
ALLOWED_MIME_TYPES = {'text/plain', 'text/markdown'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

orchestrator = NoteOrchestrator()


class UploadResponse(BaseModel):
    success: bool
    fileId: str
    type: str
    status: str
    title: str
    message: str


def ensure_dirs():
    """确保上传目录存在"""
    os.makedirs(UPLOAD_BASE_DIR, exist_ok=True)
    os.makedirs(ORIGINALS_DIR, exist_ok=True)
    os.makedirs(DIRTY_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)


def validate_file(file: UploadFile) -> tuple[bool, str]:
    """验证文件类型和大小"""
    # 检查文件扩展名
    filename = file.filename or ""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"不支持的文件类型: {ext}，仅支持 {', '.join(ALLOWED_EXTENSIONS)}"
    
    # 检查 MIME 类型
    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        return False, f"不支持的文件格式: {file.content_type}"
    
    return True, ""


async def process_dirty_note(file_path: str, file_id: str, title: str):
    """后台任务：清洗脏笔记"""
    try:
        # 读取文件内容
        with open(file_path, 'r', encoding='utf-8') as f:
            raw_text = f.read()
        
        if not raw_text or len(raw_text.strip()) < 5:
            print(f"[清洗任务] 文件内容太短，跳过清洗: {title}")
            return
        
        # 更新状态为处理中
        if file_id in store.books:
            store.books[file_id]["status"] = "清洗中"
            store.books[file_id]["progress"] = 10
            store.books[file_id]["statusColor"] = "bg-blue-400"
        
        # 调用清洗引擎
        processing_text = raw_text[:8000]
        clean_markdown = await orchestrator.process_all_notes(
            processing_text,
            enable_l3=True,
            enable_l4=True
        )
        
        # 保存清洗结果到 output 目录
        output_subdir = os.path.join(OUTPUT_DIR, title.replace("《", "").replace("》", ""))
        os.makedirs(output_subdir, exist_ok=True)
        
        output_file = os.path.join(output_subdir, f"{title}_Notes.md")
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(clean_markdown)
        
        # 更新状态为完成
        if file_id in store.books:
            store.books[file_id]["status"] = "已完成"
            store.books[file_id]["progress"] = 100
            store.books[file_id]["statusColor"] = "bg-green-500"
            store.books[file_id]["isError"] = False
        
        # 创建 DeepWork session，确保用户能正常进入工作区
        try:
            import json
            from datetime import datetime
            from backend.api.routes_deepwork import load_sessions, save_sessions
            sessions = load_sessions()
            session_data = {
                "user_id": "default_user",
                "note_id": file_id,
                "chat_history": [],
                "right_cards": [],
                "final_markdown": clean_markdown,
                "last_updated": datetime.now().isoformat()
            }
            existing_index = next((i for i, s in enumerate(sessions)
                                if s["user_id"] == "default_user" and s["note_id"] == file_id), None)
            if existing_index is not None:
                sessions[existing_index] = session_data
            else:
                sessions.append(session_data)
            save_sessions(sessions)
            print(f"[清洗任务] 已创建 DeepWork session: {file_id}")
        except Exception as e:
            print(f"[清洗任务] 创建 DeepWork session 失败: {file_id}, {str(e)}")
        
        print(f"[清洗任务] 完成: {title}")
        
    except Exception as e:
        print(f"[清洗任务] 失败: {title}, 错误: {str(e)}")
        if file_id in store.books:
            store.books[file_id]["status"] = "清洗失败"
            store.books[file_id]["statusColor"] = "bg-red-500"
            store.books[file_id]["isError"] = True


@router.post("/file", response_model=UploadResponse)
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    type: str = Form(...),
    filename: Optional[str] = Form(None)
):
    """
    上传文件接口
    
    - file: 文件二进制
    - type: "original" (原著) 或 "dirty" (待处理笔记)
    - filename: 可选，自定义文件名
    """
    ensure_dirs()
    
    # 校验类型
    if type not in {"original", "dirty"}:
        raise HTTPException(status_code=400, detail="类型必须是 'original' 或 'dirty'")
    
    # 校验文件
    is_valid, error_msg = validate_file(file)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    # 生成文件ID和确定存储路径
    raw_id = str(uuid.uuid4())[:8]
    # 脏笔记使用 note_ 前缀，与后端清洗流程生成的 note_id 保持一致
    file_id = f"note_{raw_id}" if type == "dirty" else raw_id
    original_filename = filename or file.filename or "untitled.txt"
    safe_filename = os.path.splitext(original_filename)[0] + ".txt"
    
    if type == "original":
        target_dir = ORIGINALS_DIR
        file_path = os.path.join(target_dir, safe_filename)
        status = "已连接"
        status_color = "bg-green-500"
        progress = 100
        is_error = False
        source = "Library"
        author = "原著全文"
    else:
        target_dir = DIRTY_DIR
        file_path = os.path.join(target_dir, safe_filename)
        status = "待清洗"
        status_color = "bg-red-500"
        progress = 0
        is_error = True
        source = "Dirty Notes"
        author = "待处理笔记"
    
    # 保存文件
    try:
        with open(file_path, 'wb') as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件保存失败: {str(e)}")
    finally:
        file.file.close()
    
    # 添加到 store
    store.books[file_id] = {
        "id": file_id,
        "title": os.path.splitext(safe_filename)[0],
        "author": author,
        "source": source,
        "progress": progress,
        "status": status,
        "statusColor": status_color,
        "isError": is_error,
        "img": "",
        "filePath": file_path,
        "uploadTime": str(uuid.uuid1())  # 简化时间戳
    }
    
    # 如果是脏笔记，后台触发清洗
    if type == "dirty":
        background_tasks.add_task(
            process_dirty_note,
            file_path,
            file_id,
            os.path.splitext(safe_filename)[0]
        )
        status = "清洗中"
    
    return UploadResponse(
        success=True,
        fileId=file_id,
        type=type,
        status=status,
        title=os.path.splitext(safe_filename)[0],
        message="上传成功" + ("，正在后台清洗..." if type == "dirty" else "")
    )


@router.get("/status/{file_id}")
async def get_upload_status(file_id: str):
    """获取文件处理状态"""
    if file_id not in store.books:
        raise HTTPException(status_code=404, detail="文件不存在")
    
    book = store.books[file_id]
    return {
        "fileId": file_id,
        "status": book.get("status", "未知"),
        "progress": book.get("progress", 0),
        "title": book.get("title", ""),
        "isError": book.get("isError", False)
    }
