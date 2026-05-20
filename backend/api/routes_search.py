# backend/api/routes_search.py
"""
L4 语义搜索 API 路由
结合 FAISS 向量检索 + DeepSeek 智能重排序 + 跨书概念碰撞
"""

import asyncio
import logging
import traceback
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.services.semantic_index import LocalSemanticIndex, get_index
from backend.services.llm_service import AsyncLLMService
from backend.schemas.responses import CollisionTensionItem, CollisionResponse
from backend.core.prompts_demo import CROSS_BOOK_COLLISION_PROMPT
from backend.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/search", tags=["L4 Semantic Search"])

# 通过单例获取索引实例
l4_index = get_index()
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
        # 每次搜索前从磁盘重新加载，确保能获取到其他实例的写入
        l4_index.reload()

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
    [已废弃] 请使用 /collide/{note_id} 获取跨书概念碰撞结果。
    此端点保留用于向后兼容。
    """
    return SearchResponse(
        query=f"related_to:{note_id}",
        results=[],
        total=0,
        search_method="deprecated_use_collide_endpoint"
    )


# ==========================================
# 跨书概念碰撞 (Cross-Book Collision)
# ==========================================

@router.get("/collide/{note_id}", response_model=CollisionResponse)
async def cross_book_collide(
    note_id: str,
    block_index: int = Query(..., description="当前关注的段落索引"),
    core_concept: str = Query(..., min_length=1, max_length=100, description="当前段落的核心概念"),
    top_k: int = Query(default=5, ge=1, le=10, description="返回的跨书碰撞结果数量"),
    source_book_title: Optional[str] = Query(default=None, description="当前笔记所属书名（用于排除同书结果）")
):
    """
    跨书概念碰撞：给定一个笔记段落的核心概念，自动发现其他书籍中的相关讨论。

    算法流程：
    1. FAISS 向量检索 top_k*3 条候选
    2. 过滤掉同书结果（确保跨书）
    3. DeepSeek 张力分析（评分 + 张力分类 + 追问生成）
    4. 按相关性排序返回 top_k 条

    降级策略：DeepSeek 超时（15s）时回退到纯 FAISS 结果。
    候选不足 3 条时返回空结果并给出友好提示。
    """
    try:
        l4_index.reload()

        # Step 1: FAISS 粗排
        logger.info(f"🔀 跨书碰撞启动 | note={note_id} | concept={core_concept[:50]}...")

        faiss_results = l4_index.search(query=core_concept, top_k=top_k * 3)

        if not faiss_results:
            return CollisionResponse(
                note_id=note_id,
                source_book=source_book_title or "",
                source_concept=core_concept,
                results=[],
                total=0,
                search_method="faiss_only"
            )

        # Step 2: 跨书过滤 + 按书分组去重，每本书只保留距离最近的候选
        if source_book_title:
            faiss_results = [
                r for r in faiss_results
                if r.get("book_title", "") != source_book_title
            ]

        # 按书分组，每本书只保留距离最近的一条最佳候选
        book_best: dict = {}
        for r in faiss_results:
            book = r.get("book_title", "")
            if book not in book_best or r["distance"] < book_best[book]["distance"]:
                book_best[book] = r

        # 按距离排序，取 top 3 本书
        sorted_books = sorted(book_best.values(), key=lambda r: r["distance"])[:3]
        logger.info(f"🔀 跨书去重后: {len(sorted_books)} 本书 → {[r['book_title'][:20] for r in sorted_books]}")

        if len(sorted_books) < 1:
            logger.info("🔀 没有跨书候选，返回空结果")
            return CollisionResponse(
                note_id=note_id,
                source_book=source_book_title or "",
                source_concept=core_concept,
                results=[],
                total=0,
                search_method="faiss_only"
            )

        faiss_results = sorted_books

        # Step 3: DeepSeek 张力分析
        try:
            collision_items = await asyncio.wait_for(
                _ai_collision_analysis(
                    source_book=source_book_title or "未知书籍",
                    source_concept=core_concept,
                    candidates=faiss_results
                ),
                timeout=15.0
            )

            if collision_items:
                collision_items.sort(key=lambda x: x.relevance_score, reverse=True)
                collision_items = collision_items[:top_k]

                return CollisionResponse(
                    note_id=note_id,
                    source_book=source_book_title or "",
                    source_concept=core_concept,
                    results=collision_items,
                    total=len(collision_items),
                    search_method="faiss+deepseek"
                )

        except asyncio.TimeoutError:
            logger.warning(f"⏱️ DeepSeek 碰撞分析超时，降级为纯 FAISS 结果")
        except Exception as e:
            logger.warning(f"⚠️ AI 碰撞分析失败，降级为纯 FAISS 结果: {e}")

        # 降级：纯 FAISS 结果（无张力分类）
        fallback_items = [
            CollisionTensionItem(
                book_title=r["book_title"],
                core_concept=r.get("core_concept", "")[:100],
                markdown=r.get("markdown", ""),
                distance=r["distance"],
                relevance_score=round(1.0 / (1.0 + r["distance"]), 3),
                tension_type="互补",
                tension_reason="AI 分析暂不可用，以下为根据语义相似度的基础关联。",
                provocation_question="你觉得这两段内容之间有联系吗？"
            )
            for r in faiss_results[:top_k]
        ]

        return CollisionResponse(
            note_id=note_id,
            source_book=source_book_title or "",
            source_concept=core_concept,
            results=fallback_items,
            total=len(fallback_items),
            search_method="faiss_only"
        )

    except Exception as e:
        logger.error(f"❌ 跨书碰撞崩溃: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Collision analysis failed: {str(e)}")


async def _ai_collision_analysis(
    source_book: str,
    source_concept: str,
    candidates: List[dict]
) -> List[CollisionTensionItem]:
    """
    使用 DeepSeek 对跨书候选进行概念张力判断。

    每个候选的 markdown 截断到 250 字符以控制 token 预算。
    返回按 score 排序的 CollisionTensionItem 列表。
    """
    candidate_strs = []
    for i, cand in enumerate(candidates):
        concept = cand.get("core_concept", "")[:100]
        md_preview = cand.get("markdown", "").replace("\n", " ")[:250]
        candidate_strs.append(
            f"[{i+1}] 书籍:《{cand['book_title']}》\n"
            f"    概念: {concept}\n"
            f"    内容: {md_preview}..."
        )

    prompt = CROSS_BOOK_COLLISION_PROMPT.format(
        source_book=source_book,
        source_concept=source_concept,
        candidate_texts="\n\n".join(candidate_strs)
    )

    response = await llm_service.generate_json(
        prompt,
        system_msg="你是跨学科阅读的'思想对撞机'，善于发现不同文本之间的隐秘概念关联。你是阅读同伴，不是导师。"
    )

    collisions = response.get("collisions", [])

    result_items = []
    for item in collisions:
        idx = item.get("index", 1) - 1
        score = item.get("score", 0)
        if idx < len(candidates) and score >= 5:
            original = candidates[idx]
            result_items.append(CollisionTensionItem(
                book_title=original["book_title"],
                core_concept=original.get("core_concept", "")[:100],
                markdown=original.get("markdown", ""),
                distance=original["distance"],
                relevance_score=round(score / 10.0, 3),
                tension_type=item.get("tension_type", "互补"),
                tension_reason=item.get("tension_reason", ""),
                provocation_question=item.get("provocation_question", "")
            ))

    return result_items


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


@router.post("/rebuild")
async def rebuild_index():
    """
    从 data/output/ 目录下的所有笔记文件重建语义索引。

    使用场景：
    - 删除书籍后清理残留条目
    - 手动修复索引不一致
    - 新增书籍后无需重建（处理时会自动增量写入）
    """
    global l4_index
    try:
        l4_index.rebuild_from_files()
        return {
            "success": True,
            "message": "索引重建完成",
            "total_indexed": len(l4_index.metadata),
            "books_count": len(set(m.get("book_title", "") for m in l4_index.metadata))
        }
    except Exception as e:
        logger.error(f"❌ 索引重建失败: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))
