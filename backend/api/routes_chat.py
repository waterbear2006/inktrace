import uuid
import json
from fastapi import APIRouter, HTTPException
from backend.core.store import store
from backend.schemas.requests import ChatRequest
from backend.schemas.responses import ChatResponse
from backend.core.prompts_demo import CHAT_COMPANION_PROMPT
from backend.services.llm_service import AsyncLLMService

router = APIRouter(prefix="/api/v1/notes", tags=["chat"])
llm_service = AsyncLLMService()

@router.post("/chat", response_model=ChatResponse)
async def chat_with_note(request: ChatRequest):
    """
    伴读对话接口：基于当前笔记片段与用户的聊天记录，利用 LLM 进行回答。
    """
    # 将历史对话格式化为字符串
    history_str = ""
    for msg in request.history:
        history_str += f"{msg.role}: {msg.content}\n"
    
    # 构造 Prompt
    prompt = CHAT_COMPANION_PROMPT.format(
        book_title=request.book_title or "未知书籍",
        highlighted_text=request.highlighted_text,
        chat_history=history_str if history_str else "无",
        user_message=request.message
    )
    
    try:
        # 调用大模型
        system_msg = "你是一个学识渊博、思维发散且极具洞察力的伴读伴侣。你正在协助用户深度阅读书籍。"
        reply = await llm_service.generate_text(prompt, system_msg=system_msg)
        
        return ChatResponse(reply=reply)
        
    except Exception as e:
        print(f"Chat error: {e}")
        return ChatResponse(reply="抱歉，我的思绪刚才飘到了庄子的梦里。请再问一次。")
