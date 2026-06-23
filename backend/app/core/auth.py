"""
ContracAI - 身份认证与权限管理

基于 SQLite 和 JWT 实现的轻量级认证模块。
"""

import sqlite3
import jwt
import os
from datetime import datetime, timedelta
from typing import Optional
from pathlib import Path
from pydantic import BaseModel
import uuid
from passlib.context import CryptContext
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from .config import CONFIG_DIR

# --- 常量配置 ---
SECRET_KEY = os.environ.get("CONTRACAI_SECRET_KEY", "8f3a9e2c1b7d6e4f5a0c9b8d7e6f5a4c3b2a1")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7天免登录

DB_PATH = CONFIG_DIR / "users.db"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

router = APIRouter()

# --- 数据模型 ---
class UserLogin(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "user"  # "admin" 或 "user"

class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    avatar: Optional[str] = None

# --- 数据库操作 ---
def get_db():
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    """初始化数据库并创建默认 admin 账户"""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL,
            avatar TEXT
        )
    """)
    
    # 检测是否包含 avatar 列，如果没有则自动扩容
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN avatar TEXT")
    except sqlite3.OperationalError:
        pass # 列已存在
    
    conn.commit()
    
    # 检查是否有管理员
    cursor.execute("SELECT id FROM users WHERE role='admin'")
    if not cursor.fetchone():
        default_hash = pwd_context.hash("admin123")
        cursor.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            ("admin", default_hash, "admin")
        )
        conn.commit()
    conn.close()

# 启动时初始化
init_db()

# --- 工具函数 ---
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- 依赖项：获取当前用户 ---
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: sqlite3.Connection = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="未授权的访问，请重新登录",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
        
    cursor = db.cursor()
    cursor.execute("SELECT id, username, role, avatar FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    if user is None:
        raise credentials_exception
    return dict(user)

def get_admin_user(current_user: dict = Depends(get_current_user)):
    """依赖项：仅限管理员访问"""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足，需要管理员权限"
        )
    return current_user

# --- 路由 ---
@router.post("/login")
def login(user_data: UserLogin, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (user_data.username,))
    user = cursor.fetchone()
    
    if not user or not verify_password(user_data.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"], "role": user["role"], "avatar": user["avatar"]}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"],
            "avatar": user["avatar"]
        }
    }

@router.get("/me")
def read_users_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "username": current_user["username"],
        "role": current_user["role"],
        "avatar": current_user["avatar"]
    }

@router.post("/users", response_model=UserResponse)
def create_user(user: UserCreate, db: sqlite3.Connection = Depends(get_db), current_user: dict = Depends(get_admin_user)):
    """仅管理员可创建新用户"""
    cursor = db.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            (user.username, get_password_hash(user.password), user.role)
        )
        db.commit()
        return {"id": cursor.lastrowid, "username": user.username, "role": user.role}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="用户名已存在")

@router.post("/users/avatar")
def upload_avatar(
    file: UploadFile = File(...),
    db: sqlite3.Connection = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    avatar_dir = CONFIG_DIR / "avatars"
    avatar_dir.mkdir(parents=True, exist_ok=True)
    
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'png'
    filename = f"{uuid.uuid4().hex}.{ext}"
    file_path = avatar_dir / filename
    
    with open(file_path, "wb") as f:
        f.write(file.file.read())
        
    avatar_url = f"/avatars/{filename}"
    cursor = db.cursor()
    cursor.execute("UPDATE users SET avatar = ? WHERE id = ?", (avatar_url, current_user["id"]))
    db.commit()
    
    return {"status": "success", "avatar": avatar_url}
