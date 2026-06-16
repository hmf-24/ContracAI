"""
ContracAI - LLM 意图路由解析

使用 LLM（通过 LLMClient）将用户的自然语言指令解析为
LedgerManager 对应的结构化工具调用。

支持的意图：
  - create_contract: 新增合同建档
  - update_milestone: 更新执行节点 (初验/终验)
  - append_payment: 追加付款记录
  - search_contract: 查询合同信息
  - parse_document: 解析合同文件 (PDF/Word/图片)
"""

import json
from typing import Any

from .llm_client import LLMClient
from .config import get_config


# 用于 Function Calling 的工具定义（兼容 OpenAI 格式）
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_contract",
            "description": "新增一条合同记录到台账。当用户提到签了新合同、新增合同等场景时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "合同名称": {"type": "string", "description": "合同的名称/项目名称"},
                    "对方单位名称": {"type": "string", "description": "合同对方单位/供应商名称"},
                    "合同金额": {"type": "number", "description": "合同总金额（元）"},
                    "税率": {"type": "number", "description": "税率，如0.13表示13%"},
                    "合同编号": {"type": "string", "description": "合同编号（如有）"},
                    "合同类型": {"type": "string", "description": "合同类型（如有）"},
                    "对应销售合同": {"type": "string", "description": "对应的销售合同（如有）"},
                    "经办人": {"type": "string", "description": "经办人姓名"},
                    "采购方式": {"type": "string", "description": "采购方式"},
                    "签订时间": {"type": "string", "description": "合同签订时间"},
                    "生效日期": {"type": "string", "description": "合同生效日期"},
                    "截止日期": {"type": "string", "description": "合同截止日期（以质保/维保结束时间为准）"},
                    "合同支付条款": {"type": "string", "description": "合同支付条款描述"},
                    "履约保证金": {"type": "string", "description": "履约保证金/质保金情况"},
                },
                "required": ["合同名称", "对方单位名称", "合同金额"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_milestone",
            "description": "更新合同的执行节点日期（初验、终验）。当用户提到某个项目初验通过、终验完成等场景时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "合同关键词": {"type": "string", "description": "用于定位合同的关键词（合同名称或对方单位）"},
                    "节点类型": {
                        "type": "string",
                        "enum": ["初验日期", "终验日期", "其他"],
                        "description": "要更新的执行节点类型",
                    },
                    "日期": {"type": "string", "description": "节点日期，格式 YYYY-MM-DD 或 YYYY/MM/DD"},
                },
                "required": ["合同关键词", "节点类型", "日期"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "append_payment",
            "description": "追加一笔付款记录。当用户提到付了多少钱、打款了、支付了等场景时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "合同关键词": {"type": "string", "description": "用于定位合同的关键词"},
                    "付款金额": {"type": "number", "description": "本次付款金额（元）"},
                    "付款时间": {"type": "string", "description": "付款日期，格式 YYYY-MM-DD"},
                },
                "required": ["合同关键词", "付款金额", "付款时间"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_preference",
            "description": "保存用户的偏好或纠错设定（如'我说的金额都是指万元'，'含税通常是13%'）。当用户提出长期有效的规则或纠正AI的理解时调用此工具。",
            "parameters": {
                "type": "object",
                "properties": {
                    "preference": {"type": "string", "description": "要保存的偏好或规则内容"},
                },
                "required": ["preference"],
            },
        },
    },
]

SYSTEM_PROMPT = """你是一个采购合同台账管理助手。你的职责是理解用户的自然语言指令，并调用相应的工具函数来操作合同台账。

关键规则：
1. 仔细理解用户意图，提取合同名称、对方单位、金额、税率、日期等关键信息
2. 如果用户的指令不够明确，主动询问缺失的必要信息
3. 税率如果用户说"13%"或"13个点"，转换为 0.13
4. 金额如果用户说"50万"，转换为 500000
5. 如果用户说"今天"，使用今天的日期
6. 日期统一使用 YYYY-MM-DD 格式
7. 如果用户只是闲聊或问好，直接友好回复，不要调用工具

当前日期：{current_date}
"""


class LLMRouter:
    """通过 LLM 将自然语言路由解析为结构化工具调用。"""

    def __init__(self):
        self.client = LLMClient(get_config().chat_llm)
        # per-session 对话隔离，防止多用户串话
        self._sessions: dict[str, list[dict[str, Any]]] = {}

    def _get_history(self, session_id: str) -> list[dict[str, Any]]:
        if session_id not in self._sessions:
            self._sessions[session_id] = []
        return self._sessions[session_id]

    def _get_system_message(self, session_id: str, current_message: str) -> dict[str, str]:
        from datetime import datetime
        from .memory_manager import memory_manager
        
        # 召回长期记忆
        memories = memory_manager.query_memory(session_id, current_message)
        memory_context = ""
        if memories:
            memory_context = "\n用户的历史长期偏好设定：\n- " + "\n- ".join(memories) + "\n请在回答和提取数据时务必遵守上述设定。"

        return {
            "role": "system",
            "content": SYSTEM_PROMPT.format(current_date=datetime.now().strftime("%Y-%m-%d")) + memory_context,
        }

    async def process_message(self, user_message: str, session_id: str = "default") -> dict[str, Any]:
        """
        通过 LLM 处理用户消息。

        返回:
            包含以下内容的字典：
            - {"type": "text", "content": "..."} 表示纯文本回复
            - {"type": "tool_call", "function": "...", "arguments": {...}} 表示需要执行的操作
            - {"type": "clarification", "content": "..."} 表示需要补充信息
        """
        history = self._get_history(session_id)
        
        # 构建本次调用的消息列表
        messages = [self._get_system_message(session_id, user_message)] + history + [{"role": "user", "content": user_message}]

        response = await self.client.chat(messages=messages, tools=TOOLS)
        message = self.client.get_choice_message(response)

        # 检查 LLM 是否需要调用工具
        if message.get("tool_calls"):
            tool_call = message["tool_calls"][0]
            func_name = tool_call["function"]["name"]
            arguments = json.loads(tool_call["function"]["arguments"])

            # 将助手的消息添加到历史记录
            history.append(message)

            return {
                "type": "tool_call",
                "function": func_name,
                "arguments": arguments,
                "tool_call_id": tool_call["id"],
            }
        else:
            # 纯文本回复
            content = message.get("content", "")
            history.append({"role": "assistant", "content": content})
            return {"type": "text", "content": content}

    async def process_message_stream(self, user_message: str, session_id: str = "default", context: str = ""):
        """
        通过 LLM 处理用户消息，返回异步生成器以支持流式输出 (SSE)。
        """
        history = self._get_history(session_id)
        
        final_message = user_message
        if context:
            final_message = f"{context}\n\n[用户问题]\n{user_message}"
            
        messages = [self._get_system_message(session_id, final_message)] + history + [{"role": "user", "content": final_message}]

        is_tool_call = False
        tool_call_buffer = {"id": "", "function": {"name": "", "arguments": ""}}
        text_buffer = ""

        async for chunk in self.client.chat_stream(messages=messages, tools=TOOLS):
            if not chunk.get("choices"):
                continue
            delta = chunk["choices"][0].get("delta", {})

            if "tool_calls" in delta and delta["tool_calls"]:
                is_tool_call = True
                tc = delta["tool_calls"][0]
                if "id" in tc and tc["id"]:
                    tool_call_buffer["id"] = tc["id"]
                if "function" in tc:
                    if "name" in tc["function"] and tc["function"]["name"]:
                        tool_call_buffer["function"]["name"] = tc["function"]["name"]
                    if "arguments" in tc["function"] and tc["function"]["arguments"]:
                        tool_call_buffer["function"]["arguments"] += tc["function"]["arguments"]

            elif "content" in delta and delta["content"]:
                content = delta["content"]
                text_buffer += content
                yield json.dumps({"type": "text", "content": content}, ensure_ascii=False) + "\n"

        if is_tool_call:
            history.append({
                "role": "assistant",
                "content": None,
                "tool_calls": [tool_call_buffer]
            })
            yield json.dumps({
                "type": "tool_call",
                "function": tool_call_buffer["function"]["name"],
                "arguments": json.loads(tool_call_buffer["function"]["arguments"] or "{}"),
                "tool_call_id": tool_call_buffer["id"]
            }, ensure_ascii=False) + "\n"
        else:
            history.append({"role": "assistant", "content": text_buffer})
            yield json.dumps({"type": "done"}, ensure_ascii=False) + "\n"

    def add_tool_result(self, tool_call_id: str, result: str, session_id: str = "default"):
        """将工具执行结果添加回对话历史记录中。"""
        history = self._get_history(session_id)
        history.append({
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": result,
        })

    def clear_history(self, session_id: str = "default"):
        """清除对话历史记录。"""
        if session_id in self._sessions:
            del self._sessions[session_id]
