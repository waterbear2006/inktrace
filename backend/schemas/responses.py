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

class SemanticNetworkItem(BaseModel):
    term: str
    relation: Optional[str] = "关联"
    explanation: Optional[str] = None
    provocation: Optional[str] = None

class SemanticCardResponse(BaseModel):
    term: str
    explanation: str
    contextual_implication: str
    semantic_network: List[SemanticNetworkItem]
    reference_urls: List[ReferenceUrl]

class ChatResponse(BaseModel):
    reply: str


# ==========================================
# 跨书概念碰撞 (Cross-Book Collision)
# ==========================================

class CollisionTensionItem(BaseModel):
    """单条跨书碰撞结果"""
    book_title: str = Field(..., description="碰撞来源书籍名称")
    core_concept: str = Field(..., description="碰撞来源书籍中的核心概念")
    markdown: str = Field(..., description="完整笔记内容（含 L3 数据）")
    distance: float = Field(..., description="FAISS 向量距离（越小越相似）")
    relevance_score: float = Field(..., description="DeepSeek 综合相关性得分（0-1）")
    tension_type: str = Field(..., description="概念张力类型：支持/反驳/互补/案例化")
    tension_reason: str = Field(..., description="AI 生成的张力解释，1-2 句，口语化同伴口吻")
    provocation_question: str = Field(..., description="引发思考的追问，以问句结尾")


class CollisionResponse(BaseModel):
    """跨书概念碰撞的完整响应"""
    success: bool = True
    note_id: str = Field(..., description="触发碰撞的笔记 ID")
    source_book: str = Field(..., description="当前笔记所属书名")
    source_concept: str = Field(..., description="当前关注的核心概念")
    results: List[CollisionTensionItem] = Field(default_factory=list)
    total: int = Field(0)
    search_method: str = Field(default="faiss+deepseek", description="碰撞分析方法")


# ==========================================
# WeRead 深度集成 (Deep WeRead Integration)
# ==========================================

# --- 公开划线 ---
class ReaderQuote(BaseModel):
    username: str
    avatar: str = ""
    comment: str

class PublicHighlight(BaseModel):
    id: str
    text: str
    chapter: str
    likeCount: int
    readerCount: int
    readerQuotes: List[ReaderQuote] = []

class PublicHighlightsResponse(BaseModel):
    success: bool = True
    bookTitle: str = ""
    bookAuthor: str = ""
    source: str = "微信读书 · 公开划线"
    highlights: List[PublicHighlight] = []

# --- 阅读人设 ---
class InsightScore(BaseModel):
    label: str
    score: int
    description: str

class ShareCardStat(BaseModel):
    icon: str
    label: str
    value: str

class ShareCardData(BaseModel):
    title: str = "阅读人设"
    personaEmoji: str = ""
    personaTitle: str = ""
    stats: List[ShareCardStat] = []

class PersonaResponse(BaseModel):
    success: bool = True
    personaTitle: str = ""
    personaDescription: str = ""
    readingStats: dict = {}
    insightScores: List[InsightScore] = []
    companionComment: str = ""
    shareCardData: Optional[ShareCardData] = None

# --- 视角碰撞 ---
class HotHighlightItem(BaseModel):
    text: str
    chapter: str
    likeCount: int

class UserHighlightItem(BaseModel):
    text: Optional[str] = None
    chapter: Optional[str] = None

class PerspectiveCollisionItem(BaseModel):
    id: str
    hotHighlight: HotHighlightItem
    userHighlight: Optional[UserHighlightItem] = None
    collisionType: str = Field(..., description="共鸣 / 独到 / 分歧")
    insight: str
    provocation: str

class PerspectiveCollisionResponse(BaseModel):
    success: bool = True
    bookTitle: str = ""
    bookAuthor: str = ""
    totalHotHighlights: int = 0
    userHighlightCount: int = 0
    overlapCount: int = 0
    collisions: List[PerspectiveCollisionItem] = []
    companionSummary: str = ""