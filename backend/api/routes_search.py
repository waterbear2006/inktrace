# backend/api/routes_search.py
"""
L4 语义搜索 API 路由
结合 FAISS 向量检索 + DeepSeek 智能重排序
"""

import logging
import traceback
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.services.semantic_index import LocalSemanticIndex
from backend.services.llm_service import AsyncLLMService
from backend.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/search", tags=["L4 Semantic Search"])

# 初始化 L4 索引和 LLM 服务
l4_index = LocalSemanticIndex()
llm_service = AsyncLLMService()


class SearchResultItem(BaseModel):
    """单个搜索结果的响应模型"""
    book_title: str = Field(..., description="书籍名称")
    core_concept: str = Field(..., description="核心概念")
    markdown: str = Field(..., description="完整内容（含L3数据）")
    distance: float = Field(..., description="相似度距离（越小越相似）")
    relevance_score: float = Field(None, description="DeepSeek重排序后的相关性得分")
    ai_summary: Optional[str] = Field(None, description="AI生成的匹配原因摘要")


class SearchResponse(BaseModel):
    """搜索接口的统一响应格式"""
    success: bool = True
    query: str = Field(..., description="用户查询词")
    results: List[SearchResultItem] = Field(default_factory=list, description="搜索结果列表")
    total: int = Field(0, description="返回结果数量")
    search_method: str = Field("faiss+deepseek", description="使用的搜索方法")


@router.get("/semantic", response_model=SearchResponse)
async def semantic_search(
    q: str = Query(..., min_length=2, max_length=500, description="搜索关键词"),
    top_k: int = Query(default=5, ge=1, le=20, description="返回结果数量"),
    enable_ai_rerank: bool = Query(default=True, description="是否启用AI智能重排序"),
    book_filter: Optional[str] = Query(default=None, description="可选：限定搜索范围到某本书")
):
    """
    L4 语义搜索：基于 FAISS 向量索引 + DeepSeek 智能重排序
    
    功能说明：
    1. 先用 FAISS 进行快速向量检索，找到 top_k 个候选结果
    2. 可选地调用 DeepSeek 对结果进行智能重排序和摘要生成
    3. 返回包含原文、L3深度分析的完整知识卡片
    
    使用场景：
    - 跨书关联检索：查找不同书籍中关于同一概念的讨论
    - 知识图谱导航：从某个概念出发，探索相关的知识点
    - 深度学习辅助：在学习新概念时，找到已有的相关知识积累
    """
    
    try:
        # Step 1: FAISS 向量检索（快速但粗糙）
        logger.info(f"🔍 L4语义搜索启动 | 查询: {q[:50]}... | top_k={top_k}")
        
        faiss_results = l4_index.search(query=q, top_k=top_k * 2)  # 多取一些候选
        
        if not faiss_results:
            return SearchResponse(
                query=q,
                results=[],
                total=0,
                search_method="faiss_only"
            )
        
        # 可选：按书名过滤
        if book_filter:
            faiss_results = [r for r in faiss_results if r.get("book_title") == book_filter]
        
        # 截断到请求的数量
        faiss_results = faiss_results[:top_k]
        
        # Step 2: DeepSeek AI 重排序和摘要生成（可选）
        if enable_ai_rerank and len(faiss_results) > 0:
            try:
                reranked_results = await _ai_rerank_with_deepseek(q, faiss_results)
                
                return SearchResponse(
                    query=q,
                    results=reranked_results,
                    total=len(reranked_results),
                    search_method="faiss+deepseek"
                )
            except Exception as e:
                logger.warning(f"⚠️ AI重排序失败，降级为纯FAISS结果: {e}")
        
        # 降级方案：直接返回FAISS结果
        final_results = [
            SearchResultItem(
                book_title=r["book_title"],
                core_concept=r["core_concept"],
                markdown=r["markdown"],
                distance=r["distance"],
                relevance_score=round(1.0 / (1.0 + r["distance"]), 3)  # 简单转换
            )
            for r in faiss_results
        ]
        
        return SearchResponse(
            query=q,
            results=final_results,
            total=len(final_results),
            search_method="faiss_only"
        )
        
    except Exception as e:
        logger.error(f"❌ 语义搜索崩溃: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


async def _ai_rerank_with_deepseek(query: str, candidates: List[dict]) -> List[SearchResultItem]:
    """
    使用 DeepSeek 对 FAISS 候选结果进行智能重排序
    
    处理逻辑：
    1. 将用户查询和候选内容发送给 DeepSeek
    2. 让 AI 评估每个结果与查询的相关性（0-10分）
    3. 为最相关的结果生成一句话摘要说明匹配原因
    """
    
    # 构建候选内容摘要（避免token过长）
    candidate_texts = []
    for i, cand in enumerate(candidates):
        # 提取核心信息：书名、概念、前200字内容
        concept = cand.get("core_concept", "")[:100]
        md_preview = cand.get("markdown", "").replace("\n", " ")[:300]
        candidate_texts.append(f"[{i+1}] 书籍:《{cand['book_title']}》\n    概念: {concept}\n    内容: {md_preview}...")
    
    candidates_str = "\n\n".join(candidate_texts)
    
    prompt = f"""你是一个学术文献检索系统的智能排序引擎。请根据用户的查询意图，对以下候选结果进行相关性评分。

## 用户查询
{query}

## 候选结果列表
{candidates_str}

## 任务要求
1. 请评估每个候选结果与用户查询的相关性（0-10分，10分最相关）
2. 为每个结果写一句中文摘要，说明为什么它可能与用户查询相关
3. 只保留分数 >= 5 的结果

## 输出格式（严格JSON）
{{
  "ranked_results": [
    {{
      "index": 1,
      "score": 8.5,
      "reason": "该段落讨论了XX概念，与查询高度相关..."
    }},
    ...
  ]
}}

请以JSON格式输出。"""

    response = await llm_service.generate_json(prompt, system_msg="你是一个专业的学术搜索引擎排序专家，擅长理解语义相关性并给出准确评分。")
    
    ranked_data = response.get("ranked_results", [])
    
    # 根据 AI 返回的排序重建结果列表
    final_results = []
    for item in ranked_data:
        idx = item.get("index", 1) - 1  # 转换为0-based索引
        if idx < len(candidates) and item.get("score", 0) >= 5:
            original = candidates[idx]
            
            result_item = SearchResultItem(
                book_title=original["book_title"],
                core_concept=original["core_concept"],
                markdown=original["markdown"],
                distance=original["distance"],
                relevance_score=round(item.get("score", 0) / 10.0, 3),  # 归一化到0-1
                ai_summary=item.get("reason", "")
            )
            final_results.append(result_item)
    
    return final_results


@router.get("/related/{note_id}", response_model=SearchResponse)
async def get_related_notes(
    note_id: str,
    top_k: int = Query(default=3, ge=1, le=10, description="返回相关笔记数量")
):
    """
    获取与指定笔记语义相关的其他笔记（跨书关联推荐）
    
    使用场景：
    用户正在阅读某本书的一个笔记段落时，系统自动推荐其他书籍中
    讨论相同或相似概念的内容，帮助建立跨书知识网络。
    """
    
    try:
        # TODO: 实现 note_id 到具体内容的映射
        # 当前先返回一个占位响应
        return SearchResponse(
            query=f"related_to:{note_id}",
            results=[],
            total=0,
            search_method="coming_soon"
        )
        
    except Exception as e:
        logger.error(f"❌ 相关笔记推荐失败: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def search_stats():
    """
    获取当前语义索引库的统计信息
    
    返回数据包括：
    - 已索引的总笔记数量
    - 涉及的书籍列表
    - 索引状态等
    """
    
    try:
        metadata = l4_index.metadata
        books = list(set(m.get("book_title", "未知") for m in metadata))
        
        return {
            "success": True,
            "total_indexed": len(metadata),
            "books_count": len(books),
            "books_list": books[:20],  # 最多返回20本书名
            "index_status": "ready" if metadata else "empty",
            "model_name": getattr(l4_index.model, 'model_name_or_path', 'unknown') if hasattr(l4_index, 'model') else "paraphrase-multilingual-MiniLM-L12-v2"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
