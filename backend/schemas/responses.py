# 接收前端的请求格式验证# 返回给前端的响应格式验证
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any

class NoteResponse(BaseModel):
    """返回给前端的最终结构化文档响应"""
    
    note_id: str = Field(..., description="笔记唯一标识")
    status: str = Field(..., description="处理状态：'success' 或 'degraded' (触发降级)")
    final_markdown: str = Field(..., description="可以直接渲染或导入腾讯文档的精美 Markdown")
    
    # 统计与可观测性数据（让前端可以展示一个酷炫的结算面板）
    books_detected: int = Field(0, description="识别到的书籍数量")
    notes_processed: int = Field(0, description="成功处理的笔记条数")
    processing_time_sec: float = Field(..., description="总处理耗时（秒）")
    
    message: Optional[str] = Field(
        None, 
        description="向用户展示的柔性提示，比如 '每个人的思考独一无二，InkTrace 只是增效，不是答案。'"
    )

class LibraryBook(BaseModel):
    id: str
    title: str
    author: str
    source: str
    progress: int
    status: str
    statusColor: str
    isError: bool
    img: str
    hasDeepWorkContent: bool = False

class LibraryResponse(BaseModel):
    books: List[LibraryBook]

class JobStatusResponse(BaseModel):
    job_id: str
    status: str  # pending, processing, completed, error
    progress: int
    result: Optional[NoteResponse] = None

class ProcessBookResponse(BaseModel):
    """清洗任务创建响应（包含原著状态）"""
    job_id: str
    status: str  # pending, processing, completed, error
    progress: int
    has_source_book: bool = Field(..., description="是否找到原著全文")
    source_book_status: str = Field(..., description="原著状态: found/missing")
    warning_message: Optional[str] = Field(None, description="如果无原著时的提示信息")
    result: Optional[NoteResponse] = None

class ReferenceUrl(BaseModel):
    title: str
    url: str

class SemanticCardResponse(BaseModel):
    term: str
    explanation: str
    contextual_implication: str
    semantic_network: List[str]
    reference_urls: List[ReferenceUrl]

class ChatResponse(BaseModel):
    reply: str