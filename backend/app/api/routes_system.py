from fastapi import APIRouter, Depends, HTTPException
from typing import Any
from dataclasses import asdict
from ..core.auth import get_admin_user, get_current_user
from ..core.config import get_config
from ..core.db import get_audit_logs, get_audit_log_count

router = APIRouter()

@router.get("/health")
def health_check(current_user: dict = Depends(get_current_user)):
    from ..services.ledger_service import ledger_instance
    return {
        "status": "ok", 
        "ledger_loaded": ledger_instance is not None,
        "config_loaded": get_config().chat_llm.api_key != ""
    }

@router.get("/config")
async def get_current_config(current_user: dict = Depends(get_admin_user)):
    cfg = get_config()
    data = asdict(cfg)
    if data["chat_llm"]["api_key"]:
        key = data["chat_llm"]["api_key"]
        data["chat_llm"]["api_key"] = key[:8] + "****" + key[-4:] if len(key) > 12 else "****"
    if data["ocr_llm"]["api_key"]:
        key = data["ocr_llm"]["api_key"]
        data["ocr_llm"]["api_key"] = key[:8] + "****" + key[-4:] if len(key) > 12 else "****"
    if data.get("mineru_api_key"):
        key = data["mineru_api_key"]
        data["mineru_api_key"] = key[:8] + "****" + key[-4:] if len(key) > 12 else "****"
    if data.get("paddle_ocr_token"):
        key = data["paddle_ocr_token"]
        data["paddle_ocr_token"] = key[:8] + "****" + key[-4:] if len(key) > 12 else "****"
    return {"config": data}

@router.post("/config")
async def update_config(config_data: dict[str, Any], current_user: dict = Depends(get_admin_user)):
    cfg = get_config()
    if "ledger_path" in config_data:
        cfg.ledger_path = config_data["ledger_path"]
        
    if "chat_llm" in config_data:
        chat = config_data["chat_llm"]
        if "base_url" in chat: cfg.chat_llm.base_url = chat["base_url"]
        if "api_key" in chat and not chat["api_key"].startswith("****"):
            cfg.chat_llm.api_key = chat["api_key"]
        if "model" in chat: cfg.chat_llm.model = chat["model"]
        
    if "ocr_llm" in config_data:
        ocr = config_data["ocr_llm"]
        if "base_url" in ocr: cfg.ocr_llm.base_url = ocr["base_url"]
        if "api_key" in ocr and not ocr["api_key"].startswith("****"):
            cfg.ocr_llm.api_key = ocr["api_key"]
        if "model" in ocr: cfg.ocr_llm.model = ocr["model"]

    if "mineru_api_key" in config_data and not config_data["mineru_api_key"].startswith("****"):
        cfg.mineru_api_key = config_data["mineru_api_key"]

    if "paddle_ocr_token" in config_data and not config_data["paddle_ocr_token"].startswith("****"):
        cfg.paddle_ocr_token = config_data["paddle_ocr_token"]

    cfg.save()
    
    from ..core.llm import LLMClient
    from ..agents.ChatAgent.agent import llm_router
    from ..agents.ParserAgent import tools
    
    chat_llm_client = LLMClient(cfg.chat_llm)
    llm_router.client = chat_llm_client
    
    if tools.parser_instance is None:
        tools.parser_instance = tools.DocParser()
    tools.parser_instance.client = chat_llm_client
    
    return {"status": "success"}

@router.get("/audit-logs")
async def fetch_audit_logs(limit: int = 100, offset: int = 0, current_user: dict = Depends(get_admin_user)):
    try:
        logs = get_audit_logs(limit, offset)
        total = get_audit_log_count()
        return {"logs": logs, "total": total}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
