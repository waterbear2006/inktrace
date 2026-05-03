# backend/api/routes_notes.py
import uuid
import asyncio
import json
import os
import traceback
from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import Response
from backend.core.store import store
from backend.core.config import settings
from backend.schemas.requests import ProcessNoteRequest, SemanticCardRequest
from backend.schemas.responses import JobStatusResponse, NoteResponse, SemanticCardResponse, ProcessBookResponse
from backend.services.llm_service import AsyncLLMService
from backend.core.prompts_demo import SEMANTIC_CARD_PROMPT

router = APIRouter(prefix="/api/v1/notes", tags=["notes"])
llm_service = AsyncLLMService()

from backend.services.note_orchestrator import NoteOrchestrator

orchestrator = NoteOrchestrator()

async def run_processing_task(job_id: str, raw_text: str, full_book_text: str = "", original_note_id: str = ""):
    """
    后台任务：执行完整的清洗流程并更新进度
    """
    print(f"🎬 [run_processing_task] 开始执行任务: {job_id}")
    
    try:
        # 更新状态为处理中
        store.jobs[job_id]["status"] = "processing"
        
        # 定义进度回调函数（必须是async，因为orchestrator会await它）
        async def update_progress(progress: int, status_msg: str = ""):
            store.jobs[job_id]["progress"] = progress
            if status_msg:
                print(f"📊 [{job_id}] 进度: {progress}% - {status_msg}")
        
        # 执行清洗流程
        await update_progress(5, "开始解析原始笔记...")
        
        final_markdown = await orchestrator.process_all_notes(
            raw_text=raw_text,
            enable_l3=True,
            enable_l4=True,
            on_progress=update_progress
        )
        
        # 任务完成
        store.jobs[job_id]["status"] = "completed"
        store.jobs[job_id]["progress"] = 100
        # 使用原始note_id（如果有），否则使用job_id生成
        result_note_id = original_note_id or f"note_{job_id[:8]}"
        store.jobs[job_id]["result"] = {
            "note_id": result_note_id,
            "status": "success",
            "final_markdown": final_markdown,
            "books_detected": 1,
            "notes_processed": 1,
            "processing_time_sec": 0.0
        }
        
        print(f"✅ [run_processing_task] 任务完成: {job_id}")
        
    except Exception as e:
        print(f"❌ [run_processing_task] 任务失败: {job_id}")
        print(f"❌ 错误详情: {str(e)}")
        import traceback
        traceback.print_exc()
        
        store.jobs[job_id]["status"] = "failed"
        store.jobs[job_id]["result"] = {
            "error": str(e),
            "message": f"处理失败: {str(e)}"
        }

# ==========================================
# 笔记处理 API
# ==============================================

@router.post("/process", response_model=JobStatusResponse)
async def process_note(request: ProcessNoteRequest, background_tasks: BackgroundTasks):
    """
    接收前端提交的原始笔记，创建后台任务进行清洗。
    立即返回 job_id，前端通过轮询 /status/{job_id} 获取进度。
    """
    job_id = str(uuid.uuid4())
    store.jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "progress": 0,
        "result": None
    }

    # 启动后台任务
    background_tasks.add_task(
        orchestrator.process_note_task,
        job_id=job_id,
        raw_text=request.raw_text,
        full_book_text=request.full_book_text,
        enable_ai_structuring=request.enable_ai_structuring,
        enable_glossary=request.enable_glossary
    )

    return JobStatusResponse(
        job_id=job_id,
        status="pending",
        progress=0
    )


@router.post("/process_book/{note_id}", response_model=ProcessBookResponse)
async def process_book_by_id(note_id: str, background_tasks: BackgroundTasks):
    """
    根据笔记ID（如 note_xxxx）触发清洗流程。
    自动从数据目录读取原始笔记和对应原著，创建后台任务。
    """
    print(f"🚀 [process_book] 收到清洗请求: note_id={note_id}")
    
    # 1. 在 store 中查找笔记信息
    book = store.books.get(note_id)
    if not book:
        print(f"❌ [process_book] 未找到笔记: {note_id}")
        raise HTTPException(status_code=404, detail=f"Note not found: {note_id}")
    
    title = book.get("title", "Unknown")
    print(f"📖 [process_book] 找到书籍: {title}")
    
    # 2. 构建数据目录路径
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    
    # 查找原始笔记文件
    raw_notes_dir = os.path.join(base_dir, "data", "raw_notes")
    source_books_dir = os.path.join(base_dir, "data", "source_books")
    
    raw_text = None
    full_book_text = None
    
    # 尝试多种可能的文件名格式查找原始笔记
    title_no_brackets = title.replace("《", "").replace("》", "")
    possible_note_files = [
        os.path.join(raw_notes_dir, f"{title}.txt"),
        os.path.join(raw_notes_dir, f"{title_no_brackets}.txt"),
        os.path.join(raw_notes_dir, f"{title}.md"),
        os.path.join(raw_notes_dir, f"{title_no_brackets}.md"),
    ]
    
    for note_file in possible_note_files:
        if os.path.exists(note_file):
            with open(note_file, "r", encoding="utf-8") as f:
                raw_text = f.read()
            print(f"✅ [process_book] 找到原始笔记: {note_file} ({len(raw_text)} 字符)")
            break
    
    if not raw_text:
        # 尝试扫描整个目录
        if os.path.exists(raw_notes_dir):
            for root, dirs, files in os.walk(raw_notes_dir):
                for f in files:
                    if f.endswith(('.txt', '.md')):
                        if title_no_brackets in f or title in f:
                            file_path = os.path.join(root, f)
                            with open(file_path, "r", encoding="utf-8") as fh:
                                raw_text = fh.read()
                            print(f"✅ [process_book] 通过扫描找到: {file_path} ({len(raw_text)} 字符)")
                            break
                if raw_text:
                    break
    
    if not raw_text:
        print(f"❌ [process_book] 未找到原始笔记文件! title={title}")
        raise HTTPException(
            status_code=404,
            detail=f"Raw notes file not found for: {title}\nChecked paths: {possible_note_files}"
        )
    
    # 查找原著文件（可选）
    core_name = title_no_brackets.replace("notes", "").replace("Notes", "").strip()
    if core_name and len(core_name) >= 2:
        possible_book_files = [
            os.path.join(source_books_dir, f"{core_name}.txt"),
            os.path.join(source_books_dir, f"《{core_name}》.txt"),
            os.path.join(source_books_dir, f"{core_name}.md"),
        ]
        
        for book_file in possible_book_files:
            if os.path.exists(book_file):
                with open(book_file, "r", encoding="utf-8") as f:
                    full_book_text = f.read()
                print(f"✅ [process_book] 找到原著: {book_file} ({len(full_book_text)} 字符)")
                break
    
    # 3. 创建后台任务
    job_id = str(uuid.uuid4())
    store.jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "progress": 0,
        "result": None,
        "note_id": note_id
    }
    
    print(f"🎯 [process_book] 创建任务: job_id={job_id}")
    
    # 启动后台任务
    background_tasks.add_task(
        run_processing_task,
        job_id=job_id,
        raw_text=raw_text,
        full_book_text=full_book_text or "",
        original_note_id=note_id  # 传递原始note_id用于结果匹配
    )
    
    # 检测原著状态并生成提示
    has_source_book = bool(full_book_text)
    source_book_status = "found" if has_source_book else "missing"
    
    warning_message = None
    if not has_source_book:
        core_name_display = title_no_brackets.replace("notes", "").replace("Notes", "").strip()
        warning_message = (
            f"⚠️ 未检测到《{core_name_display}》原著全文\n\n"
            f"影响：\n"
            f"• L2 文本修复与对齐：跳过\n"
            f"• L3 AI深度语义分析：跳过\n"
            f"• L4 知识网络构建：降级\n\n"
            f"建议：将原著文件放到 data/source_books/ 目录以启用完整功能"
        )
        print(f"⚠️ [process_book] 原著缺失警告: {title}")
    
    return ProcessBookResponse(
        job_id=job_id,
        status="pending",
        progress=0,
        has_source_book=has_source_book,
        source_book_status=source_book_status,
        warning_message=warning_message
    )


@router.get("/status/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """查询任务状态"""
    job = store.jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return JobStatusResponse(
        job_id=job["job_id"],
        status=job["status"],
        progress=job["progress"],
        result=job.get("result")
    )


@router.get("/{note_id}/content")
async def get_note_content(note_id: str):
    """
    根据 note_id 获取笔记的清洗后内容
    优先从文件系统读取，如果不存在则从内存中的任务结果获取
    """
    try:
        # 在 store.books 中查找对应的笔记（store.books 是字典）
        book = store.books.get(note_id)
        if not book:
            raise HTTPException(status_code=404, detail="Note not found")
        
        title = book["title"]
        
        print(f"🔍 [get_note_content] 查找笔记: note_id={note_id}, title={title}")
        
        # 策略1：尝试从文件系统读取
        content = await _try_read_from_filesystem(note_id, title)
        if content:
            return {"success": True, "content": content, "note_id": note_id}
        
        # 策略2：从内存中的任务结果获取
        content = await _try_read_from_memory(note_id)
        if content:
            return {"success": True, "content": content, "note_id": note_id}
        
        # 都没找到
        raise HTTPException(status_code=404, detail="Note content not found")
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"🔥 get_note_content 崩溃: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


async def _try_read_from_filesystem(note_id: str, title: str) -> str | None:
    """尝试从文件系统读取笔记内容"""
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    output_dir = os.path.join(base_dir, "data", "output")
    
    title_no_brackets = title.replace("《", "").replace("》", "")
    core_name = title_no_brackets.replace("notes", "").replace("Notes", "").strip()
    if not core_name:
        core_name = title_no_brackets
    
    possible_paths = [
        os.path.join(output_dir, f"{title_no_brackets}_Notes", f"{title}_Notes.md"),
        os.path.join(output_dir, f"{title_no_brackets}", f"{title}_Notes.md"),
        os.path.join(output_dir, f"{title_no_brackets}_Notes.md"),
        os.path.join(output_dir, f"{title}_Notes.md"),
        os.path.join(output_dir, title_no_brackets, f"{title}_Notes.md"),
        os.path.join(output_dir, title, f"{title}_Notes.md"),
        os.path.join(output_dir, title_no_brackets, f"{title_no_brackets}_Notes.md"),
        os.path.join(output_dir, core_name, f"{core_name}_Notes.md"),
        os.path.join(output_dir, core_name, f"《{core_name}》_Notes.md"),
    ]
    
    if os.path.exists(output_dir):
        for root, dirs, files in os.walk(output_dir):
            for f in files:
                if f.endswith('.md'):
                    if title_no_brackets in f or title in f:
                        possible_paths.append(os.path.join(root, f))
                    elif core_name and core_name in f and len(core_name) >= 2:
                        possible_paths.append(os.path.join(root, f))
    
    for path in possible_paths:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
                print(f"📁 [get_note_content] 从文件系统找到: {path} ({len(content)} 字符)")
                return content
    
    return None


async def _try_read_from_memory(note_id: str) -> str | None:
    """从内存中的已完成任务结果获取内容"""
    for job_id, job_data in store.jobs.items():
        if job_data.get("status") == "completed":
            result = job_data.get("result", {})
            result_note_id = result.get("note_id", "")
            
            if result_note_id == note_id or job_id.startswith(note_id[:8]) if len(note_id) > 8 else False:
                final_markdown = result.get("final_markdown")
                if final_markdown:
                    print(f"🧠 [get_note_content] 从内存中找到: job_id={job_id}, {len(final_markdown)} 字符)")
                    return final_markdown
    
    return None


# 语义抽屉 (Semantic Drawer) API
# ---------------------------------------------
@router.post("/{note_id}/semantic", response_model=SemanticCardResponse)
async def get_semantic_card(note_id: str, request: SemanticCardRequest):
    """
    根据前端传来的特定术语 (term) 和段落 (text)，
    实时生成带互联网引证 URL 的深度语义卡片。
    """
    term = request.term
    text = request.text
    
    prompt = SEMANTIC_CARD_PROMPT.format(
        highlighted_text=text,
        term=term
    )
    
    try:
        # 调用大模型生成 JSON
        result_json = await llm_service.generate_json(prompt, system_msg="你是一个严谨的学术分析器。")
        
        # 将结果缓存在 store 中以备重复读取 (可选)
        store.semantic_cards[note_id] = result_json
        
        # 确保返回数据格式正确
        # semantic_network 可能是对象列表，需要转换为字符串列表
        semantic_network = result_json.get("semantic_network", [])
        if semantic_network and isinstance(semantic_network[0], dict):
            semantic_network = [item.get("term", str(item)) for item in semantic_network]
        
        # reference_urls 确保是列表
        reference_urls = result_json.get("reference_urls", [])
        if not reference_urls:
            reference_urls = []
            
        return SemanticCardResponse(
            term=result_json.get("term", term),
            explanation=result_json.get("explanation", ""),
            contextual_implication=result_json.get("contextual_implication", ""),
            semantic_network=semantic_network,
            reference_urls=reference_urls
        )
    except Exception as e:
        print(f"Semantic generation error: {e}")
        # 如果大模型超时或失败，返回一个 Demo 的默认数据
        return SemanticCardResponse(
            term=term,
            explanation=f"关于「{term}」的解释暂时无法从云端获取。",
            contextual_implication="可能网络波动导致了信息断裂。",
            semantic_network=["网络异常", "重试"],
            reference_urls=[
                {"title": "维基百科首页", "url": "https://zh.wikipedia.org"}
            ]
        )
