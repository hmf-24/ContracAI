# from fpdf import FPDF
import asyncio
import json
import httpx
from pathlib import Path

# def create_pdf():
#     pdf = FPDF()
#     pdf.add_page()
#     pdf.set_font("Arial", size=15)
#     pdf.cell(200, 10, txt="This is a contract. Name: Project X", ln=1, align='C')
#     pdf.cell(200, 10, txt="Total amount: 50000.", ln=2, align='C')
#     pdf.output("dummy.pdf")

async def test():
    JOB_URL = "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs"
    TOKEN = "cb6e5988ccc271b1411cb31b423831e53f8dbd8f"
    MODEL = "PaddleOCR-VL-1.6"

    headers = {
        "Authorization": f"bearer {TOKEN}",
    }
    optional_payload = {
        "useDocOrientationClassify": False,
        "useDocUnwarping": False,
        "useChartRecognition": False,
    }

    data = {
        "model": MODEL,
        "optionalPayload": json.dumps(optional_payload)
    }

    async with httpx.AsyncClient(trust_env=False) as client:
        with open("dummy.pdf", "rb") as f:
            files = {"file": f}
            job_response = await client.post(JOB_URL, headers=headers, data=data, files=files, timeout=60.0)

        print(job_response.text)
        if job_response.status_code != 200:
            return

        jobId = job_response.json()["data"]["jobId"]
        
        while True:
            res = await client.get(f"{JOB_URL}/{jobId}", headers=headers, timeout=10.0)
            state = res.json()["data"]["state"]
            print(f"State: {state}")
            if state == 'done':
                jsonl_url = res.json()['data']['resultUrl']['jsonUrl']
                jsonl_res = await client.get(jsonl_url, timeout=30.0)
                print("JSONL:")
                print(jsonl_res.text)
                
                # Test parsing logic
                md_text = ""
                lines = jsonl_res.text.strip().split('\n')
                for line in lines:
                    line = line.strip()
                    if not line: continue
                    result = json.loads(line)["result"]
                    for res_part in result.get("layoutParsingResults", []):
                        md_text += res_part.get("markdown", {}).get("text", "") + "\n\n"
                print("Extracted MD:")
                print(md_text)
                
                break
            elif state == "failed":
                print(res.json())
                break
            await asyncio.sleep(2)

if __name__ == "__main__":
    # create_pdf()
    asyncio.run(test())
