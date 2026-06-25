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

@router.post("/upload/invoice")
async def upload_invoice(file: UploadFile = File(...), current_user: dict = Depends(get_admin_user)):
    """上传并解析票据（发票/回执），返回解析结果及智能匹配的候选合同"""
    if not tools.parser_instance:
        raise HTTPException(500, "文档解析器未初始化")

    suffix = Path(file.filename or "invoice").suffix.lower()
    file_id = str(uuid.uuid4())
    safe_filename = f"inv_{file_id}{suffix}"
    save_path = CONTRACTS_DIR / safe_filename

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    try:
        # 1. OCR 提取发票内容
        result = await tools.parser_instance.parse_file(str(save_path), is_invoice=True)
        
        # 2. 从数据库所有合同中匹配
        from ..core.db import get_all_contracts
        records = get_all_contracts()
        
        inv_amount = float(result.get("开票总金额", {}).get("value", 0))
        inv_supplier = str(result.get("开票单位名称", {}).get("value", ""))
        inv_buyer = str(result.get("购方单位名称", {}).get("value", ""))
        inv_project = str(result.get("项目名称", {}).get("value", ""))
        
        candidates = []
        for r in records:
            c_name = str(r.get("合同名称", ""))
            c_party = str(r.get("对方单位名称", ""))
            c_amount = float(r.get("合同金额", 0))
            c_unpaid = float(r.get("合同未付款合计") or 0)
            
            score = 0
            # 规则 1：金额匹配加分
            if inv_amount > 0 and abs(c_amount - inv_amount) < 0.01:
                score += 50
            elif inv_amount > 0 and abs(c_unpaid - inv_amount) < 0.01:
                score += 40
            
            # 规则 2：单位匹配加分
            if inv_supplier and inv_supplier in c_party:
                score += 30
            if inv_buyer and inv_buyer in c_party:
                score += 30
                
            # 规则 3：项目名称匹配加分
            if inv_project and (inv_project in c_name or inv_project in str(r.get("项目名称", ""))):
                score += 20
                
            if score > 0:
                candidates.append({
                    "row_number": r.get("row_number"),
                    "合同名称": c_name,
                    "对方单位名称": c_party,
                    "合同金额": c_amount,
                    "未付金额": c_unpaid,
                    "score": score
                })
                
        # 排序并取前 3 名
        candidates = sorted(candidates, key=lambda x: x["score"], reverse=True)[:3]
        
        # 组装返回结果
        return {
            "status": "success",
            "extracted": result,
            "candidates": candidates,
            "file_url": f"/contracts-files/{safe_filename}"
        }
    except Exception as e:
        raise HTTPException(422, f"票据解析失败: {str(e)}")

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

