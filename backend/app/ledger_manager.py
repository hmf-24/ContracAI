"""
ContracAI - Excel 台账管理器

用于读取/写入采购合同台账 Excel 文件的核心模块。
使用 xlwings 直接与 MS Excel 进行交互，能够保留：
  - 合并单元格和多级表头（第 3 行和第 4 行）
  - 内置公式（SUBTOTAL、SUM 等）
  - 单元格格式和样式

物理列映射（基于 附件1.6采购-运维技术部.xlsx）：
  A:  序号（公式 - 只读）
  B:  对应销售合同
  C:  合同编号
  D:  合同类型
  E:  合同名称
  F:  对方单位名称
  G:  合同金额（元）
  H:  税率
  I:  不含税金额（元）
  J:  履约保证金/质保金情况
  K:  签订时间
  L:  生效日期
  M:  截止日期（以质保/维保结束时间为准）
  N:  合同状态
  O:  初验日期 (Row4 子表头)
  P:  终验日期 (Row4 子表头)
  Q:  其他     (Row4 子表头)
  R:  经办人
  S:  采购方式
  T:  主办部门
  U:  合同支付条款
  V:  备注
  W:  已开票情况
  X:  支付情况（自动计算）
  Y:  合同未付款合计（自动计算 =G+J-Z）  - 严格只读
  Z:  付款合计（自动计算 =AA+AC+AE+AG+AI+AK） - 严格只读
  AA-AL: 付款金额/付款时间 (6 组，每组 2 列)
  AM: 退履约保证金、质保金
"""

import re
from datetime import datetime
from pathlib import Path
from typing import Any
from dataclasses import dataclass, field

# xlwings 将在运行时导入（需要安装 MS Excel）
# import xlwings as xw


# --- 列常量 ---
COL = {
    "序号": "A",
    "对应销售合同": "B",
    "合同编号": "C",
    "合同类型": "D",
    "合同名称": "E",
    "对方单位名称": "F",
    "合同金额": "G",
    "税率": "H",
    "不含税金额": "I",
    "履约保证金": "J",
    "签订时间": "K",
    "生效日期": "L",
    "截止日期": "M",
    "合同状态": "N",
    "初验日期": "O",
    "终验日期": "P",
    "其他": "Q",
    "经办人": "R",
    "采购方式": "S",
    "主办部门": "T",
    "合同支付条款": "U",
    "备注": "V",
    "已开票情况": "W",
    "支付情况": "X",
    "合同未付款合计": "Y",
    "付款合计": "Z",
    "退履约保证金质保金": "AM",
}

# 付款列：从 AA 开始的 6 组付款，每组 = (金额列, 时间列)
PAYMENT_START_COL = 27  # AA = 第 27 列
PAYMENT_GROUPS = 6
HEADER_ROW = 3
SUBHEADER_ROW = 4
DATA_START_ROW = 5

# 含有公式、绝对禁止写入的只读列
READONLY_COLS = {"A", "X", "Y", "Z"}


@dataclass
class ContractRecord:
    """表示单行合同记录，用于显示/确认。"""
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
    payments: list[dict[str, Any]] = field(default_factory=list)


class LedgerManager:
    """
    管理采购合同台账 Excel 文件的读写操作。

    所有写入操作均返回预览字典（修改前/修改后）以供用户确认。
    只有在调用 .execute_pending() 时才会执行物理写入。
    """

    def __init__(self, ledger_path: str | Path):
        self.ledger_path = Path(ledger_path)
        if not self.ledger_path.exists():
            raise FileNotFoundError(f"未找到台账文件: {self.ledger_path}")

        self._pending_operations: list[dict[str, Any]] = []

    def _open_workbook(self):
        """通过 xlwings 打开 Excel 工作簿。"""
        import xlwings as xw
        app = xw.App(visible=False)
        wb = app.books.open(str(self.ledger_path))
        sheet = wb.sheets[0]
        return app, wb, sheet

    def _close_workbook(self, app, wb, save: bool = False):
        """关闭工作簿并退出 Excel。"""
        if save:
            wb.save()
        wb.close()
        app.quit()

    def _find_summary_row(self, sheet) -> int:
        """寻找汇总/合计行（即 G 列中含有 SUM 公式的最后一行）。"""
        max_row = sheet.used_range.last_cell.row
        for r in range(max_row, DATA_START_ROW - 1, -1):
            formula = sheet.range(f"G{r}").formula
            if formula and "SUM" in formula.upper():
                return r
        return max_row + 1

    def _find_last_data_row(self, sheet) -> int:
        """寻找最后一行数据行（即汇总行上方的一行）。"""
        summary_row = self._find_summary_row(sheet)
        return summary_row - 1

    # ----------------------------------------------------------------
    # 3.1 合同搜索（模糊匹配）
    # ----------------------------------------------------------------
    def search_contracts(self, keyword: str) -> list[ContractRecord]:
        """
        通过合同名称或对方单位进行模糊匹配搜索合同。

        返回匹配的 ContractRecord 对象列表。
        如果找到多个匹配项，调用者应将其展示给用户
        以便用户进行确认和消除歧义。
        """
        app, wb, sheet = self._open_workbook()
        try:
            results = []
            summary_row = self._find_summary_row(sheet)

            for r in range(DATA_START_ROW, summary_row):
                name = str(sheet.range(f"E{r}").value or "")
                counterparty = str(sheet.range(f"F{r}").value or "")

                if keyword.lower() in name.lower() or keyword.lower() in counterparty.lower():
                    record = self._read_row(sheet, r)
                    results.append(record)

            return results
        finally:
            self._close_workbook(app, wb)

    def _read_row(self, sheet, row: int) -> ContractRecord:
        """将一整行合同数据读取为 ContractRecord。"""
        def val(col: str):
            v = sheet.range(f"{col}{row}").value
            return v if v is not None else ""

        record = ContractRecord(
            row_number=row,
            序号=val("A"),
            对应销售合同=str(val("B")),
            合同编号=str(val("C")),
            合同类型=str(val("D")),
            合同名称=str(val("E")),
            对方单位名称=str(val("F")),
            合同金额=float(val("G") or 0),
            税率=float(val("H") or 0),
            不含税金额=float(val("I") or 0),
            履约保证金=str(val("J")),
            签订时间=str(val("K")),
            生效日期=str(val("L")),
            截止日期=str(val("M")),
            合同状态=str(val("N")),
            初验日期=str(val("O")),
            终验日期=str(val("P")),
            经办人=str(val("R")),
            采购方式=str(val("S")),
            主办部门=str(val("T")),
            合同支付条款=str(val("U")),
            备注=str(val("V")),
            已开票情况=str(val("W")),
            付款合计=float(val("Z") or 0),
            合同未付款合计=float(val("Y") or 0),
        )

        # 读取付款组
        payments = []
        for i in range(PAYMENT_GROUPS):
            amount_col = PAYMENT_START_COL + i * 2
            time_col = amount_col + 1
            amount = sheet.range((row, amount_col)).value
            pay_time = sheet.range((row, time_col)).value
            if amount is not None:
                payments.append({
                    "amount": float(amount),
                    "time": str(pay_time) if pay_time else "",
                    "group_index": i,
                })
        record.payments = payments

        return record

    # ----------------------------------------------------------------
    # 3.1 合同创建（初始归档）
    # ----------------------------------------------------------------
    def prepare_new_contract(self, data: dict[str, Any]) -> dict[str, Any]:
        """
        准备插入新合同。返回预览以供确认。

        参数:
            data: 键与 COL 字段名称相匹配的字典。
                  必需: 合同名称, 对方单位名称, 合同金额
                  可选: 税率, 合同编号, 合同类型等。

        返回:
            包含 'action', 'target_row', 'fields' 的预览字典，用于 UI 显示。
        """
        # 计算派生字段
        amount = float(data.get("合同金额", 0))
        tax_rate = float(data.get("税率", 0))
        if tax_rate > 0:
            tax_free_amount = round(amount / (1 + tax_rate), 2)
        else:
            tax_free_amount = amount

        preview = {
            "action": "create_contract",
            "fields": {
                "对应销售合同": data.get("对应销售合同", ""),
                "合同编号": data.get("合同编号", ""),
                "合同类型": data.get("合同类型", ""),
                "合同名称": data["合同名称"],
                "对方单位名称": data["对方单位名称"],
                "合同金额": amount,
                "税率": tax_rate,
                "不含税金额": tax_free_amount,
                "合同状态": "执行中",
                "已开票情况": data.get("已开票情况", "未开票"),
                "经办人": data.get("经办人", ""),
                "采购方式": data.get("采购方式", ""),
                "主办部门": data.get("主办部门", "运维技术部"),
                "合同支付条款": data.get("合同支付条款", ""),
                "签订时间": data.get("签订时间", ""),
                "生效日期": data.get("生效日期", ""),
                "截止日期": data.get("截止日期", ""),
                "履约保证金": data.get("履约保证金", ""),
            },
        }
        self._pending_operations.append(preview)
        return preview

    # ----------------------------------------------------------------
    # 3.2 执行节点更新
    # ----------------------------------------------------------------
    def prepare_milestone_update(
        self, row: int, milestone_type: str, date_str: str
    ) -> dict[str, Any]:
        """
        准备更新执行节点日期。返回预览以供确认。

        参数:
            row: 目标行号。
            milestone_type: '初验日期'、'终验日期'、'其他' 之一。
            date_str: 要写入的日期字符串。
        """
        col_map = {"初验日期": "O", "终验日期": "P", "其他": "Q"}
        col = col_map.get(milestone_type)
        if not col:
            raise ValueError(f"未知节点类型: {milestone_type}")

        preview = {
            "action": "update_milestone",
            "target_row": row,
            "field": milestone_type,
            "column": col,
            "new_value": date_str,
        }
        self._pending_operations.append(preview)
        return preview

    # ----------------------------------------------------------------
    # 3.3 付款记录追加（核心难点）
    # ----------------------------------------------------------------
    def prepare_payment(
        self, row: int, amount: float, pay_date: str
    ) -> dict[str, Any]:
        """
        准备追加付款记录。寻找第一个空闲的付款位置。
        验证：当前已付总额 + 本次付款金额 <= 合同金额。

        返回预览以供确认，如果超额付款则抛出 ValueError。
        """
        app, wb, sheet = self._open_workbook()
        try:
            contract_amount = float(sheet.range(f"G{row}").value or 0)
            deposit = float(sheet.range(f"J{row}").value or 0)
            current_total = float(sheet.range(f"Z{row}").value or 0)

            # 超额付款防范
            if current_total + amount > contract_amount + deposit:
                raise ValueError(
                    f"付款超额！当前已付 {current_total}，本次 {amount}，"
                    f"合同总额 {contract_amount}（含保证金 {deposit}）"
                )

            # 寻找空闲的付款位置
            target_col = None
            for i in range(PAYMENT_GROUPS):
                col_idx = PAYMENT_START_COL + i * 2  # AA, AC, AE, AG, AI, AK
                val = sheet.range((row, col_idx)).value
                if val is None or val == "" or val == 0:
                    target_col = col_idx
                    break

            if target_col is None:
                raise ValueError("所有付款列已满，无法追加新的付款记录")

            from openpyxl.utils import get_column_letter
            amount_col_letter = get_column_letter(target_col)
            time_col_letter = get_column_letter(target_col + 1)

            preview = {
                "action": "append_payment",
                "target_row": row,
                "amount": amount,
                "pay_date": pay_date,
                "amount_column": amount_col_letter,
                "time_column": time_col_letter,
                "current_total": current_total,
                "contract_amount": contract_amount,
                "new_total_after": current_total + amount,
            }
            self._pending_operations.append(preview)
            return preview
        finally:
            self._close_workbook(app, wb)

    # ----------------------------------------------------------------
    # 执行待决操作（在用户确认后）
    # ----------------------------------------------------------------
    def execute_pending(self) -> list[dict[str, Any]]:
        """
        执行所有已由用户确认的待决操作。
        返回执行结果列表。
        """
        if not self._pending_operations:
            return [{"status": "no_pending_operations"}]

        import xlwings as xw
        app = xw.App(visible=False)
        wb = app.books.open(str(self.ledger_path))
        sheet = wb.sheets[0]
        results = []

        try:
            for op in self._pending_operations:
                action = op["action"]
                if action == "create_contract":
                    result = self._exec_create(sheet, op)
                elif action == "update_milestone":
                    result = self._exec_milestone(sheet, op)
                elif action == "append_payment":
                    result = self._exec_payment(sheet, op)
                else:
                    result = {"status": "error", "message": f"未知操作: {action}"}
                results.append(result)

            wb.save()
            return results
        finally:
            self._pending_operations.clear()
            wb.close()
            app.quit()

    def _exec_create(self, sheet, op: dict) -> dict:
        """执行合同创建：在汇总行之前插入新行，并写入字段。"""
        summary_row = self._find_summary_row(sheet)
        new_row = summary_row  # 在汇总行之前插入

        # 插入新行（会将汇总行下移）
        sheet.range(f"{new_row}:{new_row}").insert("down")

        # 从上方行复制公式（如果它是数据行）
        template_row = new_row - 1 if new_row - 1 >= DATA_START_ROW else DATA_START_ROW

        # 复制公式列 (A, Y, Z)
        for col_letter in ["A", "Y", "Z"]:
            formula = sheet.range(f"{col_letter}{template_row}").formula
            if formula:
                # 调整公式中的行引用
                sheet.range(f"{col_letter}{new_row}").formula = formula.replace(
                    str(template_row), str(new_row)
                )

        # 写入数据字段
        fields = op["fields"]
        for field_name, value in fields.items():
            if field_name in COL and COL[field_name] not in READONLY_COLS:
                col_letter = COL[field_name]
                sheet.range(f"{col_letter}{new_row}").value = value

        # 修正汇总行的 SUM 公式（汇总行现在是 summary_row + 1）
        self._fix_summary_formulas(sheet, summary_row + 1)

        return {"status": "success", "action": "create_contract", "row": new_row}

    def _exec_milestone(self, sheet, op: dict) -> dict:
        """执行执行节点日期更新。"""
        row = op["target_row"]
        col = op["column"]
        sheet.range(f"{col}{row}").value = op["new_value"]
        return {"status": "success", "action": "update_milestone", "row": row}

    def _exec_payment(self, sheet, op: dict) -> dict:
        """执行付款记录追加。"""
        row = op["target_row"]
        sheet.range(f"{op['amount_column']}{row}").value = op["amount"]
        sheet.range(f"{op['time_column']}{row}").value = op["pay_date"]
        return {"status": "success", "action": "append_payment", "row": row}

    def _fix_summary_formulas(self, sheet, summary_row: int):
        """
        在插入新行后，修正汇总行中的 SUM 公式，
        使其包含新的数据范围。
        """
        last_data_row = summary_row - 1
        sum_cols = ["G", "I", "J", "W", "Y", "Z", "AA"]

        for col in sum_cols:
            formula = sheet.range(f"{col}{summary_row}").formula
            if formula and "SUM" in formula.upper():
                # 替换 SUM 范围，使其覆盖 DATA_START_ROW 到 last_data_row
                new_formula = re.sub(
                    r"SUM\([A-Z]+\d+:[A-Z]+\d+\)",
                    f"SUM({col}{DATA_START_ROW}:{col}{last_data_row})",
                    formula,
                    flags=re.IGNORECASE,
                )
                sheet.range(f"{col}{summary_row}").formula = new_formula

    # ----------------------------------------------------------------
    # 3.4 自动结项检测
    # ----------------------------------------------------------------
    def check_auto_closure(self) -> list[dict[str, Any]]:
        """
        扫描所有执行中的合同。如果已退还履约保证金（AM）且未付款余额（Y）为 0，
        建议将合同状态变更为 '已结项'。
        """
        app, wb, sheet = self._open_workbook()
        try:
            candidates = []
            summary_row = self._find_summary_row(sheet)

            for r in range(DATA_START_ROW, summary_row):
                status = str(sheet.range(f"N{r}").value or "")
                if status != "执行中":
                    continue

                deposit_refund = sheet.range(f"AM{r}").value
                unpaid = float(sheet.range(f"Y{r}").value or 0)

                if deposit_refund is not None and deposit_refund != "" and unpaid <= 0:
                    candidates.append({
                        "row": r,
                        "合同名称": str(sheet.range(f"E{r}").value or ""),
                        "对方单位名称": str(sheet.range(f"F{r}").value or ""),
                        "suggestion": "自动结项",
                    })

            return candidates
        finally:
            self._close_workbook(app, wb)

    # ----------------------------------------------------------------
    # 合同到期预警
    # ----------------------------------------------------------------
    def check_expiry_warnings(self, days_ahead: int = 7) -> list[dict[str, Any]]:
        """
        查找在 `days_ahead` 天内即将到期的合同。
        读取 M 列（截止日期）。
        """
        app, wb, sheet = self._open_workbook()
        try:
            warnings = []
            summary_row = self._find_summary_row(sheet)
            today = datetime.now().date()

            for r in range(DATA_START_ROW, summary_row):
                status = str(sheet.range(f"N{r}").value or "")
                if status != "执行中":
                    continue

                deadline = sheet.range(f"M{r}").value
                if deadline is None:
                    continue

                if isinstance(deadline, datetime):
                    deadline_date = deadline.date()
                else:
                    continue

                days_left = (deadline_date - today).days
                if 0 <= days_left <= days_ahead:
                    warnings.append({
                        "row": r,
                        "合同名称": str(sheet.range(f"E{r}").value or ""),
                        "截止日期": str(deadline_date),
                        "剩余天数": days_left,
                    })

            return warnings
        finally:
            self._close_workbook(app, wb)

    def get_all_contracts(self) -> list[ContractRecord]:
        """从台账中读取所有合同记录。"""
        app, wb, sheet = self._open_workbook()
        try:
            records = []
            summary_row = self._find_summary_row(sheet)
            for r in range(DATA_START_ROW, summary_row):
                name = sheet.range(f"E{r}").value
                if name is not None and name != "":
                    records.append(self._read_row(sheet, r))
            return records
        finally:
            self._close_workbook(app, wb)
