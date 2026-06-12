import unittest
import os
import shutil
import tempfile
from pathlib import Path

from backend.app.ledger_manager import LedgerManager, ContractRecord


class TestLedgerManager(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # 寻找测试模板文件
        cls.template_path = Path("e:/Project/contrac-ai/附件1.6采购-运维技术部.xlsx")
        if not cls.template_path.exists():
            raise FileNotFoundError(f"未找到 Excel 模板文件: {cls.template_path}")

    def setUp(self):
        # 创建临时工作目录并拷贝 Excel 文件进行测试
        self.temp_dir = tempfile.mkdtemp()
        self.test_excel_path = Path(self.temp_dir) / "test_ledger.xlsx"
        shutil.copy(self.template_path, self.test_excel_path)
        self.manager = LedgerManager(self.test_excel_path)

    def tearDown(self):
        # 清理临时文件和目录
        try:
            if self.test_excel_path.exists():
                # 尝试删除，捕获可能未关闭 Excel 进程导致的占用异常
                os.remove(self.test_excel_path)
            shutil.rmtree(self.temp_dir)
        except Exception as e:
            print(f"清理临时文件失败: {e}")

    def test_01_search_contracts(self):
        """测试模糊匹配搜索合同"""
        # 测试模板中应该包含某些默认数据，比如含有 "华为" 或 "交换机" 关键字的合同
        results = self.manager.search_contracts("交换机")
        self.assertIsInstance(results, list)
        for record in results:
            self.assertIsInstance(record, ContractRecord)
            self.assertTrue("交换机" in record.合同名称 or "交换机" in record.对方单位名称)

    def test_02_create_contract(self):
        """测试新增合同记录"""
        new_data = {
            "合同名称": "测试新建合同项目",
            "对方单位名称": "测试供应商公司",
            "合同金额": 100000.0,
            "税率": 0.13,
            "对应销售合同": "XS-2026-001",
            "合同编号": "CG-2026-002",
            "合同类型": "采购",
            "经办人": "张三",
            "采购方式": "公开招标",
            "合同支付条款": "首付50%，初验后支付50%",
        }

        # 准备新增
        preview = self.manager.prepare_new_contract(new_data)
        self.assertEqual(preview["action"], "create_contract")
        self.assertEqual(preview["fields"]["不含税金额"], round(100000.0 / 1.13, 2))

        # 执行写入
        results = self.manager.execute_pending()
        self.assertEqual(results[0]["status"], "success")
        new_row = results[0]["row"]

        # 验证写入结果
        search_res = self.manager.search_contracts("测试新建")
        self.assertEqual(len(search_res), 1)
        record = search_res[0]
        self.assertEqual(record.row_number, new_row)
        self.assertEqual(record.合同名称, "测试新建合同项目")
        self.assertEqual(record.对方单位名称, "测试供应商公司")
        self.assertEqual(record.合同金额, 100000.0)

    def test_03_update_milestone(self):
        """测试更新合同执行节点日期"""
        # 先搜索华为的合同作为测试目标
        results = self.manager.search_contracts("华为")
        if not results:
            self.skipTest("模板中未找到用于测试的华为合同")

        target = results[0]
        row = target.row_number
        test_date = "2026-06-15"

        # 准备更新
        preview = self.manager.prepare_milestone_update(row, "初验日期", test_date)
        self.assertEqual(preview["action"], "update_milestone")
        self.assertEqual(preview["target_row"], row)
        self.assertEqual(preview["new_value"], test_date)

        # 执行写入
        exec_res = self.manager.execute_pending()
        self.assertEqual(exec_res[0]["status"], "success")

        # 验证写入结果
        updated_records = self.manager.search_contracts(target.合同名称)
        updated_record = [r for r in updated_records if r.row_number == row][0]
        # xlwings 读取日期可能会转换为 datetime 对象或包含时间，这里我们做字符串匹配
        self.assertIn("2026-06-15", str(updated_record.初验日期))

    def test_04_append_payment_and_overpay_guard(self):
        """测试追加付款记录及付款超额校验机制"""
        new_data = {
            "合同名称": "测试付款超额合同",
            "对方单位名称": "付款测试供应商",
            "合同金额": 50000.0,
            "税率": 0.06,
        }
        # 新增该合同
        self.manager.prepare_new_contract(new_data)
        new_row = self.manager.execute_pending()[0]["row"]

        # 1. 正常追加付款
        pay_preview = self.manager.prepare_payment(new_row, 20000.0, "2026-07-01")
        self.assertEqual(pay_preview["action"], "append_payment")
        self.assertEqual(pay_preview["amount"], 20000.0)
        self.assertEqual(pay_preview["pay_date"], "2026-07-01")

        # 执行写入
        self.manager.execute_pending()

        # 2. 验证已付款及再次追加
        contracts = self.manager.search_contracts("测试付款超额合同")
        self.assertEqual(contracts[0].payments[0]["amount"], 20000.0)

        # 3. 超额付款校验，剩余额度为 30000，付款 40000 应该抛出异常
        with self.assertRaises(ValueError) as context:
            self.manager.prepare_payment(new_row, 40000.0, "2026-07-15")
        self.assertTrue("付款超额" in str(context.exception))


if __name__ == "__main__":
    unittest.main()

