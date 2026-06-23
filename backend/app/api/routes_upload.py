from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pathlib import Path
import uuid
import shutil
from ..core.auth import get_admin_user, get_current_user
from ..agents.ParserAgent import tools

router = APIRouter()

# 合同原文件永久存储目录
CONTRACTS_DIR = Path(__file__).parent.parent.parent / "uploads" / "contracts"
CONTRACTS_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/upload")
async def upload_document(file: UploadFile = File(...), current_user: dict = Depends(get_admin_user)):
    """上传并解析合同文件（PDF/Word/图片），文件永久保存以供后续预览"""
    if not tools.parser_instance:
        raise HTTPException(500, "文档解析器未初始化，请先在设置中配置 OCR 模型的 API Key")

    # 生成唯一文件名并永久保存
    suffix = Path(file.filename or "doc").suffix.lower()
    file_id = str(uuid.uuid4())
    safe_filename = f"{file_id}{suffix}"
    save_path = CONTRACTS_DIR / safe_filename

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    try:
        result = await tools.parser_instance.parse_file(str(save_path))
        # 注入文件引用信息，用于后续台账关联
        result["_source_file"] = f"/contracts-files/{safe_filename}"
        result["_original_filename"] = file.filename

        return {
            "status": "success",
            "extracted": result,
            "file_url": f"/contracts-files/{safe_filename}",
            "file_type": suffix.lstrip("."),
        }
    except Exception as e:
        # 解析失败也保留文件，方便调试
        raise HTTPException(422, f"文档解析失败: {str(e)}")


@router.post("/attachments/upload")
async def upload_attachment(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """上传附件并保存至 uploads/attachments 目录"""
    try:
        attachments_dir = Path(__file__).parent.parent.parent / "uploads" / "attachments"
        attachments_dir.mkdir(parents=True, exist_ok=True)
        
        file_id = str(uuid.uuid4())
        suffix = Path(file.filename or "").suffix
        orig_name = Path(file.filename or "attachment").stem[:20]
        safe_filename = f"{orig_name}_{file_id[:8]}{suffix}"
        
        save_path = attachments_dir / safe_filename
        
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return {
            "status": "success",
            "url": f"/attachments/{safe_filename}",
            "name": file.filename,
            "uid": file_id
        }
    except Exception as e:
        raise HTTPException(500, detail=f"附件上传失败: {str(e)}")

