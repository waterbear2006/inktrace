from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="InkTrace Brain API")

# 配置 CORS（跨域资源共享），允许我们的 HTML 页面访问这个接口
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from backend.api import routes_library, routes_notes, routes_chat, routes_deepwork, routes_tencent_doc, routes_upload, routes_search

app.include_router(routes_library.router)
app.include_router(routes_notes.router)
app.include_router(routes_chat.router)
app.include_router(routes_deepwork.router, prefix="/api/v1/deepwork")
app.include_router(routes_tencent_doc.router)
app.include_router(routes_upload.router)
app.include_router(routes_search.router)

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=False)
