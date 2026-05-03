"""
腾讯文档开放平台接入路由
提供 OAuth 2.0 授权、Token 管理、文档创建和写入功能
"""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import httpx
import json
import os
from datetime import datetime, timedelta

from backend.core.config import settings

router = APIRouter(prefix="/api/v1/export", tags=["tencent-doc"])

# 腾讯文档开放平台 API 基础地址
TENCENT_DOC_API_BASE = "https://docs.qq.com/openapi"
TENCENT_DOC_AUTH_URL = "https://docs.qq.com/oauth/v2/authorize"
TENCENT_DOC_TOKEN_URL = "https://docs.qq.com/oauth/v2/token"

# 本地存储 token 的文件（生产环境应使用数据库）
TOKEN_STORE_FILE = os.path.join("data", "tencent_doc_tokens.json")


def load_tokens() -> dict:
    """加载存储的 token"""
    if not os.path.exists(TOKEN_STORE_FILE):
        return {}
    try:
        with open(TOKEN_STORE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {}


def save_tokens(tokens: dict):
    """保存 token 到本地"""
    os.makedirs(os.path.dirname(TOKEN_STORE_FILE), exist_ok=True)
    with open(TOKEN_STORE_FILE, "w", encoding="utf-8") as f:
        json.dump(tokens, f, ensure_ascii=False, indent=2)


# ============================================================
# 1. OAuth 2.0 授权流程
# ============================================================

@router.get("/tencent/auth")
async def tencent_auth():
    """
    第一步：直接重定向到腾讯文档授权页面
    """
    client_id = settings.TENCENT_DOC_CLIENT_ID
    redirect_uri = settings.TENCENT_DOC_REDIRECT_URI
    
    if not client_id:
        raise HTTPException(status_code=500, detail="腾讯文档 Client ID 未配置")
    
    auth_url = (
        f"{TENCENT_DOC_AUTH_URL}?"
        f"client_id={client_id}&"
        f"redirect_uri={redirect_uri}&"
        f"response_type=code&"
        f"scope=all"
    )
    
    return RedirectResponse(url=auth_url)


@router.get("/tencent/callback")
async def tencent_callback(code: str, state: Optional[str] = None):
    """
    第二步：腾讯文档授权回调，用 Authorization Code 换取 Access Token
    """
    client_id = settings.TENCENT_DOC_CLIENT_ID
    client_secret = settings.TENCENT_DOC_CLIENT_SECRET
    redirect_uri = settings.TENCENT_DOC_REDIRECT_URI
    
    if not client_id or not client_secret:
        raise HTTPException(status_code=500, detail="腾讯文档 Client ID 或 Client Secret 未配置")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                TENCENT_DOC_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": redirect_uri
                }
            )
            response.raise_for_status()
            token_data = response.json()
            
            if "access_token" not in token_data:
                raise HTTPException(
                    status_code=400, 
                    detail=f"获取 Token 失败: {token_data.get('error_description', '未知错误')}"
                )
            
            # 保存 token
            tokens = load_tokens()
            tokens["default_user"] = {
                "access_token": token_data["access_token"],
                "refresh_token": token_data.get("refresh_token"),
                "expires_in": token_data.get("expires_in", 2592000),
                "created_at": datetime.now().isoformat(),
                "open_id": None  # 稍后获取
            }
            save_tokens(tokens)
            
            # 获取用户信息（Open ID）
            open_id = await get_user_info(token_data["access_token"])
            if open_id:
                tokens["default_user"]["open_id"] = open_id
                save_tokens(tokens)
            
            # 授权成功，重定向回前端
            return RedirectResponse(url="http://127.0.0.1:3000?auth=success")
            
        except httpx.HTTPError as e:
            raise HTTPException(status_code=500, detail=f"请求腾讯文档接口失败: {str(e)}")


async def get_user_info(access_token: str) -> Optional[str]:
    """
    第三步：获取用户信息，提取 Open ID
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{TENCENT_DOC_API_BASE}/user/v1/users/me",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Client-ID": settings.TENCENT_DOC_CLIENT_ID
                }
            )
            response.raise_for_status()
            user_data = response.json()
            return user_data.get("data", {}).get("open_id")
        except:
            return None


async def refresh_access_token(refresh_token: str) -> dict:
    """
    使用 Refresh Token 刷新 Access Token
    """
    client_id = settings.TENCENT_DOC_CLIENT_ID
    client_secret = settings.TENCENT_DOC_CLIENT_SECRET
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            TENCENT_DOC_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret
            }
        )
        response.raise_for_status()
        return response.json()


def get_valid_token() -> Optional[dict]:
    """
    获取有效的 token，如果过期则尝试刷新
    """
    tokens = load_tokens()
    user_token = tokens.get("default_user")
    
    if not user_token:
        return None
    
    # 检查是否过期（提前 1 天刷新）
    created_at = datetime.fromisoformat(user_token["created_at"])
    expires_in = user_token.get("expires_in", 2592000)
    expires_at = created_at + timedelta(seconds=expires_in)
    
    if datetime.now() >= expires_at - timedelta(days=1):
        # 需要刷新
        refresh_token = user_token.get("refresh_token")
        if refresh_token:
            try:
                import asyncio
                new_token = asyncio.run(refresh_access_token(refresh_token))
                user_token["access_token"] = new_token["access_token"]
                user_token["refresh_token"] = new_token.get("refresh_token", refresh_token)
                user_token["expires_in"] = new_token.get("expires_in", 2592000)
                user_token["created_at"] = datetime.now().isoformat()
                save_tokens(tokens)
            except:
                return None
        else:
            return None
    
    return user_token


# ============================================================
# 2. 文档创建和写入
# ============================================================

class CreateDocRequest(BaseModel):
    title: str
    content: str


@router.post("/tencent/doc")
async def create_tencent_doc(request: CreateDocRequest):
    """
    创建腾讯文档并写入内容
    """
    token_data = get_valid_token()
    if not token_data:
        raise HTTPException(status_code=401, detail="未授权，请先完成腾讯文档授权")
    
    access_token = token_data["access_token"]
    open_id = token_data.get("open_id")
    client_id = settings.TENCENT_DOC_CLIENT_ID
    
    if not open_id:
        raise HTTPException(status_code=401, detail="无法获取用户 Open ID")
    
    async with httpx.AsyncClient() as client:
        try:
            # 1. 创建文档
            create_response = await client.post(
                f"{TENCENT_DOC_API_BASE}/drive/v1/files",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Client-ID": client_id,
                    "Open-ID": open_id,
                    "Content-Type": "application/json"
                },
                json={
                    "type": "doc",
                    "title": request.title
                }
            )
            create_response.raise_for_status()
            create_data = create_response.json()
            
            file_id = create_data.get("data", {}).get("id")
            if not file_id:
                raise HTTPException(status_code=500, detail="创建文档失败，未返回文件 ID")
            
            # 2. 写入内容
            await write_doc_content(file_id, request.content, access_token, open_id, client_id)
            
            # 3. 获取文档链接
            share_link = f"https://docs.qq.com/doc/{file_id}"
            
            return {
                "success": True,
                "file_id": file_id,
                "share_link": share_link,
                "title": request.title
            }
            
        except httpx.HTTPError as e:
            raise HTTPException(status_code=500, detail=f"调用腾讯文档 API 失败: {str(e)}")


async def write_doc_content(file_id: str, content: str, access_token: str, open_id: str, client_id: str):
    """
    向腾讯文档写入内容
    腾讯文档 API 限制每次写入的字符数，需要分段写入
    """
    async with httpx.AsyncClient() as client:
        # 腾讯文档单次写入限制约为 5000 字符，分段处理
        chunk_size = 4000
        chunks = [content[i:i+chunk_size] for i in range(0, len(content), chunk_size)]
        
        for i, chunk in enumerate(chunks):
            response = await client.post(
                f"{TENCENT_DOC_API_BASE}/doc/v1/documents/{file_id}/blocks/batchUpdate",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Client-ID": client_id,
                    "Open-ID": open_id,
                    "Content-Type": "application/json"
                },
                json={
                    "requests": [
                        {
                            "insertText": {
                                "location": {
                                    "index": i * chunk_size
                                },
                                "text": chunk
                            }
                        }
                    ]
                }
            )
            response.raise_for_status()


# ============================================================
# 3. 授权状态检查
# ============================================================

@router.get("/tencent/status")
async def tencent_auth_status():
    """
    检查当前用户是否已完成腾讯文档授权
    """
    token_data = get_valid_token()
    if not token_data:
        return {"authorized": False}
    
    return {
        "authorized": True,
        "open_id": token_data.get("open_id"),
        "created_at": token_data.get("created_at")
    }
