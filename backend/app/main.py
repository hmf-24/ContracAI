"""
ContracAI - FastAPI 应用程序与 pywebview 桌面入口

提供：
  - 用于前端交互的 REST API 接口
  - pywebview 桌面窗口外壳
  - 启动配置和生命周期管理
"""

import asyncio
import os
import sys
import threading
from pathlib import Path
from contextlib import asynccontextmanager
from dataclasses import asdict
from typing import Any

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn

from .config import get_config, reload_config, AppConfig
from .ledger_manager import LedgerManager
from .llm_router import LLMRouter
from .doc_parser import DocParser


# ── 全局变量 ──────────────────────────────────────────────────────
router_instance: LLMRouter | None = None
ledger_instance: LedgerManager | None = None
parser_instance: DocParser | None = None


async def check_warnings_loop():
    """定期（如每小时检查一次，每日推送一次）巡检合同到期并发送钉钉通知。"""
    from datetime import datetime
    from .dingtalk import DingTalkBot
    # 启动后先等待 10 秒，让系统完全初始化
    await asyncio.sleep(10)

    last_check_date = None
    while True:
        try:
            today = datetime.now().date()
            if last_check_date != today:
                cfg = get_config()
                if ledger_instance and cfg.dingtalk_webhook:
                    warnings = ledger_instance.check_expiry_warnings(days_ahead=7)
                    if warnings:
                        bot = DingTalkBot()
                        for w in warnings:
                            await bot.send_expiry_warning(
                                contract_name=w["合同名称"],
                                deadline=w["截止日期"],
                                days_left=w["剩余天数"]
                            )
                last_check_date = today
        except Exception as e:
            print(f"后台巡检发生错误: {e}")

        # 每 1 小时检查一次是否跨天
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用程序生命周期：在启动时初始化服务。"""
    global router_instance, ledger_instance, parser_instance

    cfg = get_config()
    router_instance = LLMRouter()
    parser_instance = DocParser()

    if cfg.ledger_path and Path(cfg.ledger_path).exists():
        ledger_instance = LedgerManager(cfg.ledger_path)

    # 启动后台合同截止日期巡检任务
    warning_task = asyncio.create_task(check_warnings_loop())

    yield

    # 取消后台任务
    warning_task.cancel()
    try:
        await warning_task
    except asyncio.CancelledError:
        pass

    # 清理
    router_instance = None
    ledger_instance = None
    parser_instance = None


# ── FastAPI 应用程序 ──────────────────────────────────────────────
app = FastAPI(
    title="ContracAI",
    description="采购合同台账智能管理系统",
    version="0.1.0",
    lifespan=lifespan,
)

# 确定前端路径
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    FRONTEND_DIR = Path(sys._MEIPASS) / "frontend"
else:
    FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"


# ── API 接口 ────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    """健康检查。"""
    return {"status": "ok", "ledger_loaded": ledger_instance is not None}


@app.get("/api/config")
async def get_current_config():
    """获取当前配置（对敏感字段进行脱敏）。"""
    cfg = get_config()
    data = asdict(cfg)
    # 对 API 密钥进行脱敏
    if data["llm"]["api_key"]:
        key = data["llm"]["api_key"]
        data["llm"]["api_key"] = key[:8] + "****" + key[-4:] if len(key) > 12 else "****"
    return data


@app.post("/api/config")
async def update_config(config_data: dict[str, Any]):
    """更新并保存配置。"""
    cfg = get_config()

    if "ledger_path" in config_data:
        cfg.ledger_path = config_data["ledger_path"]
    if "llm" in config_data:
        llm = config_data["llm"]
        if "base_url" in llm:
            cfg.llm.base_url = llm["base_url"]
        if "api_key" in llm:
            cfg.llm.api_key = llm["api_key"]
        if "model" in llm:
            cfg.llm.model = llm["model"]
    if "dingtalk_webhook" in config_data:
        cfg.dingtalk_webhook = config_data["dingtalk_webhook"]
    if "dingtalk_secret" in config_data:
        cfg.dingtalk_secret = config_data["dingtalk_secret"]

    cfg.save()

    # 重新初始化服务
    global ledger_instance, router_instance
    if cfg.ledger_path and Path(cfg.ledger_path).exists():
        ledger_instance = LedgerManager(cfg.ledger_path)
    router_instance = LLMRouter()

    return {"status": "ok"}


@app.post("/api/chat")
async def chat(body: dict[str, str]):
    """通过 LLM 路由解析处理自然语言消息。"""
    if not router_instance:
        raise HTTPException(500, "LLM 路由未初始化")

    message = body.get("message", "")
    if not message:
        raise HTTPException(400, "消息不能为空")

    result = await router_instance.process_message(message)
    return result


@app.post("/api/execute")
async def execute_operation(body: dict[str, Any]):
    """在台账上执行已确认的操作。"""
    if not ledger_instance:
        raise HTTPException(500, "台账未加载，请先配置 Excel 文件路径。")

    action = body.get("action")
    params = body.get("params", {})

    try:
        if action == "create_contract":
            preview = ledger_instance.prepare_new_contract(params)
            results = ledger_instance.execute_pending()
            return {"status": "success", "preview": preview, "results": results}

        elif action == "update_milestone":
            row = params.get("row")
            milestone_type = params.get("节点类型")
            date_str = params.get("日期")
            preview = ledger_instance.prepare_milestone_update(row, milestone_type, date_str)
            results = ledger_instance.execute_pending()
            return {"status": "success", "preview": preview, "results": results}

        elif action == "append_payment":
            row = params.get("row")
            amount = params.get("付款金额")
            pay_date = params.get("付款时间")
            preview = ledger_instance.prepare_payment(row, amount, pay_date)
            results = ledger_instance.execute_pending()
            return {"status": "success", "preview": preview, "results": results}

        elif action == "update_status":
            row = params.get("row")
            status = params.get("status")
            preview = ledger_instance.prepare_status_update(row, status)
            results = ledger_instance.execute_pending()
            return {"status": "success", "preview": preview, "results": results}

        else:
            raise HTTPException(400, f"未知操作: {action}")

    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/api/contracts")
async def list_contracts():
    """列出台账中的所有合同。"""
    if not ledger_instance:
        raise HTTPException(500, "台账未加载")

    records = ledger_instance.get_all_contracts()
    return {"contracts": [asdict(r) for r in records]}


@app.get("/api/contracts/search")
async def search_contracts(q: str):
    """通过关键词搜索合同。"""
    if not ledger_instance:
        raise HTTPException(500, "台账未加载")

    records = ledger_instance.search_contracts(q)
    return {"contracts": [asdict(r) for r in records]}


@app.get("/api/warnings")
async def get_warnings():
    """获取合同到期预警和自动关闭候选清单。"""
    if not ledger_instance:
        raise HTTPException(500, "台账未加载")

    return {
        "expiry_warnings": ledger_instance.check_expiry_warnings(),
        "closure_candidates": ledger_instance.check_auto_closure(),
    }


@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    """上传并解析合同文件（PDF/Word/图片）。"""
    if not parser_instance:
        raise HTTPException(500, "文档解析器未初始化")

    # 临时保存上传的文件
    import tempfile
    suffix = Path(file.filename or "doc").suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = await parser_instance.parse_file(tmp_path)
        return {"status": "success", "extracted": result}
    except Exception as e:
        raise HTTPException(422, f"文档解析失败: {str(e)}")
    finally:
        # 清理临时文件
        Path(tmp_path).unlink(missing_ok=True)


# ── 托管前端静态文件 ───────────────────────────────────────────────

@app.get("/")
async def serve_index():
    """托管前端 index.html 页面。"""
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "未找到前端页面。请将 index.html 放在 frontend/ 目录下。"}


# 挂载静态文件（CSS、JS、资源）
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


# ── 桌面端入口点 ─────────────────────────────────────────

def start_server():
    """在后台线程中启动 uvicorn 服务。"""
    uvicorn.run(app, host="127.0.0.1", port=18920, log_level="warning")


def main():
    """主入口点：启动 FastAPI 服务 + pywebview 窗口。"""
    # 在后台启动服务
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    # 给服务一点启动时间
    import time
    time.sleep(1)

    try:
        import webview

        window = webview.create_window(
            title="ContracAI - 采购合同台账智能管理系统",
            url="http://127.0.0.1:18920",
            width=1280,
            height=800,
            min_size=(1024, 600),
        )
        webview.start()
    except ImportError:
        print("未安装 pywebview。将以纯服务模式运行。")
        print("请在浏览器中打开 http://127.0.0.1:18920")
        server_thread.join()


if __name__ == "__main__":
    main()
