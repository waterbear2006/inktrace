import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="InkTrace Brain API")

allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "https://inktrace-azure.vercel.app",
    "https://*.vercel.app",
]
if os.getenv("FRONTEND_URL"):
    allowed_origins.append(os.getenv("FRONTEND_URL"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from backend.api import routes_library, routes_notes, routes_chat, routes_deepwork, routes_tencent_doc, routes_upload, routes_search

app.include_router(routes_library.router)
app.include_router(routes_notes.router)
app.include_router(routes_chat.router)
app.include_router(routes_deepwork.router)
app.include_router(routes_tencent_doc.router)
app.include_router(routes_upload.router)
app.include_router(routes_search.router)

@app.get("/")
async def root():
    return {"message": "InkTrace API", "version": "1.0", "docs": "/docs"}

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)
