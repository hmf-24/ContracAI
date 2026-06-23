from fastapi import APIRouter, Depends, HTTPException
from typing import Any
from ..core.auth import get_admin_user, get_current_user
from ..services.skill_service import skill_manager
from ..core.db import add_audit_log

router = APIRouter()

@router.get("/skills")
async def get_skills(current_user: dict = Depends(get_current_user)):
    """获取所有技能"""
    return {"skills": skill_manager.get_all_skills()}

@router.post("/skills")
async def save_skill(body: dict[str, Any], current_user: dict = Depends(get_admin_user)):
    """保存新技能"""
    title = body.get("title")
    description = body.get("description")
    trigger = body.get("trigger")
    steps = body.get("steps", [])
    skill = skill_manager.save_skill(title, description, trigger, steps)
    
    add_audit_log(
        user_id=str(current_user.get('id', '')),
        username=current_user.get('username', ''),
        action='保存技能',
        target=title,
        details=f"触发词: {trigger}"
    )
    return {"status": "success", "skill": skill}

@router.put("/skills/{skill_id}/toggle")
async def toggle_skill(skill_id: str, body: dict[str, bool], current_user: dict = Depends(get_admin_user)):
    """启用/禁用技能"""
    enabled = body.get("enabled", True)
    skill_manager.toggle_skill(skill_id, enabled)
    return {"status": "success"}

@router.delete("/skills/{skill_id}")
async def delete_skill(skill_id: str, current_user: dict = Depends(get_admin_user)):
    """删除技能"""
    skill_manager.delete_skill(skill_id)
    return {"status": "success"}
