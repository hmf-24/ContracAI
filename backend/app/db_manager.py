import sqlite3
import json
import os
from datetime import datetime
from typing import List, Dict, Any

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "contracts.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS contracts (
                id INTEGER PRIMARY KEY,
                contract_no TEXT,
                name TEXT,
                data TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS operation_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                user_id TEXT NOT NULL,
                username TEXT NOT NULL,
                action TEXT NOT NULL,
                target TEXT,
                detail TEXT,
                before_data TEXT,
                after_data TEXT
            )
        """)
        conn.commit()

def clear_db():
    with get_connection() as conn:
        conn.execute("DELETE FROM contracts")
        conn.commit()

def is_db_empty() -> bool:
    with get_connection() as conn:
        cursor = conn.execute("SELECT COUNT(*) FROM contracts")
        count = cursor.fetchone()[0]
        return count == 0

def insert_contracts(records: List[Dict[str, Any]]):
    with get_connection() as conn:
        for r in records:
            conn.execute(
                "INSERT INTO contracts (id, contract_no, name, data) VALUES (?, ?, ?, ?)",
                (
                    r.get("row_number"), 
                    r.get("合同编号", ""), 
                    r.get("合同名称", ""), 
                    json.dumps(r, ensure_ascii=False)
                )
            )
        conn.commit()

def get_all_contracts() -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.execute("SELECT data FROM contracts ORDER BY id ASC")
        return [json.loads(row["data"]) for row in cursor]

def update_contract(row_id: int, updated_data: Dict[str, Any]):
    with get_connection() as conn:
        conn.execute(
            "UPDATE contracts SET contract_no = ?, name = ?, data = ? WHERE id = ?",
            (
                updated_data.get("合同编号", ""),
                updated_data.get("合同名称", ""),
                json.dumps(updated_data, ensure_ascii=False),
                row_id
            )
        )
        conn.commit()

def delete_contract(row_id: int):
    with get_connection() as conn:
        conn.execute("DELETE FROM contracts WHERE id = ?", (row_id,))
        conn.commit()

def insert_contract(new_data: Dict[str, Any]) -> int:
    with get_connection() as conn:
        cursor = conn.execute("SELECT MAX(id) FROM contracts")
        max_id = cursor.fetchone()[0] or 0
        new_id = max_id + 1
        new_data["row_number"] = new_id
        conn.execute(
            "INSERT INTO contracts (id, contract_no, name, data) VALUES (?, ?, ?, ?)",
            (
                new_id, 
                new_data.get("合同编号", ""), 
                new_data.get("合同名称", ""), 
                json.dumps(new_data, ensure_ascii=False)
            )
        )
        conn.commit()
        return new_id

def search_contracts(keyword: str) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT data FROM contracts WHERE name LIKE ? OR data LIKE ?",
            (f"%{keyword}%", f"%{keyword}%")
        )
        return [json.loads(row["data"]) for row in cursor]

# ── 审计日志 ──────────────────────────────────────────────────────

def add_audit_log(
    user_id: str,
    username: str,
    action: str,
    target: str = "",
    detail: str = "",
    before_data: str = "",
    after_data: str = "",
):
    """写入一条审计日志。"""
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO operation_logs (timestamp, user_id, username, action, target, detail, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                str(user_id),
                username,
                action,
                target,
                detail,
                before_data,
                after_data,
            )
        )
        conn.commit()

def get_audit_logs(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """获取审计日志（时间倒序）。"""
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT id, timestamp, user_id, username, action, target, detail FROM operation_logs ORDER BY id DESC LIMIT ? OFFSET ?",
            (limit, offset)
        )
        return [dict(row) for row in cursor]

def get_audit_log_count() -> int:
    with get_connection() as conn:
        cursor = conn.execute("SELECT COUNT(*) FROM operation_logs")
        return cursor.fetchone()[0]

# 初始化建表
init_db()
