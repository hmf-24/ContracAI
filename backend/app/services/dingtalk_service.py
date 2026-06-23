"""
ContracAI - 钉钉集成（保留未来开发）

提供钉钉机器人 Webhook 通知和互动卡片功能，用于移动端协作。
本模块目前作为一个预留占位实现。
"""

import hashlib
import hmac
import base64
import time
import urllib.parse
from typing import Any

import httpx

from ..core.config import get_config


class DingTalkBot:
    """钉钉机器人通知客户端。"""

    def __init__(self):
        cfg = get_config()
        self.webhook = cfg.dingtalk_webhook
        self.secret = cfg.dingtalk_secret

    def _sign(self) -> tuple[str, str]:
        """为已签名的 Webhook 生成钉钉签名。"""
        timestamp = str(round(time.time() * 1000))
        string_to_sign = f"{timestamp}\n{self.secret}"
        hmac_code = hmac.new(
            self.secret.encode("utf-8"),
            string_to_sign.encode("utf-8"),
            digestmod=hashlib.sha256,
        ).digest()
        sign = urllib.parse.quote_plus(base64.b64encode(hmac_code))
        return timestamp, sign

    async def send_text(self, content: str, at_all: bool = False) -> dict:
        """向钉钉群发送文本消息。"""
        if not self.webhook:
            return {"status": "skipped", "reason": "DingTalk not configured"}

        url = self.webhook
        if self.secret:
            ts, sign = self._sign()
            url += f"&timestamp={ts}&sign={sign}"

        payload = {
            "msgtype": "text",
            "text": {"content": content},
            "at": {"isAtAll": at_all},
        }

        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload)
            return resp.json()

    async def send_action_card(
        self,
        title: str,
        markdown_text: str,
        buttons: list[dict[str, str]] | None = None,
    ) -> dict:
        """
        向钉钉发送互动的 ActionCard 卡片消息。

        参数:
            title: 卡片标题。
            markdown_text: 卡片正文的 Markdown 内容。
            buttons: {"title": "...", "actionURL": "..."} 字典的列表。
        """
        if not self.webhook:
            return {"status": "skipped", "reason": "DingTalk not configured"}

        url = self.webhook
        if self.secret:
            ts, sign = self._sign()
            url += f"&timestamp={ts}&sign={sign}"

        card: dict[str, Any] = {
            "title": title,
            "text": markdown_text,
        }

        if buttons and len(buttons) > 1:
            card["btns"] = buttons
            card["btnOrientation"] = "0"  # 垂直排列按钮
            payload = {"msgtype": "actionCard", "actionCard": card}
        elif buttons and len(buttons) == 1:
            card["singleTitle"] = buttons[0]["title"]
            card["singleURL"] = buttons[0]["actionURL"]
            payload = {"msgtype": "actionCard", "actionCard": card}
        else:
            payload = {"msgtype": "actionCard", "actionCard": card}

        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload)
            return resp.json()

    async def send_expiry_warning(
        self,
        contract_name: str,
        deadline: str,
        days_left: int,
    ) -> dict:
        """发送合同到期预警卡片。"""
        markdown = (
            f"### ⚠️ 合同即将到期预警\n\n"
            f"**合同名称**：{contract_name}\n\n"
            f"**截止日期**：{deadline}\n\n"
            f"**剩余天数**：{days_left} 天\n\n"
            f"请及时处理质保到期事宜。"
        )
        return await self.send_action_card(
            title=f"合同到期预警 - {contract_name}",
            markdown_text=markdown,
        )
