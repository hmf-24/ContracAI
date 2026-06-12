"""
ContracAI - DB 台账管理器
完全剥离 xlwings 和对本地 Excel/COM 的依赖。
所有增删改查完全在 SQLite 数据库中进行。
保留 `openpyxl` 仅作为初始化时导入遗留 Excel 数据的手段。
"""

import re
import json
from datetime import datetime
from pathlib import Path
from typing import Any, List
from dataclasses import dataclass, field, asdict

from . import db_manager


@dataclass
class ContractRecord:
    """表示单行合同记录"""
    row_number: int = 0
    序号: Any = None
    对应销售合同: str = ""
    合同编号: str = ""
    合同类型: str = ""
    合同名称: str = ""
    对方单位名称: str = ""
    合同金额: float = 0.0
    税率: float = 0.0
    不含税金额: float = 0.0
    履约保证金: str = ""
    签订时间: str = ""
    生效日期: str = ""
    截止日期: str = ""
    合同状态: str = ""
    初验日期: str = ""
    终验日期: str = ""
    经办人: str = ""
    采购方式: str = ""
    主办部门: str = ""
    合同支付条款: str = ""
    备注: str = ""
    已开票情况: str = ""
    付款合计: float = 0.0
    合同未付款合计: float = 0.0
    退履约保证金质保金: str = ""
    payments: list[dict[str, Any]] = field(default_factory=list)


class LedgerManager:
    """
    基于 SQLite 的纯 Python 业务逻辑管理器。
    """

    def __init__(self, ledger_path: str | Path):
        self.ledger_path = Path(ledger_path)
        self._pending_operations: list[dict[str, Any]] = []

        if db_manager.is_db_empty():
            print("检测到 SQLite 数据库为空，正在尝试通过 openpyxl 初始化...")
            if self.ledger_path.exists():
                records = self._read_all_from_excel_openpyxl()
                if records:
                    db_manager.insert_contracts([asdict(r) for r in records])
                    print(f"成功迁移 {len(records)} 条记录到 SQLite。")
                else:
                    print("未能从 Excel 读取到有效数据。")
            else:
                print(f"未找到遗留 Excel 文件: {self.ledger_path}，系统将以空库运行。")

    def _read_all_from_excel_openpyxl(self) -> list[ContractRecord]:
        """使用 openpyxl 轻量化提取数据，取代 xlwings，不依赖 COM"""
        import openpyxl
        records = []
        try:
            wb = openpyxl.load_workbook(str(self.ledger_path), data_only=True)
            sheet = wb.worksheets[0]
            
            # 从第5行开始扫描，直到遇到完全空的行
            row_idx = 5
            while True:
                name_val = sheet[f"E{row_idx}"].value
                # 如果连续3行没有名称，或者遇到汇总行，则退出
                if not name_val:
                    if sheet[f"E{row_idx+1}"].value is None and sheet[f"E{row_idx+2}"].value is None:
                        break
                    row_idx += 1
                    continue
                
                # 简单解析逻辑
                def get_val(col_letter):
                    val = sheet[f"{col_letter}{row_idx}"].value
                    return val if val is not None else ""
                
                try:
                    amount = float(get_val("G")) if str(get_val("G")).strip() else 0.0
                except:
                    amount = 0.0

                try:
                    paid_total = float(get_val("Z")) if str(get_val("Z")).strip() else 0.0
                except:
                    paid_total = 0.0

                record = ContractRecord(
                    row_number=row_idx,
                    合同编号=str(get_val("C")),
                    合同名称=str(get_val("E")),
                    对方单位名称=str(get_val("F")),
                    合同金额=amount,
                    付款合计=paid_total,
                    合同未付款合计=amount - paid_total,
                    合同状态=str(get_val("N") or "执行中"),
                    截止日期=str(get_val("M")),
                )
                records.append(record)
                row_idx += 1
                
        except Exception as e:
            print(f"Openpyxl 读取失败: {e}")
            
        return records

    def prepare_new_contract(self, data: dict[str, Any]) -> dict[str, Any]:
        amount = float(data.get("合同金额", 0))
        preview = {
            "action": "create_contract",
            "fields": {
                "合同名称": data.get("合同名称", "未命名"),
                "对方单位名称": data.get("对方单位名称", ""),
                "合同金额": amount,
                "合同状态": "执行中",
                "付款合计": 0,
                "合同未付款合计": amount
            },
        }
        self._pending_operations.append(preview)
        return preview

    def prepare_milestone_update(self, row: int, milestone_type: str, date_str: str) -> dict[str, Any]:
        preview = {
            "action": "update_milestone",
            "target_row": row,
            "field": milestone_type,
            "new_value": date_str,
        }
        self._pending_operations.append(preview)
        return preview

    def prepare_status_update(self, row: int, status: str) -> dict[str, Any]:
        preview = {
            "action": "update_status",
            "target_row": row,
            "field": "合同状态",
            "new_value": status,
        }
        self._pending_operations.append(preview)
        return preview

    def prepare_payment(self, row: int, amount: float, pay_date: str) -> dict[str, Any]:
        records = self.get_all_contracts()
        target_record = next((r for r in records if r.row_number == row), None)
        if not target_record:
            raise ValueError(f"未找到目标合同 (row: {row})")

        contract_amount = target_record.合同金额 or 0
        current_total = target_record.付款合计 or 0

        preview = {
            "action": "append_payment",
            "target_row": row,
            "amount": amount,
            "pay_date": pay_date,
            "current_total": current_total,
            "new_total_after": current_total + amount,
        }
        self._pending_operations.append(preview)
        return preview

    def execute_pending(self) -> list[dict[str, Any]]:
        if not self._pending_operations:
            return [{"status": "no_pending_operations"}]

        results = []
        try:
            for op in self._pending_operations:
                action = op["action"]
                if action == "create_contract":
                    new_id = db_manager.insert_contract(op["fields"])
                    results.append({"status": "success", "row": new_id, "message": "合同归档成功"})
                
                elif action in ("update_milestone", "update_status", "append_payment"):
                    row_id = op["target_row"]
                    records = self.get_all_contracts()
                    target_record = next((r for r in records if r.row_number == row_id), None)
                    
                    if target_record:
                        data = asdict(target_record)
                        
                        if action in ("update_milestone", "update_status"):
                            data[op["field"]] = op["new_value"]
                        elif action == "append_payment":
                            data["付款合计"] = op["new_total_after"]
                            data["合同未付款合计"] = data.get("合同金额", 0) - op["new_total_after"]
                            
                            payments = data.get("payments", [])
                            payments.append({
                                "amount": op["amount"],
                                "time": op["pay_date"],
                                "group_index": len(payments)
                            })
                            data["payments"] = payments

                        db_manager.update_contract(row_id, data)
                        results.append({"status": "success", "message": f"操作 {action} 执行成功"})
                    else:
                        results.append({"status": "error", "message": "未找到对应的合同记录"})
                else:
                    results.append({"status": "error", "message": f"未知操作: {action}"})

            return results
        finally:
            self._pending_operations.clear()

    def check_auto_closure(self) -> list[dict[str, Any]]:
        candidates = []
        for c in self.get_all_contracts():
            if c.合同状态 == "执行中" and c.退履约保证金质保金 and float(c.合同未付款合计 or 0) <= 0:
                candidates.append({
                    "row": c.row_number,
                    "合同名称": c.合同名称,
                    "对方单位名称": c.对方单位名称,
                    "suggestion": "自动结项",
                })
        return candidates

    def check_expiry_warnings(self, days_ahead: int = 7) -> list[dict[str, Any]]:
        warnings = []
        today = datetime.now().date()
        for c in self.get_all_contracts():
            if c.合同状态 != "执行中" or not c.截止日期 or c.截止日期.strip() == "-":
                continue
            
            try:
                deadline_date = datetime.strptime(c.截止日期[:10], "%Y-%m-%d").date()
                days_left = (deadline_date - today).days
                if 0 <= days_left <= days_ahead:
                    warnings.append({
                        "row": c.row_number,
                        "合同名称": c.合同名称,
                        "截止日期": str(deadline_date),
                        "剩余天数": days_left,
                    })
            except ValueError:
                continue

        return warnings

    def get_all_contracts(self) -> list[ContractRecord]:
        db_records = db_manager.get_all_contracts()
        return [ContractRecord(**r) for r in db_records]

    def search_contracts(self, keyword: str) -> list[ContractRecord]:
        db_records = db_manager.search_contracts(keyword)
        return [ContractRecord(**r) for r in db_records]
