/**
 * ContracAI - 前端应用逻辑
 *
 * 处理：
 *   - 侧边栏导航与面板切换
 *   - 与后端 API 的聊天交互
 *   - 确认卡片的渲染与执行
 *   - 文档上传与拖拽
 *   - 设置表单的加载/保存
 *   - 台账表格的渲染
 */

const API_BASE = 'http://127.0.0.1:18920/api';

// ── 状态 ─────────────────────────────────────────────────
let currentPanel = 'chat';
let pendingOperation = null;
let extractedData = null;

// ── DOM 就绪 ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initChat();
  initUpload();
  initSettings();
  checkHealth();
});

// ═══════════════════════════════════════════════════════════
// 导航
// ═══════════════════════════════════════════════════════════

function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      switchPanel(panel);
    });
  });
}

function switchPanel(panelName) {
  // 更新导航激活状态
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.panel === panelName);
  });

  // 更新面板显示
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${panelName}`);
  });

  currentPanel = panelName;

  // 延迟加载数据
  if (panelName === 'ledger') loadLedger();
  if (panelName === 'settings') loadSettings();
}

// ═══════════════════════════════════════════════════════════
// 健康检查
// ═══════════════════════════════════════════════════════════

async function checkHealth() {
  try {
    const resp = await fetch(`${API_BASE}/health`);
    const data = await resp.json();
    const dot = document.querySelector('.status-dot');
    const text = document.querySelector('.status-text');
    dot.classList.add('connected');
    text.textContent = data.ledger_loaded ? '已连接 · 台账已加载' : '已连接 · 未加载台账';
  } catch {
    // 服务未运行
  }
}

// ═══════════════════════════════════════════════════════════
// 聊天
// ═══════════════════════════════════════════════════════════

function initChat() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');

  sendBtn.addEventListener('click', () => sendMessage());

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // 自动调整输入框高度
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;

  // 添加用户消息
  appendMessage('user', message);
  input.value = '';
  input.style.height = 'auto';

  // 显示正在输入指示器
  const typingId = showTyping();

  try {
    const resp = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    removeTyping(typingId);

    if (!resp.ok) {
      appendMessage('assistant', '❌ 服务连接失败，请检查后端是否运行。');
      return;
    }

    const data = await resp.json();

    if (data.type === 'text') {
      appendMessage('assistant', data.content);
    } else if (data.type === 'tool_call') {
      showConfirmationCard(data);
    } else if (data.type === 'clarification') {
      appendMessage('assistant', data.content);
    }
  } catch (err) {
    removeTyping(typingId);
    appendMessage('assistant', `❌ 请求失败: ${err.message}`);
  }
}

function appendMessage(role, content) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `message ${role}`;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  // 简单的类似 markdown 的渲染
  contentDiv.innerHTML = content
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  div.appendChild(contentDiv);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  const id = 'typing-' + Date.now();
  div.id = id;
  div.className = 'message assistant';
  div.innerHTML = `
    <div class="message-content">
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ═══════════════════════════════════════════════════════════
// 操作确认卡片
// ═══════════════════════════════════════════════════════════

function showConfirmationCard(data) {
  pendingOperation = data;

  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'message assistant';

  const actionLabels = {
    create_contract: '📝 新增合同',
    update_milestone: '📅 更新执行节点',
    append_payment: '💰 追加付款',
    search_contract: '🔍 查询合同',
  };

  const label = actionLabels[data.function] || data.function;
  const args = data.arguments;

  let fieldsHtml = '';
  for (const [key, value] of Object.entries(args)) {
    fieldsHtml += `
      <div class="confirm-field">
        <span class="field-label">${key}</span>
        <span class="field-value">${value}</span>
      </div>
    `;
  }

  div.innerHTML = `
    <div class="message-content">
      <div class="confirm-card">
        <h3>${label}</h3>
        ${fieldsHtml}
        <div class="confirm-actions">
          <button class="btn btn-primary" onclick="confirmOperation()">✅ 确认执行</button>
          <button class="btn btn-secondary" onclick="cancelOperation()">取消</button>
        </div>
      </div>
    </div>
  `;

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function confirmOperation() {
  if (!pendingOperation) return;

  const data = pendingOperation;
  pendingOperation = null;

  appendMessage('assistant', '⏳ 正在执行...');

  try {
    const resp = await fetch(`${API_BASE}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: data.function,
        params: data.arguments,
      }),
    });

    const result = await resp.json();

    if (result.status === 'success') {
      appendMessage('assistant', '✅ 操作已成功执行！台账已更新。');
    } else {
      appendMessage('assistant', `⚠️ 执行异常: ${JSON.stringify(result)}`);
    }
  } catch (err) {
    appendMessage('assistant', `❌ 执行失败: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════
// 台账预览
// ═══════════════════════════════════════════════════════════

function cancelOperation() {
  pendingOperation = null;
  appendMessage('assistant', '已取消操作。');
}

async function loadLedger() {
  const tbody = document.getElementById('ledger-tbody');

  try {
    const resp = await fetch(`${API_BASE}/contracts`);
    const data = await resp.json();

    if (!data.contracts || data.contracts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">暂无合同数据</td></tr>';
      return;
    }

    tbody.innerHTML = data.contracts.map(c => `
      <tr>
        <td>${c.序号 || '-'}</td>
        <td>${c.合同名称 || '-'}</td>
        <td>${c.对方单位名称 || '-'}</td>
        <td>${c.合同金额 ? c.合同金额.toLocaleString() : '-'}</td>
        <td><span class="status-badge ${c.合同状态 === '执行中' ? 'active' : 'closed'}">${c.合同状态 || '-'}</span></td>
        <td>${c.付款合计 ? c.付款合计.toLocaleString() : '0'}</td>
        <td>${c.合同未付款合计 ? c.合同未付款合计.toLocaleString() : '0'}</td>
        <td>${c.截止日期 || '-'}</td>
      </tr>
    `).join('');

    // 加载预警信息
    loadWarnings();
  } catch {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">无法连接后端服务</td></tr>';
  }
}

async function loadWarnings() {
  const container = document.getElementById('ledger-warnings');
  if (!container) return;

  try {
    const resp = await fetch(`${API_BASE}/warnings`);
    const data = await resp.json();

    const expiry = data.expiry_warnings || [];
    const closure = data.closure_candidates || [];

    if (expiry.length === 0 && closure.length === 0) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    container.style.display = 'flex';
    let html = '';

    // 合同到期预警
    expiry.forEach(w => {
      html += `
        <div class="warning-card">
          <div class="warning-info">
            <span class="warning-icon">⚠️</span>
            <div class="warning-text">
              <strong>合同即将到期预警</strong>
              <p>合同 <strong>「${w.合同名称}」</strong> 将于 <strong>${w.截止日期}</strong> 到期。</p>
              <div class="meta">剩余天数：${w.剩余天数} 天 (行号: ${w.row})</div>
            </div>
          </div>
        </div>
      `;
    });

    // 自动结项建议
    closure.forEach(c => {
      html += `
        <div class="warning-card closure">
          <div class="warning-info">
            <span class="warning-icon">💡</span>
            <div class="warning-text">
              <strong>自动结项建议</strong>
              <p>合同 <strong>「${c.合同名称}」</strong> (对方: ${c.对方单位名称}) 已退还保证金且未付款合计为 0。</p>
              <div class="meta">建议状态流转为：已结项 (行号: ${c.row})</div>
            </div>
          </div>
          <div class="warning-actions">
            <button class="btn-warning-action" onclick="closeContract(${c.row}, '${c.合同名称}')">一键结项</button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  } catch (err) {
    console.error('加载预警失败:', err);
    container.style.display = 'none';
  }
}

async function closeContract(row, name) {
  if (!confirm(`确定要将合同「${name}」状态更新为 "已结项" 吗？`)) return;

  try {
    const resp = await fetch(`${API_BASE}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_status',
        params: { row: row, status: '已结项' }
      }),
    });

    const result = await resp.json();
    if (result.status === 'success') {
      alert('✅ 合同状态已更新为 "已结项"！');
      // 重新加载台账与预警
      loadLedger();
    } else {
      alert('⚠️ 执行失败: ' + JSON.stringify(result));
    }
  } catch (err) {
    alert('❌ 请求失败: ' + err.message);
  }
}

// 绑定到全局以供 HTML 中 onclick 调用
window.closeContract = closeContract;

document.getElementById('refresh-ledger')?.addEventListener('click', loadLedger);

// ═══════════════════════════════════════════════════════════
// 文档上传
// ═══════════════════════════════════════════════════════════

function initUpload() {
  const zone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');

  zone.addEventListener('click', () => fileInput.click());

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      uploadFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      uploadFile(fileInput.files[0]);
    }
  });

  document.getElementById('confirm-import')?.addEventListener('click', confirmImport);
  document.getElementById('cancel-import')?.addEventListener('click', cancelImport);
}

async function uploadFile(file) {
  const zone = document.getElementById('upload-zone');
  const resultDiv = document.getElementById('upload-result');
  const fieldsDiv = document.getElementById('extracted-fields');

  zone.innerHTML = `
    <div class="spinner"></div>
    <p class="upload-text" style="margin-top:16px">正在解析 ${file.name}...</p>
  `;

  try {
    const formData = new FormData();
    formData.append('file', file);

    const resp = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    });

    const data = await resp.json();

    if (data.status === 'success') {
      extractedData = data.extracted;

      // 渲染提取出的字段
      const editableFields = [
        '合同名称', '合同编号', '合同类型', '对方单位名称',
        '合同金额', '税率', '签订时间', '生效日期',
        '截止日期', '合同支付条款', '履约保证金', '经办人',
      ];

      fieldsDiv.innerHTML = editableFields.map(f => `
        <div class="extracted-field">
          <label>${f}</label>
          <input type="text" data-field="${f}" value="${extractedData[f] || ''}">
        </div>
      `).join('');

      resultDiv.style.display = 'block';
    } else {
      alert('解析失败: ' + (data.detail || '未知错误'));
    }
  } catch (err) {
    alert('上传失败: ' + err.message);
  }

  // 重置上传区域
  zone.innerHTML = `
    <div class="upload-icon">📁</div>
    <p class="upload-text">拖拽文件到此处，或点击选择文件</p>
    <p class="upload-hint">支持 PDF、Word (.docx)、图片 (.jpg/.png) 格式</p>
  `;
}

async function confirmImport() {
  if (!extractedData) return;

  // 收集修改后的值
  const fields = {};
  document.querySelectorAll('#extracted-fields input').forEach(input => {
    const field = input.dataset.field;
    const value = input.value.trim();
    if (value) fields[field] = value;
  });

  // 转换数值字段
  if (fields['合同金额']) fields['合同金额'] = parseFloat(fields['合同金额']);
  if (fields['税率']) fields['税率'] = parseFloat(fields['税率']);

  try {
    const resp = await fetch(`${API_BASE}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_contract', params: fields }),
    });

    const result = await resp.json();
    if (result.status === 'success') {
      alert('✅ 合同已成功录入台账！');
      cancelImport();
    } else {
      alert('⚠️ 录入失败: ' + JSON.stringify(result));
    }
  } catch (err) {
    alert('❌ 请求失败: ' + err.message);
  }
}

function cancelImport() {
  extractedData = null;
  document.getElementById('upload-result').style.display = 'none';
}

// ═══════════════════════════════════════════════════════════
// 设置
// ═══════════════════════════════════════════════════════════

function initSettings() {
  document.getElementById('save-settings')?.addEventListener('click', saveSettings);
}

async function loadSettings() {
  try {
    const resp = await fetch(`${API_BASE}/config`);
    const data = await resp.json();

    document.getElementById('setting-ledger-path').value = data.ledger_path || '';
    document.getElementById('setting-llm-url').value = data.llm?.base_url || '';
    document.getElementById('setting-llm-key').value = ''; // 不显示已脱敏的 key
    document.getElementById('setting-llm-key').placeholder = data.llm?.api_key || '输入你的 API Key';
    document.getElementById('setting-llm-model').value = data.llm?.model || '';
    document.getElementById('setting-ding-webhook').value = data.dingtalk_webhook || '';
    document.getElementById('setting-ding-secret').value = '';
  } catch {
    // 服务不可用
  }
}

async function saveSettings() {
  const config = {
    ledger_path: document.getElementById('setting-ledger-path').value,
    llm: {
      base_url: document.getElementById('setting-llm-url').value,
      model: document.getElementById('setting-llm-model').value,
    },
    dingtalk_webhook: document.getElementById('setting-ding-webhook').value,
  };

  // 仅在用户输入了新 API 密钥时才包含它
  const apiKey = document.getElementById('setting-llm-key').value;
  if (apiKey) config.llm.api_key = apiKey;

  const secret = document.getElementById('setting-ding-secret').value;
  if (secret) config.dingtalk_secret = secret;

  try {
    const resp = await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    if (resp.ok) {
      alert('✅ 设置已保存');
      checkHealth();
    } else {
      alert('⚠️ 保存失败');
    }
  } catch (err) {
    alert('❌ 无法连接后端: ' + err.message);
  }
}
