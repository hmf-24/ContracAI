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
import json
import csv
from io import StringIO

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from .config import get_config, reload_config, AppConfig
from .ledger_manager import LedgerManager
from .llm_router import LLMRouter
from .doc_parser import DocParser
from .auth import router as auth_router, get_current_user, get_admin_user


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
                        bot = DingTalkBot(cfg.dingtalk_webhook, cfg.dingtalk_secret)
                        
                        msg = "## ⚠️ 合同到期预警\n\n"
                        for w in warnings:
                            msg += f"- **{w['合同名称']}** 将于 {w['截止日期']} 到期（剩余 {w['剩余天数']} 天）\n"
                            
                        bot.send_markdown("合同到期预警", msg)
                        print(f"[{datetime.now()}] 预警推送到钉钉成功")
                last_check_date = today
        except Exception as e:
            print(f"后台预警检查异常: {e}")

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

    # 临时禁用后台巡检，防止 xlwings 阻塞主事件循环导致死锁
    # warning_task = asyncio.create_task(check_warnings_loop())

    yield

    # 取消后台任务
    # warning_task.cancel()
    # try:
    #     await warning_task
    # except asyncio.CancelledError:
    #     pass

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

# 全局异常处理中间件：统一返回友好错误信息
import traceback
import logging
logger = logging.getLogger("contracai")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {exc}\n{traceback.format_exc()}")
    return StreamingResponse(
        iter([json.dumps({"detail": f"服务器内部错误：{str(exc)}"}, ensure_ascii=False)]),
        status_code=500,
        media_type="application/json",
    )

# 挂载鉴权路由
app.include_router(auth_router, prefix="/api")

# 确定前端路径
# 优先使用 React 构建输出 (frontend/dist)，兼容旧的原生前端目录
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    FRONTEND_DIR = Path(sys._MEIPASS) / "frontend"
else:
    _project_root = Path(__file__).resolve().parent.parent.parent
    _dist_dir = _project_root / "frontend" / "dist"
    if _dist_dir.exists():
        FRONTEND_DIR = _dist_dir
    else:
        FRONTEND_DIR = _project_root / "frontend"


# ── API 接口 ────────────────────────────────────────────────

@app.get("/api/health")
def health_check(current_user: dict = Depends(get_current_user)):
    """健康检查。"""
    return {
        "status": "ok", 
        "ledger_loaded": ledger_instance is not None,
        "config_loaded": get_config().chat_llm.api_key != ""
    }


@app.get("/api/config")
async def get_current_config(current_user: dict = Depends(get_admin_user)):
    """获取当前配置（对敏感字段进行脱敏）。"""
    cfg = get_config()
    data = asdict(cfg)
    # 对 API 密钥进行脱敏
    if data["chat_llm"]["api_key"]:
        key = data["chat_llm"]["api_key"]
        data["chat_llm"]["api_key"] = key[:8] + "****" + key[-4:] if len(key) > 12 else "****"
    if data["ocr_llm"]["api_key"]:
        key = data["ocr_llm"]["api_key"]
        data["ocr_llm"]["api_key"] = key[:8] + "****" + key[-4:] if len(key) > 12 else "****"
    return data


@app.post("/api/config")
async def update_config(config_data: dict[str, Any], current_user: dict = Depends(get_admin_user)):
    """更新并保存配置。"""
    cfg = get_config()

    if "ledger_path" in config_data:
        cfg.ledger_path = config_data["ledger_path"]
        
    if "chat_llm" in config_data:
        chat = config_data["chat_llm"]
        if "base_url" in chat: cfg.chat_llm.base_url = chat["base_url"]
        if "api_key" in chat: cfg.chat_llm.api_key = chat["api_key"]
        if "model" in chat: cfg.chat_llm.model = chat["model"]
        
    if "ocr_llm" in config_data:
        ocr = config_data["ocr_llm"]
        if "base_url" in ocr: cfg.ocr_llm.base_url = ocr["base_url"]
        if "api_key" in ocr: cfg.ocr_llm.api_key = ocr["api_key"]
        if "model" in ocr: cfg.ocr_llm.model = ocr["model"]
        
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


@app.post("/api/analyze_risk")
async def analyze_risk(request: Request, current_user: dict = Depends(get_current_user)):
    """对合同进行 AI 风险评估，返回 TaskTree 格式"""
    if not ledger_instance:
        raise HTTPException(status_code=400, detail="台账文件未配置或未加载")

    body = await request.json()
    row = body.get("row")
    if not row:
        raise HTTPException(status_code=400, detail="缺少参数 row")
        
    cfg = get_config()
    if not cfg.chat_llm.api_key:
        raise HTTPException(status_code=400, detail="未配置 Chat LLM API Key")

    try:
        # 获取合同数据
        # 获取合同数据
        from .db_manager import get_all_contracts
        records = get_all_contracts()
        contract_data = next((r for r in records if r.get('row_number') == row), None)
        if not contract_data:
            raise HTTPException(status_code=404, detail="未找到目标合同")
        
        # 组装 prompt
        prompt = f"""
请你作为资深采购与财务风控专家，对以下合同数据进行风险评估。
合同信息：
{json.dumps(contract_data, ensure_ascii=False, indent=2)}

请以 TaskTree (任务树) 格式输出分析结果。输出必须是严格的 JSON 数组，每个元素包含 id, title, type, content, children。
要求类型(type)包括：资金风险(fund)、合规预警(compliance)、行动建议(action)。
不要输出其他无关文字，只输出合法的 JSON。
"""
        from .llm_client import LLMClient
        client = LLMClient(cfg.chat_llm)
        response_text = client.chat(prompt)
        
        # 提取 JSON
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]
            
        return json.loads(response_text.strip())
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat(body: dict[str, Any], current_user: dict = Depends(get_current_user)):
    """通过 LLM 路由解析处理自然语言消息（流式）。"""
    if not router_instance:
        raise HTTPException(500, "LLM 路由未初始化")

    message = body.get("message", "")
    context = body.get("context", "")
    if not message:
        raise HTTPException(400, "消息不能为空")

    session_id = current_user.get("username", "default")
    
    # 包装为 SSE 格式
    async def sse_generator():
        async for chunk in router_instance.process_message_stream(message, session_id=session_id, context=context):
            yield f"data: {chunk}"
            
    return StreamingResponse(sse_generator(), media_type="text/event-stream")


@app.post("/api/execute")
async def execute_operation(body: dict[str, Any], current_user: dict = Depends(get_admin_user)):
    """在台账上执行已确认的操作。"""
    if not ledger_instance:
        raise HTTPException(500, "台账未加载，请先配置 Excel 文件路径。")

    action = body.get("action")
    params = body.get("params", {})
    session_id = current_user.get("username", "default")
    from .memory_manager import memory_manager

    try:
        if action == "create_contract":
            preview = ledger_instance.prepare_new_contract(params)
            results = ledger_instance.execute_pending()
            db_manager.add_audit_log(
                user_id=str(current_user.get('id', '')),
                username=current_user.get('username', ''),
                action='AI新增合同',
                target=params.get('合同名称', ''),
                detail=f"通过智能助手新建合同：{params.get('合同名称', '')}",
            )
            memory_manager.add_episodic_memory(session_id, f"执行新增合同操作成功。参数：{json.dumps(params, ensure_ascii=False)}")
            return {"status": "success", "preview": preview, "results": results}

        elif action == "save_preference":
            preference = params.get("preference")
            memory_manager.add_memory(session_id, preference)
            db_manager.add_audit_log(
                user_id=str(current_user.get('id', '')),
                username=current_user.get('username', ''),
                action='保存记忆',
                target='全局长期记忆',
                detail=f"保存了偏好设定：{preference}",
            )
            return {"status": "success", "preview": None, "results": [f"已牢记您的偏好：{preference}"]}

        elif action == "update_milestone":
            row = params.get("row")
            milestone_type = params.get("节点类型")
            date_str = params.get("日期")
            preview = ledger_instance.prepare_milestone_update(row, milestone_type, date_str)
            results = ledger_instance.execute_pending()
            db_manager.add_audit_log(
                user_id=str(current_user.get('id', '')),
                username=current_user.get('username', ''),
                action='AI更新节点',
                target=f"行号{row}",
                detail=f"更新了{milestone_type}为{date_str}",
            )
            memory_manager.add_episodic_memory(session_id, f"更新合同节点成功。行号：{row}，类型：{milestone_type}，日期：{date_str}")
            return {"status": "success", "preview": preview, "results": results}

        elif action == "append_payment":
            row = params.get("row")
            amount = params.get("付款金额")
            pay_date = params.get("付款时间")
            preview = ledger_instance.prepare_payment(row, amount, pay_date)
            results = ledger_instance.execute_pending()
            db_manager.add_audit_log(
                user_id=str(current_user.get('id', '')),
                username=current_user.get('username', ''),
                action='AI追加付款',
                target=f"行号{row}",
                detail=f"追加付款 {amount} 元于 {pay_date}",
            )
            memory_manager.add_episodic_memory(session_id, f"追加付款成功。行号：{row}，金额：{amount}，日期：{pay_date}")
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


@app.get("/api/graph")
async def get_graph_data(current_user: dict = Depends(get_current_user)):
    """提取图谱关系数据。"""
    from .db_manager import get_all_contracts
    contracts = get_all_contracts()
    
    nodes = []
    links = []
    
    # 使用 set 去重
    node_ids = set()
    
    def add_node(id_str, name, group, val=1):
        if id_str and id_str not in node_ids:
            nodes.append({"id": id_str, "name": name, "group": group, "val": val})
            node_ids.add(id_str)
            
    for c in contracts:
        contract_id = f"C_{c.get('row_number')}"
        contract_name = c.get('合同名称') or f"未知合同 {c.get('row_number')}"
        is_sales = "销售" in c.get('合同类型', '')
        # 1: 销售合同, 2: 采购合同
        c_group = 1 if is_sales else 2
        amount = c.get('合同金额') or 0
        val = max(1, min(10, amount / 100000)) # 根据金额粗略计算节点大小
        
        add_node(contract_id, contract_name, c_group, val=val)
        
        # 提取对方单位 (Group 3)
        party = c.get('对方单位名称')
        if party and party.strip():
            party_id = f"P_{party.strip()}"
            add_node(party_id, party.strip(), 3)
            links.append({"source": contract_id, "target": party_id, "name": "签约方"})
            
        # 提取经办人 (Group 4)
        handler = c.get('经办人')
        if handler and handler.strip() and handler.strip() != "-":
            handler_id = f"H_{handler.strip()}"
            add_node(handler_id, handler.strip(), 4)
            links.append({"source": contract_id, "target": handler_id, "name": "经办"})
            
        # 提取对应销售合同依赖关系
        parent_sales = c.get('对应销售合同')
        if parent_sales and parent_sales.strip() and parent_sales.strip() != "-":
            # 寻找具有这个名称的合同
            parent_match = next((p for p in contracts if p.get('合同名称') == parent_sales.strip()), None)
            if parent_match:
                parent_id = f"C_{parent_match.get('row_number')}"
                links.append({"source": contract_id, "target": parent_id, "name": "依赖于"})
            else:
                # 即使没有找到，也创建一个临时节点
                parent_id = f"C_ext_{parent_sales.strip()}"
                add_node(parent_id, parent_sales.strip(), 1)
                links.append({"source": contract_id, "target": parent_id, "name": "依赖于"})
                
    return {"nodes": nodes, "links": links}


@app.post("/api/contracts/{row_number}")
async def update_contract_data(row_number: int, body: dict[str, Any], current_user: dict = Depends(get_current_user)):
    """更新全量数据"""
    try:
        # 获取原始数据用于审计
        old_records = db_manager.get_all_contracts()
        old = next((r for r in old_records if r.get('row_number') == row_number), None)
        
        if old:
            from .memory_manager import memory_manager
            session_id = current_user.get("username", "default")
            for key, new_val in body.items():
                old_val = old.get(key)
                # 如果字段被修改，且不是内部字段，记录纠错记忆
                if old_val != new_val and key not in ["row_number", "id", "status"]:
                    memory_manager.add_correction(
                        session_id,
                        key,
                        str(old_val),
                        str(new_val),
                        f"修改合同「{body.get('合同名称', f'行号{row_number}')}」"
                    )
        
        db_manager.update_contract(row_number, body)
        
        db_manager.add_audit_log(
            user_id=str(current_user.get('id', '')),
            username=current_user.get('username', ''),
            action='编辑合同',
            target=body.get('合同名称', f'行号{row_number}'),
            detail=f"更新了合同「{body.get('合同名称', '')}」的数据",
        )
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ReorderRequest(BaseModel):
    ids: list[int]

@app.post("/api/ledger/reorder")
async def reorder_contracts(req: ReorderRequest, current_user: dict = Depends(get_admin_user)):
    """重排序合同台账"""
    if not ledger_instance:
        raise HTTPException(status_code=400, detail="Ledger not initialized")
    try:
        ledger_instance.reorder_contracts(req.ids)
        db_manager.add_audit_log(
            user_id=str(current_user.get('id', '')),
            username=current_user.get('username', ''),
            action='重排序合同',
            target='全局台账',
            detail=f"重新排列了 {len(req.ids)} 条合同的顺序",
        )
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/contracts/{row_number}")
async def delete_contract_data(row_number: int, current_user: dict = Depends(get_admin_user)):
    """删除合同数据。需要管理员权限。"""
    try:
        # 获取被删除的合同名称
        old_records = db_manager.get_all_contracts()
        old = next((r for r in old_records if r.get('row_number') == row_number), None)
        contract_name = old.get('合同名称', f'行号{row_number}') if old else f'行号{row_number}'
        
        db_manager.delete_contract(row_number)
        
        db_manager.add_audit_log(
            user_id=str(current_user.get('id', '')),
            username=current_user.get('username', ''),
            action='删除合同',
            target=contract_name,
            detail=f"删除了合同「{contract_name}」",
        )
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/skills")
async def get_skills(current_user: dict = Depends(get_current_user)):
    """获取所有技能"""
    from .skill_manager import skill_manager
    return {"skills": skill_manager.get_all_skills()}

@app.post("/api/skills")
async def save_skill(body: dict[str, Any], current_user: dict = Depends(get_admin_user)):
    """保存新技能"""
    from .skill_manager import skill_manager
    title = body.get("title")
    description = body.get("description")
    trigger = body.get("trigger")
    steps = body.get("steps", [])
    skill = skill_manager.save_skill(title, description, trigger, steps)
    
    from .db_manager import add_audit_log
    add_audit_log(
        user_id=str(current_user.get('id', '')),
        username=current_user.get('username', ''),
        action='保存技能',
        target=title,
        detail=f"沉淀了新技能：{title}",
    )
    return {"status": "success", "skill": skill}

@app.put("/api/skills/{skill_id}/toggle")
async def toggle_skill(skill_id: str, body: dict[str, bool], current_user: dict = Depends(get_admin_user)):
    """启用/禁用技能"""
    from .skill_manager import skill_manager
    enabled = body.get("enabled", True)
    skill_manager.toggle_skill(skill_id, enabled)
    return {"status": "success"}

@app.delete("/api/skills/{skill_id}")
async def delete_skill(skill_id: str, current_user: dict = Depends(get_admin_user)):
    """删除技能"""
    from .skill_manager import skill_manager
    skill_manager.delete_skill(skill_id)
    return {"status": "success"}


@app.post("/api/contracts/update")
async def update_contract(body: dict[str, Any], current_user: dict = Depends(get_current_user)):
    """更新合同的指定字段（全量覆盖或部分更新取决于前端传参）"""
    if not ledger_instance:
        raise HTTPException(500, "台账未加载")
    
    row = body.get("row")
    data = body.get("data")
    if row is None or not data:
        raise HTTPException(400, "缺少参数 row 或 data")
    
    # 获取原始数据
    from .db_manager import get_all_contracts, update_contract
    records = get_all_contracts()
    original = next((r for r in records if r.get("row_number") == row), None)
    if not original:
        raise HTTPException(404, f"找不到行号为 {row} 的合同")
        
    # 合并更新
    original.update(data)
    update_contract(row, original)
    
    # 记录日志
    db_manager.add_audit_log(
        user_id=str(current_user.get('id', '')),
        username=current_user.get('username', ''),
        action='更新字段',
        target=original.get('合同名称', f"行号{row}"),
        detail=f"更新了部分字段: {list(data.keys())}",
    )
    
    return {"status": "success", "message": "更新成功"}


@app.get("/api/audit-logs")
async def get_audit_logs(limit: int = 100, offset: int = 0, current_user: dict = Depends(get_admin_user)):
    """获取操作审计日志（需要管理员权限）"""
    try:
        logs = db_manager.get_audit_logs(limit, offset)
        total = db_manager.get_audit_log_count()
        return {"logs": logs, "total": total}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/contracts")
async def list_contracts(current_user: dict = Depends(get_current_user)):
    """列出台账中的所有合同。"""
    if not ledger_instance:
        raise HTTPException(500, "台账未加载")

    records = ledger_instance.get_all_contracts()
    return {"contracts": [asdict(r) for r in records]}

class ExportRequest(BaseModel):
    row_ids: list[int]
    columns: list[str]

@app.post("/api/contracts/export")
async def export_contracts(request: ExportRequest, current_user: dict = Depends(get_current_user)):
    """导出指定行和列的合同为 CSV。"""
    if not ledger_instance:
        raise HTTPException(500, "台账未加载")

    records = ledger_instance.get_all_contracts()
    # 筛选记录
    selected_records = [r for r in records if getattr(r, "row_number", -1) in request.row_ids]

    output = StringIO()
    # 写入 BOM 以防 Excel 中文乱码
    output.write('\\ufeff')
    writer = csv.writer(output)
    writer.writerow(request.columns)

    for r in selected_records:
        data_dict = asdict(r)
        row_data = [str(data_dict.get(col, "")) for col in request.columns]
        writer.writerow(row_data)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=contracts_export.csv"}
    )


@app.post("/api/contracts/search")
async def search_contracts(body: dict[str, Any], current_user: dict = Depends(get_current_user)):
    """智能查询接口，支持多维度过滤"""
    if not ledger_instance:
        raise HTTPException(500, "台账未加载")

    records = ledger_instance.get_all_contracts()
    
    keyword = body.get("keyword", "")
    party_name = body.get("party_name", "")
    status = body.get("status", "")
    min_amount = body.get("min_amount")
    max_amount = body.get("max_amount")

    results = []
    for r in records:
        r_dict = r if isinstance(r, dict) else r.__dict__
        
        # 1. 关键词过滤
        if keyword:
            kw = keyword.lower()
            match = False
            for field in ["合同名称", "对应销售合同", "对方单位名称", "合同编号", "采购方式"]:
                if kw in str(r_dict.get(field, "")).lower():
                    match = True
                    break
            if not match:
                continue
                
        # 2. 对方单位过滤
        if party_name:
            if party_name.lower() not in str(r_dict.get("对方单位名称", "")).lower():
                continue
                
        # 3. 状态过滤
        if status:
            if r_dict.get("合同状态", "") != status:
                continue
                
        # 4. 金额过滤
        amount = float(r_dict.get("合同金额") or 0)
        if min_amount is not None and amount < min_amount:
            continue
        if max_amount is not None and amount > max_amount:
            continue
            
        results.append(r_dict)
        
    return {"contracts": results}


@app.get("/api/warnings")
async def get_warnings(current_user: dict = Depends(get_current_user)):
    """获取合同到期预警和自动关闭候选清单。"""
    if not ledger_instance:
        raise HTTPException(500, "台账未加载")

    return {
        "expiry_warnings": ledger_instance.check_expiry_warnings(),
        "closure_candidates": ledger_instance.check_auto_closure(),
    }


@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...), current_user: dict = Depends(get_admin_user)):
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





import uuid
import shutil

@app.post("/api/attachments/upload")
async def upload_attachment(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """上传附件并保存至 uploads/attachments 目录"""
    try:
        # 确保目录存在
        attachments_dir = Path(__file__).parent.parent / "uploads" / "attachments"
        attachments_dir.mkdir(parents=True, exist_ok=True)
        
        # 生成唯一的文件名防止覆盖
        file_id = str(uuid.uuid4())
        suffix = Path(file.filename or "").suffix
        # 保留原始文件名的前缀，限制长度
        orig_name = Path(file.filename or "attachment").stem[:20]
        safe_filename = f"{orig_name}_{file_id[:8]}{suffix}"
        
        save_path = attachments_dir / safe_filename
        
        # 保存文件
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return {
            "status": "success",
            "url": f"/attachments/{safe_filename}",
            "name": file.filename,
            "uid": file_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"附件上传失败: {str(e)}")

# ── 托管前端静态文件 ───────────────────────────────────────────────


@app.get("/")
async def serve_index():
    """托管前端 index.html 页面。"""
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "未找到前端页面。请将 index.html 放在 frontend/ 目录下。"}


# 挂载静态文件（CSS、JS、资源）
from .config import CONFIG_DIR

avatar_dir = CONFIG_DIR / "avatars"
avatar_dir.mkdir(parents=True, exist_ok=True)
app.mount("/avatars", StaticFiles(directory=str(avatar_dir)), name="avatars")

attachments_dir = Path(__file__).parent.parent / "uploads" / "attachments"
attachments_dir.mkdir(parents=True, exist_ok=True)
app.mount("/attachments", StaticFiles(directory=str(attachments_dir)), name="attachments")


if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


# ── 桌面端入口点 ─────────────────────────────────────────

def start_server():
    """在后台线程中启动 uvicorn 服务。"""
    uvicorn.run(app, host="127.0.0.1", port=18920, log_level="warning")


def main():
    """主入口点：启动 FastAPI 服务。"""
    print("==================================================")
    print("ContracAI Backend Service Started")
    print("Please open in browser: http://127.0.0.1:18920")
    print("==================================================")
    start_server()


if __name__ == "__main__":
    main()
