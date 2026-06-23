import asyncio
from pathlib import Path
from app.agents.ParserAgent.tools import DocParser
from app.core.config import get_config
import logging

async def main():
    cfg = get_config()
    cfg.mineru_api_key = "eyJ0eXBlIjoiSldUIiwiYWxnIjoiSFM1MTIifQ.eyJqdGkiOiI3NjMwMDg0MCIsInJvbCI6IlJPTEVfUkVHSVNURVIiLCJpc3MiOiJPcGVuWExhYiIsImlhdCI6MTc4MjIwMzA4OSwiY2xpZW50SWQiOiJsa3pkeDU3bnZ5MjJqa3BxOXgydyIsInBob25lIjoiIiwib3BlbklkIjpudWxsLCJ1dWlkIjoiY2NiNWM1ZjMtODU5Zi00YjZhLThjZTAtNGU4MTUxY2FlZjcxIiwiZW1haWwiOiIiLCJleHAiOjE3ODk5NzkwODl9.EQulJaArx5TY-vpDK7tA19_5OuGbzqOdyh0UrEvmPdMKWjaLGQvx_3_JHgCnOT2Ir233kvudSYYsNHjcVWmcww"
    
    parser = DocParser()
    file_path = Path(r"C:\Users\12818\Desktop\《养老机构服务合同》　GF—2016—2001.pdf")
    
    print(f"Testing MinerU full pipeline with file: {file_path}")
    if not file_path.exists():
        print("File does not exist!")
        return
        
    try:
        md_text = await parser._extract_with_mineru_async(file_path, cfg.mineru_api_key)
        print("OCR DONE. MD length:", len(md_text))
        res = await parser._extract_from_text(md_text, str(file_path))
        print("Full Parse Success!")
        print(res)
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
