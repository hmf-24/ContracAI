import asyncio
from pathlib import Path
from app.agents.ParserAgent.tools import DocParser
from app.core.config import get_config
import httpx
import uuid
import zipfile
import io
import json
import glob
import os

async def inspect():
    token = "eyJ0eXBlIjoiSldUIiwiYWxnIjoiSFM1MTIifQ.eyJqdGkiOiI3NjMwMDg0MCIsInJvbCI6IlJPTEVfUkVHSVNURVIiLCJpc3MiOiJPcGVuWExhYiIsImlhdCI6MTc4MjIwMzA4OSwiY2xpZW50SWQiOiJsa3pkeDU3bnZ5MjJqa3BxOXgydyIsInBob25lIjoiIiwib3BlbklkIjpudWxsLCJ1dWlkIjoiY2NiNWM1ZjMtODU5Zi00YjZhLThjZTAtNGU4MTUxY2FlZjcxIiwiZW1haWwiOiIiLCJleHAiOjE3ODk5NzkwODl9.EQulJaArx5TY-vpDK7tA19_5OuGbzqOdyh0UrEvmPdMKWjaLGQvx_3_JHgCnOT2Ir233kvudSYYsNHjcVWmcww"
    pdf_files = glob.glob(os.path.join("uploads", "contracts", "*.pdf"))
    if not pdf_files:
        print("No PDF files found.")
        return
    file_path = Path(pdf_files[-1])
    
    file_name = file_path.name
    data_id = str(uuid.uuid4())
    batch_url = "https://mineru.net/api/v4/file-urls/batch"
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    data = {"files": [{"name": file_name, "data_id": data_id}], "model_version": "vlm"}
    
    async with httpx.AsyncClient() as client:
        res = await client.post(batch_url, headers=headers, json=data, timeout=30.0)
        result = res.json()
        batch_id = result["data"]["batch_id"]
        upload_url = result["data"]["file_urls"][0]
        
        print("Uploading...")
        with open(file_path, "rb") as f:
            await client.put(upload_url, content=f.read(), timeout=120.0)
            
        print("Polling...")
        poll_url = f"https://mineru.net/api/v4/extract-results/batch/{batch_id}"
        while True:
            poll_res = await client.get(poll_url, headers={"Authorization": f"Bearer {token}"}, timeout=30.0)
            extract_result = poll_res.json()["data"]["extract_result"][0]
            if extract_result["state"] == "done":
                zip_url = extract_result["full_zip_url"]
                break
            await asyncio.sleep(5)
            
        print("Downloading zip...")
        zip_res = await client.get(zip_url, timeout=60.0)
        with zipfile.ZipFile(io.BytesIO(zip_res.content)) as z:
            for name in z.namelist():
                if name == 'layout.json':
                    data = json.loads(z.read(name))
                    print("layout.json keys:", data.keys())
                    if "pdf_info" in data and len(data["pdf_info"]) > 0:
                        page = data["pdf_info"][0]
                        print("page keys:", page.keys())
                        print("page_info:", page.get("page_info"))
                elif name.endswith('_content_list.json'):
                    data = json.loads(z.read(name))
                    if isinstance(data, list) and len(data) > 0:
                        print("content_list first item:", data[0])

if __name__ == "__main__":
    asyncio.run(inspect())

