from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import os
from datetime import datetime

router = APIRouter()

DATA_DIR = "data"
SESSIONS_FILE = os.path.join(DATA_DIR, "deepwork_sessions.json")

def ensure_data_dir():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)

def load_sessions() -> List[dict]:
    ensure_data_dir()
    if not os.path.exists(SESSIONS_FILE):
        return []
    try:
        with open(SESSIONS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return []

def save_sessions(sessions: List[dict]):
    ensure_data_dir()
    with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(sessions, f, ensure_ascii=False, indent=2)

class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: str

class CardItem(BaseModel):
    id: str
    type: str
    content: str
    title: Optional[str] = None
    pinned: bool = False
    order: int = 0
    block_id: Optional[int] = None  # 新增：关联段落ID
    paragraph_index: Optional[int] = None  # 新增：段落位置索引

class SaveSessionRequest(BaseModel):
    user_id: str = "default_user"
    note_id: str
    chat_history: List[ChatMessage]
    right_cards: List[CardItem]
    final_markdown: Optional[str] = None

class RestoreSessionRequest(BaseModel):
    user_id: str = "default_user"
    note_id: Optional[str] = None

class SessionResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None

@router.post("/save", response_model=SessionResponse)
async def save_session(request: SaveSessionRequest):
    try:
        sessions = load_sessions()
        session_data = {
            "user_id": request.user_id,
            "note_id": request.note_id,
            "chat_history": [msg.dict() for msg in request.chat_history],
            "right_cards": [card.dict() for card in request.right_cards],
            "final_markdown": request.final_markdown,
            "last_updated": datetime.now().isoformat()
        }
        
        existing_index = next((i for i, s in enumerate(sessions) 
                            if s["user_id"] == request.user_id and s["note_id"] == request.note_id), None)
        
        if existing_index is not None:
            sessions[existing_index] = session_data
        else:
            sessions.append(session_data)
        
        save_sessions(sessions)
        
        return SessionResponse(
            success=True,
            message="Session saved successfully",
            data=session_data
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save session: {str(e)}")

@router.post("/restore", response_model=SessionResponse)
async def restore_session(request: RestoreSessionRequest):
    try:
        sessions = load_sessions()
        
        if request.note_id:
            session = next((s for s in sessions 
                        if s["user_id"] == request.user_id and s["note_id"] == request.note_id), None)
        else:
            sessions.sort(key=lambda x: x["last_updated"], reverse=True)
            session = sessions[0] if sessions else None
        
        if session:
            return SessionResponse(
                success=True,
                message="Session restored successfully",
                data={
                    "note_id": session["note_id"],
                    "chat_history": session["chat_history"],
                    "right_cards": session["right_cards"],
                    "final_markdown": session.get("final_markdown")
                }
            )
        else:
            return SessionResponse(
                success=False,
                message="No saved session found"
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to restore session: {str(e)}")

@router.get("/sessions", response_model=List[Dict[str, Any]])
async def get_all_sessions(user_id: str = "default_user"):
    try:
        sessions = load_sessions()
        user_sessions = [s for s in sessions if s["user_id"] == user_id]
        return user_sessions
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get sessions: {str(e)}")
