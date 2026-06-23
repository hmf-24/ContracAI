import sqlite3
import os
from datetime import datetime
from typing import List, Dict, Any

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "memory.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

class MemoryManager:
    def __init__(self):
        self.init_db()

    def init_db(self):
        with get_connection() as conn:
            # user_preferences (FTS5)
            conn.execute("CREATE VIRTUAL TABLE IF NOT EXISTS user_preferences USING fts5(user_id UNINDEXED, content, timestamp UNINDEXED)")
            # episodic_memory (FTS5)
            conn.execute("CREATE VIRTUAL TABLE IF NOT EXISTS episodic_memory USING fts5(user_id UNINDEXED, content, timestamp UNINDEXED)")
            # correction_memory
            conn.execute("""
                CREATE TABLE IF NOT EXISTS correction_memory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT,
                    field TEXT,
                    ai_value TEXT,
                    user_value TEXT,
                    context TEXT,
                    timestamp TEXT
                )
            """)
            conn.commit()

    # ── 偏好记忆 (Preferences) ──
    def add_memory(self, user_id: str, content: str):
        """兼容旧接口：添加偏好记忆"""
        with get_connection() as conn:
            conn.execute(
                "INSERT INTO user_preferences (user_id, content, timestamp) VALUES (?, ?, ?)",
                (user_id, content, datetime.now().isoformat())
            )
            conn.commit()

    def query_memory(self, user_id: str, query: str, n_results: int = 3) -> List[str]:
        """兼容旧接口：检索偏好记忆"""
        try:
            with get_connection() as conn:
                # FTS5 match query
                # SQLite FTS5 requires quotes around the query terms if they contain special characters, 
                # but for simplicity, we do a basic match. If query is empty, return recent.
                if not query.strip():
                    cursor = conn.execute(
                        "SELECT content FROM user_preferences WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?",
                        (user_id, n_results)
                    )
                else:
                    # Clean query string to avoid FTS5 syntax errors
                    safe_query = ''.join(e for e in query if e.isalnum() or e.isspace())
                    cursor = conn.execute(
                        "SELECT content FROM user_preferences WHERE user_id = ? AND user_preferences MATCH ? ORDER BY rank LIMIT ?",
                        (user_id, safe_query, n_results)
                    )
                return [row["content"] for row in cursor]
        except Exception as e:
            print(f"Memory query error: {e}")
            return []

    # ── 操作记忆 (Episodic Memory) ──
    def add_episodic_memory(self, user_id: str, content: str):
        with get_connection() as conn:
            conn.execute(
                "INSERT INTO episodic_memory (user_id, content, timestamp) VALUES (?, ?, ?)",
                (user_id, content, datetime.now().isoformat())
            )
            conn.commit()

    def query_episodic_memory(self, user_id: str, query: str, n_results: int = 3) -> List[str]:
        try:
            with get_connection() as conn:
                safe_query = ''.join(e for e in query if e.isalnum() or e.isspace())
                cursor = conn.execute(
                    "SELECT content FROM episodic_memory WHERE user_id = ? AND episodic_memory MATCH ? ORDER BY rank LIMIT ?",
                    (user_id, safe_query, n_results)
                )
                return [row["content"] for row in cursor]
        except Exception:
            return []

    # ── 纠错记忆 (Correction Memory) ──
    def add_correction(self, user_id: str, field: str, ai_value: str, user_value: str, context: str):
        with get_connection() as conn:
            conn.execute(
                "INSERT INTO correction_memory (user_id, field, ai_value, user_value, context, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, field, str(ai_value), str(user_value), context, datetime.now().isoformat())
            )
            conn.commit()

    def get_recent_corrections(self, user_id: str, limit: int = 5) -> List[Dict[str, Any]]:
        with get_connection() as conn:
            cursor = conn.execute(
                "SELECT field, ai_value, user_value, context FROM correction_memory WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?",
                (user_id, limit)
            )
            return [dict(row) for row in cursor]

memory_manager = MemoryManager()
