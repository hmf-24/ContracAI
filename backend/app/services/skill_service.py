import os
import json
import uuid

SKILLS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "skills")

class SkillManager:
    def __init__(self):
        os.makedirs(SKILLS_DIR, exist_ok=True)
        
    def save_skill(self, title: str, description: str, trigger: str, steps: list) -> dict:
        skill_id = f"skill_{uuid.uuid4().hex[:8]}"
        skill_data = {
            "id": skill_id,
            "title": title,
            "description": description,
            "trigger": trigger,
            "steps": steps,
            "enabled": True
        }
        with open(os.path.join(SKILLS_DIR, f"{skill_id}.json"), "w", encoding="utf-8") as f:
            json.dump(skill_data, f, ensure_ascii=False, indent=2)
        return skill_data
        
    def get_all_skills(self) -> list:
        skills = []
        for filename in os.listdir(SKILLS_DIR):
            if filename.endswith(".json"):
                try:
                    with open(os.path.join(SKILLS_DIR, filename), "r", encoding="utf-8") as f:
                        skills.append(json.load(f))
                except Exception:
                    pass
        return sorted(skills, key=lambda x: x.get("id"))
        
    def get_enabled_skills_context(self) -> str:
        skills = [s for s in self.get_all_skills() if s.get("enabled")]
        if not skills:
            return ""
            
        ctx = "当前系统已学会以下定制技能，当用户的指令符合触发条件时，请按执行步骤调用相应的工具：\n\n"
        for s in skills:
            ctx += f"【技能名称】：{s.get('title')}\n"
            ctx += f"【触发条件】：{s.get('trigger')}\n"
            ctx += f"【执行步骤】：\n"
            for i, step in enumerate(s.get('steps', [])):
                ctx += f"  {i+1}. {step}\n"
            ctx += "\n"
        return ctx

    def toggle_skill(self, skill_id: str, enabled: bool):
        path = os.path.join(SKILLS_DIR, f"{skill_id}.json")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["enabled"] = enabled
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

    def delete_skill(self, skill_id: str):
        path = os.path.join(SKILLS_DIR, f"{skill_id}.json")
        if os.path.exists(path):
            os.remove(path)

skill_manager = SkillManager()
