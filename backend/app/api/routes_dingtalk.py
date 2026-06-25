from fastapi import APIRouter, Request, BackgroundTasks
from typing import Dict, Any

router = APIRouter(prefix="/dingtalk", tags=["DingTalk"])

@router.post("/webhook")
async def dingtalk_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    预留：接收钉钉机器人推送的带附件(PDF)的消息体。
    未来可在此处解析附件，并将附件自动压入解析队列。
    """
    payload = await request.json()
    # 记录收到的推送或直接进行处理（此为预留骨架）
    print("Received DingTalk webhook payload:", payload)
    
    # 示例返回
    return {"status": "success", "msg": "Webhook received"}
