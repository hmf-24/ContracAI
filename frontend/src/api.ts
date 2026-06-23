/**
 * ContracAI — 后端 API 客户端
 *
 * 统一封装所有与 FastAPI 后端的 HTTP 交互。
 * 开发环境下请求会通过 Vite 代理转发至 http://127.0.0.1:18920。
 * 生产环境下前端与后端部署在同一个 FastAPI 静态挂载，使用相对路径即可。
 */

/** API 基础路径 — 在 Vite 开发服务器中会被代理 */
export const API_BASE = '/api';

/* ────────────────────────────────────────────────────────────
   通用请求封装
   ──────────────────────────────────────────────────────────── */

/**
 * 统一 JSON 请求
 */
async function request<T = any>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  const token = localStorage.getItem('token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });
  
  if (resp.status === 401) {
    // 触发全局登出事件
    window.dispatchEvent(new Event('auth-unauthorized'));
  }
  
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    const detail = errBody.detail;
    throw new Error(typeof detail === 'object' ? JSON.stringify(detail) : (detail || `请求失败 (${resp.status})`));
  }
  return resp.json();
}

/* ────────────────────────────────────────────────────────────
   健康检查
   ──────────────────────────────────────────────────────────── */

/** 检查后端服务与台账加载状态 */
export async function getHealth() {
  return request<{ status: string; ledger_loaded: boolean }>('/health');
}

/* ────────────────────────────────────────────────────────────
   聊天 / 自然语言交互
   ──────────────────────────────────────────────────────────── */

export interface ChatResponse {
  type: 'text' | 'tool_call' | 'clarification';
  content?: string;
  function?: string;
  arguments?: Record<string, any>;
}

/** 发送自然语言消息，返回 LLM 解析结果 */
export async function sendChat(message: string) {
  return request<ChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

/* ────────────────────────────────────────────────────────────
   操作执行
   ──────────────────────────────────────────────────────────── */

export interface ExecuteResult {
  status: string;
  preview?: any;
  results?: any;
}

/** 在台账上执行已确认的操作 */
export async function executeOperation(action: string, params: Record<string, any>) {
  return request<ExecuteResult>('/execute', {
    method: 'POST',
    body: JSON.stringify({ action, params }),
  });
}

export async function analyzeRisk(row: number): Promise<any[]> {
  return request<any[]>('/analyze_risk', {
    method: 'POST',
    body: JSON.stringify({ row }),
  });
}

/** 修改/更新合同信息 */
export async function updateContract(row: number, data: Record<string, any>) {
  return request<{status: string, message: string}>('/contracts/update', {
    method: 'POST',
    body: JSON.stringify({ row, data }),
  });
}

/* ────────────────────────────────────────────────────────────
   合同台账
   ──────────────────────────────────────────────────────────── */

/** 获取全部合同列表 */
export async function getContracts() {
  return request<{ contracts: any[] }>('/contracts');
}

/** 更新合同台账排序 */
export async function updateContractsOrder(ids: number[]) {
  return request<{ status: string }>('/ledger/reorder', {
    method: 'POST',
    body: JSON.stringify({ ids })
  });
}

export async function searchContractsAdvanced(params: Record<string, any>) {
  return request<{ contracts: any[] }>('/contracts/search', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** 搜索合同 */
export async function searchContracts(q: string) {
  return request<{ contracts: any[] }>(`/contracts/search?q=${encodeURIComponent(q)}`);
}

/* ────────────────────────────────────────────────────────────
   预警
   ──────────────────────────────────────────────────────────── */

export interface WarningsData {
  expiry_warnings: any[];
  closure_candidates: any[];
}

/** 获取合同到期预警与自动结项候选 */
export async function getWarnings() {
  return request<WarningsData>('/warnings');
}

/** 获取操作审计日志 */
export async function getAuditLogs(limit: number = 100, offset: number = 0) {
  return request<{ logs: any[], total: number }>(`/audit-logs?limit=${limit}&offset=${offset}`);
}

/* ────────────────────────────────────────────────────────────
   文件上传
   ──────────────────────────────────────────────────────────── */

/** 上传合同文件并解析 */
export async function uploadDocument(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const headers: Record<string, string> = {};
  const token = localStorage.getItem('token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const resp = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (resp.status === 401) {
    window.dispatchEvent(new Event('auth-unauthorized'));
  }

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    throw new Error(errBody.detail || `上传失败 (${resp.status})`);
  }
  return resp.json() as Promise<{ status: string; extracted: Record<string, any>; file_url?: string; file_type?: string }>;
}

export async function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('未登录');
  
  const res = await fetch('/api/me', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  if (!res.ok) throw new Error('登录已过期');
  return res.json();
}

export async function uploadAvatar(file: File) {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('file', file);
  
  const res = await fetch('/api/users/avatar', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.detail || '上传失败');
  }
  return res.json();
}

export async function deleteContract(rowNumber: number) {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/contracts/${rowNumber}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || '删除失败');
  }
  return await res.json();
}

/* ────────────────────────────────────────────────────────────
   系统配置
   ──────────────────────────────────────────────────────────── */

/** 获取现金流沙盘推演结果 */
export async function getCashflowSimulation() {
  return request<any>('/simulation/cashflow');
}

/* ────────────────────────────────────────────────────────────
   技能管理 (Skills)
   ──────────────────────────────────────────────────────────── */

export async function getSkills() {
  return request<{ skills: any[] }>('/skills');
}

export async function saveSkill(data: Record<string, any>) {
  return request<{ status: string; skill: any }>('/skills', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function toggleSkill(skillId: string, enabled: boolean) {
  return request<{ status: string }>(`/skills/${skillId}/toggle`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  });
}

export async function deleteSkill(skillId: string) {
  return request<{ status: string }>(`/skills/${skillId}`, {
    method: 'DELETE',
  });
}

/** 获取当前配置 */
export async function getConfig() {
  return request<any>('/config');
}

/** 更新配置 */
export async function updateConfig(data: Record<string, any>) {
  return request<{ status: string }>('/config', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** 上传付款附件 */
export async function uploadAttachment(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const headers: Record<string, string> = {};
  const token = localStorage.getItem('token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const resp = await fetch(`${API_BASE}/attachments/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!resp.ok) throw new Error('附件上传失败');
  return resp.json();
}
