"""
ContracAI - 配置管理

管理应用程序设置，包括 LLM 终端、API 密钥、
Excel 台账路径和钉钉配置。
设置持久化在本地的 JSON 文件中以确保便携性。
"""

import json
import os
from pathlib import Path
from dataclasses import dataclass, field, asdict


# 默认配置文件位置（在 exe 旁边或项目根目录下）
CONFIG_DIR = Path(os.environ.get("CONTRACAI_CONFIG_DIR", Path.home() / ".contrac-ai"))
CONFIG_FILE = CONFIG_DIR / "config.json"


@dataclass
class LLMConfig:
    """LLM 服务配置（兼容 OpenAI 的 API）。"""
    base_url: str = "https://api.minimax.chat/v1"
    api_key: str = ""
    model: str = "MiniMax-M3"
    temperature: float = 0.1
    max_tokens: int = 4096


@dataclass
class AppConfig:
    """顶级应用程序配置。"""
    # Excel 台账文件路径
    ledger_path: str = ""
    # LLM 设置
    llm: LLMConfig = field(default_factory=LLMConfig)
    # 钉钉（保留用于未来功能）
    dingtalk_webhook: str = ""
    dingtalk_secret: str = ""

    def save(self) -> None:
        """将配置持久化保存到磁盘。"""
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(asdict(self), f, ensure_ascii=False, indent=2)

    @classmethod
    def load(cls) -> "AppConfig":
        """从磁盘加载配置，如果失败则回退到默认值。"""
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                llm_data = data.pop("llm", {})
                return cls(llm=LLMConfig(**llm_data), **data)
            except (json.JSONDecodeError, TypeError):
                pass
        return cls()


# 单例实例
_config: AppConfig | None = None


def get_config() -> AppConfig:
    """获取全局配置单例。"""
    global _config
    if _config is None:
        _config = AppConfig.load()
    return _config


def reload_config() -> AppConfig:
    """强制从磁盘重新加载配置。"""
    global _config
    _config = AppConfig.load()
    return _config
