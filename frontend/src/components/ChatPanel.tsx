import { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Button, Spin, message, Table, Tag, Drawer, Descriptions, Upload } from 'antd';
import { SendOutlined, FilePdfOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { 
  getContracts, executeOperation, searchContractsAdvanced, API_BASE
} from '../api';
import type { ChatResponse } from '../api';

const { TextArea } = Input;

/* ────────────────────────────────────────────────────────────
   类型定义
   ──────────────────────────────────────────────────────────── */

interface ChatMessage {
  /** 角色：用户 / 助手 / 系统 */
  role: 'user' | 'assistant' | 'system';
  /** 文本内容 */
  content: string;
  /** 如果是 tool_call 类型，保存待确认的操作 */
  toolCall?: ChatResponse;
}

/* ────────────────────────────────────────────────────────────
   操作标签映射
   ──────────────────────────────────────────────────────────── */

const ACTION_LABELS: Record<string, string> = {
  create_contract: '📝 新增合同',
  update_milestone: '📅 更新执行节点',
  append_payment: '💰 追加付款',
  search_contract: '🔍 查询合同',
  update_status: '🗂️ 更新状态',
};

/* ────────────────────────────────────────────────────────────
   组件
   ──────────────────────────────────────────────────────────── */

export default function ChatPanel({ selectedContracts = [], onLedgerUpdate }: { selectedContracts?: any[], onLedgerUpdate?: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'system',
      content:
        '👋 你好！我是 ContracAI 智能查询助手。\n\n你可以用自然语言让我帮你检索，例如：\n- 「帮我找出华为金额大于50万的执行中合同」\n- 「查一下所有已结项的项目」\n\n除了查询，我也支持简单的变更指令：\n- 「交换机项目今天初验通过」\n- 「华为合同付了第一笔款20万」',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /** 当传入 selectedContracts 时，可以组装一个上下文前缀给 AI */
  const contextPrefix = selectedContracts.length > 0 
    ? `[隐式上下文] 用户当前在台账中选中了以下合同：\n${selectedContracts.map(c => `- ${c['合同名称']} (金额: ${c['合同金额']})`).join('\n')}\n请在回答问题时优先考虑这些合同。`
    : '';

  /** 自动滚动到最新消息 */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ── 发送消息 ────────────────────────────────────────── */

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || loading) return;

    // 添加用户消息
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInputValue('');
    setLoading(true);

    try {
      // 准备一个临时的助手消息索引
      const assistantMsgIndex = messages.length + 1;
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ message: text, context: contextPrefix })
      });

      if (!response.ok) {
        throw new Error(`请求失败 (${response.status})`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let isFirstChunk = true;
      let finalToolCall: any = null;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.substring(6).trim();
              if (!dataStr) continue;
              
              try {
                const data = JSON.parse(dataStr);
                
                if (data.type === 'text') {
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[assistantMsgIndex] = {
                      ...newMessages[assistantMsgIndex],
                      content: (newMessages[assistantMsgIndex].content || '') + data.content
                    };
                    return newMessages;
                  });
                } else if (data.type === 'tool_call') {
                  finalToolCall = data;
                } else if (data.type === 'done') {
                  // completed
                }
              } catch (e) {
                console.error("Parse error:", e);
              }
            }
          }
        }
      }

      // 如果流结束后发现这是一个工具调用
      if (finalToolCall) {
        if (finalToolCall.function === 'search_contract') {
          try {
            const result = await searchContractsAdvanced(finalToolCall.arguments || {});
            setMessages((prev) => {
              const newMessages = [...prev];
              newMessages[assistantMsgIndex] = { 
                role: 'assistant', 
                content: `✅ 为您找到 **${result.contracts?.length || 0}** 条符合条件的合同。请关闭助理在主视图中搜索或筛选。` 
              };
              return newMessages;
            });
          } catch (e: any) {
            setMessages((prev) => {
              const newMessages = [...prev];
              newMessages[assistantMsgIndex] = { role: 'assistant', content: `❌ 查询失败: ${e.message}` };
              return newMessages;
            });
          }
        } else {
          setMessages((prev) => {
            const newMessages = [...prev];
            newMessages[assistantMsgIndex] = {
              role: 'assistant',
              content: '',
              toolCall: finalToolCall,
            };
            return newMessages;
          });
        }
      }

    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `❌ 请求失败: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }, [inputValue, loading, messages.length, contextPrefix]);

  /* ── 确认执行操作 ────────────────────────────────────── */

  async function handleConfirm(toolCall: ChatResponse) {
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '⏳ 正在执行...' },
    ]);

    try {
      const result = await executeOperation(
        toolCall.function!,
        toolCall.arguments!
      );
      if (result.status === 'success') {
        const msg = result.results && typeof result.results[0] === 'string' 
          ? result.results[0] 
          : '✅ 操作已成功执行！台账已更新！';
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: msg },
        ]);
        onLedgerUpdate?.();
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `⚠️ 执行异常: ${JSON.stringify(result)}`,
          },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `❌ 执行失败: ${err.message}` },
      ]);
    }
  }

  function handleCancel() {
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '已取消操作！' },
    ]);
  }

  /* ── 上传文件处理 ────────────────────────────────────── */
  
  const handleFileUpload = async (file: File) => {
    setMessages(prev => [...prev, { role: 'user', content: `[上传文件] ${file.name}` }]);
    setLoading(true);
    
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: formData
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '解析失败');
      
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '',
          toolCall: {
            type: 'tool_call',
            function: 'create_contract',
            arguments: data.extracted
          }
        }
      ]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ 文件解析失败: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
    
    return false; // 阻止默认上传
  };

  /* ── 渲染 ────────────────────────────────────────────── */

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      
      {/* 对话区域 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(10, 15, 28, 0.6)', backdropFilter: 'blur(20px)' }}>
        <div style={{ height: 'var(--header-height, 56px)', display: 'flex', alignItems: 'center', padding: '0 24px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#fff' }}>智能查询</h1>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: 0 }}>通过自然语言找合同</p>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {messages.map((msg, idx) => (
            <MessageBubble key={idx} message={msg} onConfirm={handleConfirm} onCancel={handleCancel} />
          ))}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-ink-tertiary)', fontSize: 13, marginTop: 8 }}>
              <Spin size="small" /><span>AI 正在思考...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: 16, background: 'rgba(10, 15, 28, 0.8)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Upload 
              accept=".pdf,.docx,.jpg,.png" 
              showUploadList={false} 
              beforeUpload={handleFileUpload}
            >
              <Button type="default" icon={<FilePdfOutlined />} disabled={loading} style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} />
            </Upload>
            <TextArea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder="找什么合同？例如：今年华为的已结项合同..."
              autoSize={{ minRows: 1, maxRows: 5 }}
              disabled={loading}
              style={{ flex: 1 }}
            />
            <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={loading} disabled={!inputValue.trim()}>发送</Button>
          </div>
        </div>
      </div>

    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   子组件：消息气泡
   ──────────────────────────────────────────────────────────── */

function MessageBubble({
  message,
  onConfirm,
  onCancel,
}: {
  message: ChatMessage;
  onConfirm: (tc: ChatResponse) => void;
  onCancel: () => void;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        marginBottom: 16,
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-start',
        animation: 'fadeSlideUp 0.3s var(--ease-smooth)',
      }}
    >
      {/* 头像 */}
      <div
        style={{
          flexShrink: 0,
          width: 30,
          height: 30,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isUser
            ? 'rgba(0, 229, 255, 0.2)'
            : 'rgba(0, 255, 163, 0.2)',
          color: isUser ? '#00E5FF' : '#00FFA3',
          fontSize: 13,
          boxShadow: isUser ? '0 0 10px rgba(0, 229, 255,0.3)' : '0 0 10px rgba(0,255,163,0.3)'
        }}
      >
        {isUser ? '👤' : isSystem ? '📋' : '🤖'}
      </div>

      {/* 消息内容 */}
      <div style={{ flex: 1, textAlign: isUser ? 'right' : 'left' }}>
        <div
          className={isUser ? "glass-panel-active" : "glass-panel"}
          style={{
            display: 'inline-block',
            maxWidth: '82%',
            padding: '12px 16px',
            borderRadius: isUser
              ? '12px 12px 2px 12px'
              : '12px 12px 12px 2px',
            textAlign: 'left',
          }}
        >
          {/* 操作确认卡片 */}
          {message.toolCall ? (
            <ConfirmCard
              toolCall={message.toolCall}
              onConfirm={onConfirm}
              onCancel={onCancel}
            />
          ) : (
            <div className="prose-bubble">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   子组件：操作确认卡片
   ──────────────────────────────────────────────────────────── */

function ConfirmCard({
  toolCall,
  onConfirm,
  onCancel,
}: {
  toolCall: ChatResponse;
  onConfirm: (tc: ChatResponse) => void;
  onCancel: () => void;
}) {
  const label = ACTION_LABELS[toolCall.function || ''] || toolCall.function;
  const args = toolCall.arguments || {};

  return (
    <div>
      <h3
        style={{
          fontSize: 15,
          fontWeight: 600,
          marginBottom: 12,
          color: '#fff',
        }}
      >
        {label}
      </h3>

      {/* 字段列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Object.entries(args).map(([key, value]) => (
          <div
            key={key}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 13,
              padding: '4px 0',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <span style={{ color: 'rgba(255,255,255,0.45)' }}>{key}</span>
            <span style={{ fontWeight: 500, color: '#fff' }}>
              {String(value)}
            </span>
          </div>
        ))}
      </div>

      {/* 操作按钮 */}
      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <Button type="primary" size="small" onClick={() => onConfirm(toolCall)}>
          确认执行
        </Button>
        <Button size="small" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}
