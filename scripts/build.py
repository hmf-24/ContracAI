# -*- coding: utf-8 -*-
import os
import sys
import subprocess
from pathlib import Path

def build():
    print("开始打包 ContracAI...")
    # 定位项目根目录
    project_root = Path(__file__).resolve().parent.parent
    os.chdir(project_root)
    
    # 检查 PyInstaller 路径
    pyinstaller_bin = project_root / "venv" / "Scripts" / "pyinstaller.exe"
    if not pyinstaller_bin.exists():
        pyinstaller_bin = "pyinstaller"  # 回退到全局命令
        
    # 构建命令
    cmd = [
        str(pyinstaller_bin),
        "--clean",
        "--noconfirm",
        "--name=ContracAI",
        "--onedir",      # 生成文件夹目录，方便调试
        "--windowed",     # 窗口模式，不显示命令行黑色控制台
        f"--add-data=frontend{os.pathsep}frontend",
        "backend/app/main.py"
    ]
    
    print(f"执行命令: {' '.join(cmd)}")
    result = subprocess.run(cmd)
    
    if result.returncode == 0:
        print("\n[成功] 打包成功！")
        print(f"可执行文件及资源输出至目录: {project_root / 'dist' / 'ContracAI'}")
    else:
        print("\n[失败] 打包失败，请检查报错日志。")
        sys.exit(1)

if __name__ == "__main__":
    build()
