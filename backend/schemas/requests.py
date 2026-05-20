# 接收前端的请求格式验证
from pydantic import BaseModel, Field
from typing import Optional, List

class ProcessNoteRequest(BaseModel):
    """前端提交的原始笔记处理请求"""
    
    raw_text: str = Field(
        ..., 
        min_length=10, 
        description="用户导出的原始脏笔记文本（必填，至少10个字符）"
    )
    full_book_text: Optional[str] = Field(
        None, 
        description="原著全文文本。若提供，则开启 L2 原文辅助精确断句修复"
    )
    enable_ai_structuring: bool = Field(
        True, 
        description="是否启用 L3 AI 语义层（提取主题）。设为 False 相当于强制走纯净降级模式"
    )
    enable_glossary: bool = Field(
        True, 
        description="是否生成生僻字/术语解释"
    )

class ChatMessage(BaseModel):
    role: str = Field(..., description="user 或 assistant")
    content: str = Field(..., description="消息内容")

class ChatRequest(BaseModel):
    book_title: Optional[str] = Field(None, description="书籍名称")
    highlighted_text: str = Field(..., description="用户当前高亮或聚焦的笔记段落")
    history: List[ChatMessage] = Field(default_factory=list, description="历史对话上下文")
    message: str = Field(..., description="用户的新问题")

class SemanticCardRequest(BaseModel):
    term: str = Field(..., description="要解释的术语或文本标题")
    text: str = Field(..., description="包含该术语的完整上下文段落")