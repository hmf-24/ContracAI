from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Any
from ..core.auth import get_current_user
from ..agents.ChatAgent.agent import llm_router
from ..agents.ChatAgent.memory import memory_manager
from ..models.schemas import ChatRequest, InitSessionRequest

router = APIRouter()

@router.post("/chat")
async def chat_endpoint(body: ChatRequest, current_user: dict = Depends(get_current_user)):
    try:
        session_id = current_user.get("username", "default")
        reply = await llm_router.route_and_execute(
            message=body.message,
            session_id=session_id,
            context=body.context
        )
        return {"reply": reply}
    except Exception as e:
        raise HTTPException(500, f"处理聊天请求失败: {str(e)}")

@router.post("/execute")
async def execute_endpoint(body: dict, current_user: dict = Depends(get_current_user)):
    try:
        session_id = current_user.get("username", "default")
        tool_name = body.get("action") or body.get("tool_name")
        arguments = body.get("params") or body.get("arguments", {})
        
        if tool_name == "create_contract":
            from ..core.db import insert_contract
            new_id = insert_contract(arguments)
            result = f"合同已成功创建，ID: {new_id}"
        else:
            # Fallback or error if other tools are called
            result = f"未实现的工具: {tool_name}"

        return {"result": result, "status": "success"}
    except Exception as e:
        raise HTTPException(500, f"工具执行失败: {str(e)}")

@router.get("/graph")
async def get_graph(current_user: dict = Depends(get_current_user)):
    from ..core.db import get_all_contracts
    records = get_all_contracts()
    
    nodes = []
    links = []
    node_ids = set()
    
    def add_node(id_str, name, group, val=1):
        if id_str and id_str not in node_ids:
            nodes.append({"id": id_str, "name": name, "group": group, "val": val})
            node_ids.add(id_str)

    for c in records:
        contract_id = f"C_{c.get('row_number')}"
        contract_name = c.get('合同名称') or f"未知合同 {c.get('row_number')}"
        is_sales = "销售" in str(c.get('合同类型', ''))
        c_group = 1 if is_sales else 2
        amount = float(c.get('合同金额') or 0)
        val = max(1, min(10, amount / 100000))
        
        add_node(contract_id, contract_name, c_group, val=val)
        
        party = c.get('相对方名称') or c.get('对方单位名称')
        if party and str(party).strip():
            party_id = f"P_{str(party).strip()}"
            add_node(party_id, str(party).strip(), 3)
            links.append({"source": contract_id, "target": party_id, "name": "签约方"})
            
        handler = c.get('经办人')
        if handler and str(handler).strip() and str(handler).strip() != "-":
            handler_id = f"H_{str(handler).strip()}"
            add_node(handler_id, str(handler).strip(), 4)
            links.append({"source": contract_id, "target": handler_id, "name": "经办人"})
            
        parent_sales = c.get('对应销售合同')
        if parent_sales and str(parent_sales).strip() and str(parent_sales).strip() != "-":
            parent_match = next((p for p in records if p.get('合同名称') == str(parent_sales).strip()), None)
            if parent_match:
                parent_id = f"C_{parent_match.get('row_number')}"
                links.append({"source": contract_id, "target": parent_id, "name": "依赖"})

    return {"nodes": nodes, "links": links}
