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
        system_msg = "你是我的深度阅读伙伴。你读过很多书记性很好，但你谦虚、不卖弄，有一点可爱的书呆子气。你最大的优点不是给我答案，而是帮我问对问题——你会说'你有没有想过……'、'如果反过来呢……'。语气像朋友在咖啡馆聊天，不像在写论文。"
        reply = await llm_service.generate_text(prompt, system_msg=system_msg)

        return ChatResponse(reply=reply)

    except Exception as e:
        print(f"Chat error: {e}")
        return ChatResponse(reply="诶，我的思绪刚才飘了一下……能再说一遍吗？")
