import xlwings as xw
import shutil
from pathlib import Path
import random
from datetime import datetime, timedelta

def main():
    root = Path(__file__).parent.parent
    src_file = root / "附件1.6采购-运维技术部.xlsx"
    dst_file = root / "mock_ledger.xlsx"
    
    if not src_file.exists():
        print(f"Source file {src_file} not found. Cannot generate mock data based on template.")
        return
        
    shutil.copy(src_file, dst_file)
    print(f"Copied template to {dst_file}")
    
    app = xw.App(visible=False)
    try:
        wb = app.books.open(str(dst_file))
        sht = wb.sheets[0]
        
        # Clear existing data rows (from row 5 to 50)
        sht.range("B5:W50").clear_contents()
        sht.range("AA5:AL50").clear_contents()
        sht.range("AM5:AM50").clear_contents()
        
        vendors = ["华为技术有限公司", "新华三技术有限公司", "浪潮电子信息产业股份有限公司", "阿里云计算有限公司", "腾讯云计算（北京）有限责任公司"]
        contracts = ["核心交换机扩容采购项目", "超融合集群服务器采购", "云平台年度维保服务", "态势感知安全设备采购", "数据库迁移服务", "总部大楼网络弱电改造"]
        types = ["硬件采购", "维保服务", "工程实施", "软件授权"]
        
        for i in range(5, 20):
            vendor = random.choice(vendors)
            contract_name = random.choice(contracts)
            ctype = random.choice(types)
            amount = round(random.uniform(50000, 2000000), 2)
            rate = 0.06 if ctype == "维保服务" else 0.13
            
            sht.range(f"B{i}").value = f"XS-2025-{random.randint(1000, 9999)}"
            sht.range(f"C{i}").value = f"CG-2025-{i:03d}"
            sht.range(f"D{i}").value = ctype
            sht.range(f"E{i}").value = contract_name + f" (第{i-4}期)"
            sht.range(f"F{i}").value = vendor
            sht.range(f"G{i}").value = amount
            sht.range(f"H{i}").value = rate
            sht.range(f"I{i}").value = round(amount / (1 + rate), 2)
            sht.range(f"J{i}").value = round(amount * 0.05, 2)
            
            # Dates
            base_date = datetime.now() - timedelta(days=random.randint(10, 300))
            sht.range(f"K{i}").value = base_date.strftime("%Y-%m-%d")
            sht.range(f"L{i}").value = base_date.strftime("%Y-%m-%d")
            sht.range(f"M{i}").value = (base_date + timedelta(days=365)).strftime("%Y-%m-%d")
            
            status = random.choice(["执行中", "已结项"])
            sht.range(f"N{i}").value = status
            
            sht.range(f"R{i}").value = random.choice(["张三", "李四", "王五"])
            sht.range(f"S{i}").value = "公开招标" if amount > 500000 else "竞争性谈判"
            sht.range(f"T{i}").value = "运维技术部"
            
            # Payments
            if status == "已结项":
                sht.range(f"AA{i}").value = amount
                sht.range(f"AB{i}").value = (base_date + timedelta(days=30)).strftime("%Y-%m-%d")
            else:
                paid = 0
                if random.random() > 0.3:
                    paid = round(amount * 0.3, 2)
                    sht.range(f"AA{i}").value = paid
                    sht.range(f"AB{i}").value = (base_date + timedelta(days=15)).strftime("%Y-%m-%d")
                
                if random.random() > 0.5:
                    paid2 = round(amount * 0.6, 2)
                    sht.range(f"AC{i}").value = paid2
                    sht.range(f"AD{i}").value = (base_date + timedelta(days=60)).strftime("%Y-%m-%d")
                    paid += paid2
            
        wb.save()
        wb.close()
        print("Mock data generated successfully!")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        app.quit()

if __name__ == "__main__":
    main()
