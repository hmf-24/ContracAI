from pydantic import BaseModel
from typing import List, Optional, Any, Dict

# Auth
class LoginRequest(BaseModel):
    username: str
    password: str

# Ledger
class PaymentNode(BaseModel):
    group_index: int
    amount: float
    time: Optional[str] = None
    node_name: Optional[str] = None
    status: Optional[str] = "未付款"
    attachments: Optional[List[Dict[str, Any]]] = []

class ReorderRequest(BaseModel):
    ids: List[int]

class UpdateContractRequest(BaseModel):
    row: int
    data: Dict[str, Any]

class DeleteContractRequest(BaseModel):
    row_number: int

# Chat
class ChatRequest(BaseModel):
    message: str
    context: Optional[dict] = {}

class InitSessionRequest(BaseModel):
    session_id: str

# Config
class ConfigUpdateRequest(BaseModel):
    pass  # Could define dict explicitly or rely on Dict[str, Any] later
