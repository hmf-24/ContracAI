from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from .core.config import CONFIG_DIR

# Routers
from .api.routes_auth import router as auth_router
from .api.routes_ledger import router as ledger_router
from .api.routes_chat import router as chat_router
from .api.routes_upload import router as upload_router
from .api.routes_skills import router as skills_router
from .api.routes_system import router as system_router
from .api.routes_dingtalk import router as dingtalk_router
from .api.routes_dashboard import router as dashboard_router

app = FastAPI(title="Contrac-AI Backend", version="2.0")

# 允许跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(ledger_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(upload_router, prefix="/api")
app.include_router(skills_router, prefix="/api")
app.include_router(system_router, prefix="/api")
app.include_router(dingtalk_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")

# 托管静态文件
avatar_dir = CONFIG_DIR / "avatars"
avatar_dir.mkdir(parents=True, exist_ok=True)
app.mount("/avatars", StaticFiles(directory=str(avatar_dir)), name="avatars")

attachments_dir = Path(__file__).parent.parent / "uploads" / "attachments"
attachments_dir.mkdir(parents=True, exist_ok=True)
app.mount("/attachments", StaticFiles(directory=str(attachments_dir)), name="attachments")

contracts_files_dir = Path(__file__).parent.parent / "uploads" / "contracts"
contracts_files_dir.mkdir(parents=True, exist_ok=True)
app.mount("/contracts-files", StaticFiles(directory=str(contracts_files_dir)), name="contracts-files")

# Frontend dist mounting
dist_dir = Path(__file__).parent.parent.parent / "frontend" / "dist"
if dist_dir.exists():
    app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    import sys
    print("==================================================")
    print("ContracAI Backend Service Started")
    print("Please open in browser: http://127.0.0.1:18920")
    print("==================================================")
    uvicorn.run("app.main:app", host="127.0.0.1", port=18920, reload=True)
