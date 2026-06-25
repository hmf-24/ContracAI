from fastapi import APIRouter, Depends, HTTPException
from typing import Any, Dict, List
from ..core.auth import get_current_user
from ..core.db import get_all_contracts

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/global")
async def get_global_dashboard(current_user: dict = Depends(get_current_user)):
    records = get_all_contracts()
    
    # 按月统计汇总数据
    monthly_stats: Dict[str, Dict[str, float]] = {}
    
    for r in records:
        date_str = r.get("签订时间") or r.get("生效日期") or r.get("创建时间") or ""
        month = date_str[:7] if len(date_str) >= 7 else "Unknown"
        
        if month not in monthly_stats:
            monthly_stats[month] = {"income": 0.0, "expense": 0.0}
            
        direction = r.get("direction")
        is_income = (direction == "income") or ("销售" in str(r.get("合同类型", "")))
        amount = float(r.get("合同金额") or 0.0)
        
        if is_income:
            monthly_stats[month]["income"] += amount
        else:
            monthly_stats[month]["expense"] += amount

    # 排序并组装数组
    sorted_months = sorted([m for m in monthly_stats.keys() if m != "Unknown"])
    if "Unknown" in monthly_stats:
        sorted_months.append("Unknown")
        
    chart_data = []
    total_income = 0.0
    total_expense = 0.0
    
    for m in sorted_months:
        inc = monthly_stats[m]["income"]
        exp = monthly_stats[m]["expense"]
        total_income += inc
        total_expense += exp
        chart_data.append({
            "month": m,
            "income": inc,
            "expense": exp,
            "profit": inc - exp
        })
        
    # 计算 Top 项目和供应商
    project_profits = {}
    supplier_exposure = {}
    total_unpaid_receivable = 0.0
    total_unpaid_payable = 0.0
    
    for r in records:
        direction = r.get("direction")
        is_income = (direction == "income") or ("销售" in str(r.get("合同类型", "")))
        amount = float(r.get("合同金额") or 0.0)
        unpaid = float(r.get("合同未付款合计") or 0.0)
        
        p_name = str(r.get("project_name") or r.get("项目名称") or "").strip()
        party = str(r.get("对方单位名称") or "").strip()
        
        if p_name:
            if p_name not in project_profits:
                project_profits[p_name] = 0.0
            project_profits[p_name] += (amount if is_income else -amount)
            
        if party and not is_income:
            if party not in supplier_exposure:
                supplier_exposure[party] = 0.0
            supplier_exposure[party] += amount
            
        if is_income:
            total_unpaid_receivable += unpaid
        else:
            total_unpaid_payable += unpaid

    top_projects = sorted([{"name": k, "profit": v} for k, v in project_profits.items()], key=lambda x: x["profit"], reverse=True)[:5]
    top_suppliers = sorted([{"name": k, "amount": v} for k, v in supplier_exposure.items()], key=lambda x: x["amount"], reverse=True)[:5]

    return {
        "status": "success",
        "chart_data": chart_data,
        "summary": {
            "total_income": total_income,
            "total_expense": total_expense,
            "net_profit": total_income - total_expense
        },
        "advanced_metrics": {
            "top_projects": top_projects,
            "top_suppliers": top_suppliers,
            "cash_exposure": {
                "unpaid_receivable": total_unpaid_receivable,
                "unpaid_payable": total_unpaid_payable
            }
        }
    }

@router.get("/project/{project_name}")
async def get_project_dashboard(project_name: str, current_user: dict = Depends(get_current_user)):
    records = get_all_contracts()
    
    project_contracts = []
    total_income = 0.0
    total_expense = 0.0
    paid_income = 0.0
    paid_expense = 0.0
    
    for r in records:
        p_name = str(r.get("project_name") or r.get("项目名称") or "").strip()
        if p_name == project_name:
            project_contracts.append(r)
            
            direction = r.get("direction")
            is_income = (direction == "income") or ("销售" in str(r.get("合同类型", "")))
            amount = float(r.get("合同金额") or 0.0)
            paid = float(r.get("付款合计") or 0.0) # 此处付款合计可以代表已收或已付
            
            if is_income:
                total_income += amount
                paid_income += paid
            else:
                total_expense += amount
                paid_expense += paid
                
    if not project_contracts:
        raise HTTPException(status_code=404, detail="Project not found")

    return {
        "status": "success",
        "project_name": project_name,
        "contracts_count": len(project_contracts),
        "metrics": {
            "expected_profit": total_income - total_expense,
            "cash_flow_gap": paid_income - paid_expense,
            "total_income": total_income,
            "total_expense": total_expense,
            "paid_income": paid_income,
            "paid_expense": paid_expense
        },
        "contracts": project_contracts
    }
