import asyncio
from pathlib import Path
from app.agents.ParserAgent.tools import DocParser
from app.core.config import get_config
import httpx
import uuid
import zipfile
import io
import json

async def inspect():
    token = "eyJ0eXBlIjoiSldUIiwiYWxnIjoiSFM1MTIifQ.eyJqdGkiOiI3NjMwMDg0MCIsInJvbCI6IlJPTEVfUkVHSVNURVIiLCJpc3MiOiJPcGVuWExhYiIsImlhdCI6MTc4MjIwMzA4OSwiY2xpZW50SWQiOiJsa3pkeDU3bnZ5MjJqa3BxOXgydyIsInBob25lIjoiIiwib3BlbklkIjpudWxsLCJ1dWlkIjoiY2NiNWM1ZjMtODU5Zi00YjZhLThjZTAtNGU4MTUxY2FlZjcxIiwiZW1haWwiOiIiLCJleHAiOjE3ODk5NzkwODl9.EQulJaArx5TY-vpDK7tA19_5OuGbzqOdyh0UrEvmPdMKWjaLGQvx_3_JHgCnOT2Ir233kvudSYYsNHjcVWmcww"
    file_path = Path(r"C:\Users\12818\Desktop\《养老机构服务合同》　GF—2016—2001.pdf")
    
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
            print("Zip contents:", z.namelist())
            for name in z.namelist():
                if name.endswith('.json'):
                    print(f"Found JSON: {name}")
                    data = json.loads(z.read(name))
                    print("JSON keys:", list(data.keys()))
                    if "pdf_info" in data:
                        print("pdf_info length:", len(data["pdf_info"]))
                        if len(data["pdf_info"]) > 0:
                            print("pdf_info[0] keys:", list(data["pdf_info"][0].keys()))
                            # if it has blocks, print a block
                            if "preproc_blocks" in data["pdf_info"][0]:
                                print("Sample block:", data["pdf_info"][0]["preproc_blocks"][0])
                            if "blocks" in data["pdf_info"][0]:
                                print("Sample block:", data["pdf_info"][0]["blocks"][0])

if __name__ == "__main__":
    asyncio.run(inspect())
