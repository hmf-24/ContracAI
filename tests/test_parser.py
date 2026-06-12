import unittest
from unittest.mock import AsyncMock, patch, MagicMock
import json

from backend.app.llm_router import LLMRouter
from backend.app.doc_parser import DocParser


class TestLLMParser(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.router = LLMRouter()
        self.parser = DocParser()

    @patch("backend.app.llm_client.LLMClient.chat")
    async def test_router_tool_call(self, mock_chat):
        """测试 LLMRouter 正确解析工具调用意图"""
        # 模拟大模型返回的 Tool Call 响应
        mock_response = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_123456",
                                "type": "function",
                                "function": {
                                    "name": "create_contract",
                                    "arguments": json.dumps({
                                        "合同名称": "交换机项目",
                                        "对方单位名称": "华为",
                                        "合同金额": 500000.0,
                                    }),
                                },
                            }
                        ],
                    }
                }
            ]
        }
        mock_chat.return_value = mock_response

        # 执行路由解析
        result = await self.router.process_message("签了交换机合同，对方是华为，金额50万")

        # 验证返回结构与工具匹配
        self.assertEqual(result["type"], "tool_call")
        self.assertEqual(result["function"], "create_contract")
        self.assertEqual(result["arguments"]["合同名称"], "交换机项目")
        self.assertEqual(result["arguments"]["合同金额"], 500000.0)
        self.assertEqual(result["tool_call_id"], "call_123456")

    @patch("backend.app.llm_client.LLMClient.chat")
    async def test_router_text_reply(self, mock_chat):
        """测试 LLMRouter 返回纯文本应答"""
        mock_response = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "您好！我是合同管理助手，请问有什么可以帮您？",
                    }
                }
            ]
        }
        mock_chat.return_value = mock_response

        result = await self.router.process_message("你好")
        self.assertEqual(result["type"], "text")
        self.assertEqual(result["content"], "您好！我是合同管理助手，请问有什么可以帮您？")

    @patch("backend.app.llm_client.LLMClient.chat")
    async def test_doc_parser_text_extraction(self, mock_chat):
        """测试 DocParser 基于文本的信息抽取解析"""
        mock_response = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": json.dumps({
                            "合同名称": "光纤租赁合同",
                            "对方单位名称": "中国联通",
                            "合同金额": 12000.0,
                            "税率": 0.09,
                        }),
                    }
                }
            ]
        }
        mock_chat.return_value = mock_response

        # 模拟解析纯文本
        result = await self.parser._extract_from_text("这是一份中国联通的光纤租赁合同，总金额1.2万元...", "test_source.txt")

        # 验证解析出结构化 JSON 数据
        self.assertEqual(result["合同名称"], "光纤租赁合同")
        self.assertEqual(result["对方单位名称"], "中国联通")
        self.assertEqual(result["合同金额"], 12000.0)
        self.assertEqual(result["税率"], 0.09)
        self.assertEqual(result["_source_file"], "test_source.txt")

    def test_parse_json_response_with_markdown_blocks(self):
        """测试 DocParser 解析带有 Markdown 代码块包裹的 JSON 响应"""
        raw_markdown = "```json\n{\n  \"合同名称\": \"交换机维护合同\"\n}\n```"
        parsed = self.parser._parse_json_response(raw_markdown, "test.pdf")
        self.assertEqual(parsed["合同名称"], "交换机维护合同")
        self.assertEqual(parsed["_source_file"], "test.pdf")


if __name__ == "__main__":
    unittest.main()

