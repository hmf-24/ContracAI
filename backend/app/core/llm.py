"""
ContracAI - 统一的 LLM 客户端（兼容 OpenAI）

为所有 LLM 调用提供统一抽象。支持：
  - 支持函数调用 (Function Calling/tools) 的文本对话
  - 用于图像 OCR 的多模态（视觉）请求

在 MiniMax M3 与本地 LLM 之间切换只需要
更改配置中的 `base_url`、`api_key` 和 `model`。
"""

import base64
import httpx
from pathlib import Path
from typing import Any

from .config import get_config


from .config import LLMConfig

class LLMClient:
    """兼容 OpenAI 的 LLM 客户端。"""

    def __init__(self, cfg: LLMConfig):
        self.base_url = cfg.base_url.rstrip("/")
        self.api_key = cfg.api_key
        self.model = cfg.model
        self.temperature = cfg.temperature
        self.max_tokens = cfg.max_tokens

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | dict | None = None,
    ) -> dict[str, Any]:
        """
        发送聊天补全请求。

        参数:
            messages: OpenAI 格式的消息列表。
            tools: 可选的用于函数调用的函数/工具定义。
            tool_choice: 可选的 tool_choice 参数。

        返回:
            完整的 API 响应字典。
        """
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }
        if tools:
            payload["tools"] = tools
        if tool_choice is not None:
            payload["tool_choice"] = tool_choice

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                headers=self._headers(),
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | dict | None = None,
    ):
        """流式聊天"""
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "stream": True,
        }
        if tools:
            payload["tools"] = tools
        if tool_choice is not None:
            payload["tool_choice"] = tool_choice

        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                headers=self._headers(),
                json=payload,
            ) as response:
                response.raise_for_status()
                async for chunk in response.aiter_lines():
                    if chunk.startswith("data: "):
                        data_str = chunk[6:]
                        if data_str == "[DONE]":
                            break
                        import json
                        try:
                            yield json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

    async def chat_with_vision(
        self,
        text_prompt: str,
        image_paths: list[str | Path],
    ) -> str:
        """
        发送多模态（视觉）聊天请求以进行 OCR / 文档解析。

        参数:
            text_prompt: 指令文本。
            image_paths: 要包含的本地图像文件路径列表。

        返回:
            助手的文本响应。
        """
        content: list[dict[str, Any]] = [{"type": "text", "text": text_prompt}]

        for img_path in image_paths:
            img_path = Path(img_path)
            suffix = img_path.suffix.lower()
            mime_map = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
            mime = mime_map.get(suffix, "image/png")
            img_b64 = base64.b64encode(img_path.read_bytes()).decode("utf-8")
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{img_b64}"},
            })

        messages = [{"role": "user", "content": content}]
        result = await self.chat(messages)
        return result["choices"][0]["message"]["content"]

    def get_choice_message(self, response: dict[str, Any]) -> dict[str, Any]:
        """从聊天响应中提取第一个选项的消息。"""
        return response["choices"][0]["message"]
