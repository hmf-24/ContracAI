from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Any, Dict, List
from ..core.auth import get_current_user
from ..services.ledger_service import ledger_instance
from ..models.schemas import UpdateContractRequest, ReorderRequest, DeleteContractRequest

router = APIRouter()

@router.get("/contracts")
async def get_all_contracts(current_user: dict = Depends(get_current_user)):
    from ..core.db import get_all_contracts
    return {"contracts": get_all_contracts()}

@router.post("/contracts/update")
async def update_contract(body: UpdateContractRequest, current_user: dict = Depends(get_current_user)):
    row = body.row
    data = body.data
    
    from ..core.db import get_all_contracts, update_contract as db_update_contract
    records = get_all_contracts()
    original = next((r for r in records if r.get("row_number") == row), None)
    if not original:
        raise HTTPException(404, f"找不到行号为 {row} 的合同")
        
    original.update(data)
    db_update_contract(row, original)
    return {"status": "success", "message": "已更新"}

@router.post("/ledger/reorder")
async def reorder_ledger(body: ReorderRequest, current_user: dict = Depends(get_current_user)):
    from ..core.db import update_sort_orders
    update_sort_orders(body.ids)
    return {"status": "success"}

@router.post("/contracts/search")
async def search_contracts_advanced(body: dict, current_user: dict = Depends(get_current_user)):
    from ..core.db import get_all_contracts
    records = get_all_contracts()
    # 简单的多条件精确匹配
    results = []
    for r in records:
        match = True
        for k, v in body.items():
            if not v: continue
            if str(r.get(k, "")) != str(v):
                match = False
                break
        if match:
            results.append(r)
    return {"contracts": results}

@router.get("/contracts/search")
async def search_contracts(q: str, current_user: dict = Depends(get_current_user)):
    from ..core.db import search_contracts as db_search_contracts
    results = db_search_contracts(q)
    return {"contracts": results}

@router.post("/contracts/delete")
async def delete_contract(body: DeleteContractRequest, current_user: dict = Depends(get_current_user)):
    from ..core.db import delete_contract as db_delete_contract
    db_delete_contract(body.row_number)
    return {"status": "success"}

@router.get("/analyze_risk/{row_number}")
async def analyze_risk(row_number: int, current_user: dict = Depends(get_current_user)):
    from ..core.db import get_all_contracts
    records = get_all_contracts()
    record = next((r for r in records if r.get('row_number') == row_number), None)
    if not record:
        raise HTTPException(404, "合同未找到")
    from ..core.llm import LLMClient
    from ..core.config import get_config
    cfg = get_config()
    llm = LLMClient(cfg.get('openai_api_key'), cfg.get('openai_api_base'), cfg.get('openai_model'))
    prompt = f"分析以下合同数据，列出潜在风险（例如未付款金额高、进度滞后等）。合同数据：{record}"
    try:
        reply = await llm.ask(prompt)
        return {"risk_analysis": reply}
    except Exception as e:
        raise HTTPException(500, f"AI分析失败: {str(e)}")
