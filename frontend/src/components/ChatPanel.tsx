import { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Button, Spin, message, Table, Tag, Drawer, Descriptions } from 'antd';
import { SendOutlined } from '@ant-design/icons';
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

export default function ChatPanel() {
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

  // 搜索结果状态
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedContract, setSelectedContract] = useState<any | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  const columns = [
    { title: '合同名称', dataIndex: '合同名称', ellipsis: true },
    { title: '对方单位', dataIndex: '对方单位名称', ellipsis: true },
    { title: '合同金额', dataIndex: '合同金额', width: 120, align: 'right' as const, render: (v: any) => v != null ? `¥${Number(v).toLocaleString()}` : '-' },
    { title: '状态', dataIndex: '合同状态', width: 100, align: 'center' as const, render: (v: any) => {
        const color = v === '执行中' ? 'green' : v === '已结项' ? 'default' : 'orange';
        return <Tag color={color}>{v || '-'}</Tag>;
    }},
    { title: '签订时间', dataIndex: '签订时间', width: 120, align: 'center' as const }
  ];

  /** 初始化时加载全量合同到右侧表格 */
  useEffect(() => {
    (async () => {
      try {
        setSearchLoading(true);
        const res = await getContracts();
        setSearchResults(res.contracts || []);
      } catch { /* ignore */ }
      finally { setSearchLoading(false); }
    })();
  }, []);

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
        body: JSON.stringify({ message: text })
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
          setSearchLoading(true);
          try {
            const result = await searchContractsAdvanced(finalToolCall.arguments || {});
            setSearchResults(result.contracts || []);
            setMessages((prev) => {
              const newMessages = [...prev];
              newMessages[assistantMsgIndex] = { 
                role: 'assistant', 
                content: `✅ 为您找到 **${result.contracts?.length || 0}** 条符合条件的合同记录，已在右侧表格为您展示。` 
              };
              return newMessages;
            });
          } catch (e: any) {
            setMessages((prev) => {
              const newMessages = [...prev];
              newMessages[assistantMsgIndex] = { role: 'assistant', content: `❌ 查询失败: ${e.message}` };
              return newMessages;
            });
          } finally {
            setSearchLoading(false);
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
  }, [inputValue, loading, messages.length]);

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
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '✅ 操作已成功执行！台账已更新！' },
        ]);
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

  /* ── 渲染 ────────────────────────────────────────────── */

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      
      {/* 侧边栏：智能查询对话区 */}
      <div style={{ width: '400px', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, background: 'rgba(10, 15, 28, 0.6)', backdropFilter: 'blur(20px)' }}>
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
          <div style={{ display: 'flex', gap: 8 }}>
            <TextArea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder="找什么合同？例如：今年华为的已结项合同"
              autoSize={{ minRows: 1, maxRows: 5 }}
              disabled={loading}
              style={{ flex: 1 }}
            />
            <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={loading} disabled={!inputValue.trim()}>发送</Button>
          </div>
        </div>
      </div>

      {/* 右侧：查询结果表格区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <h2 style={{ fontSize: 16, margin: 0, fontWeight: 600, color: '#fff' }}>查询结果台账 ({searchResults.length})</h2>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          <div className="glass-panel" style={{ padding: 0 }}>
            <Table
              columns={columns}
              dataSource={searchResults}
              rowKey="row_number"
              loading={searchLoading}
              size="middle"
              pagination={{ pageSize: 15 }}
              onRow={(record) => ({
                onClick: () => {
                  setSelectedContract(record);
                  setDrawerVisible(true);
                },
                style: { cursor: 'pointer' }
              })}
            />
          </div>
        </div>
      </div>

      {/* 右侧详情 Drawer */}
      <Drawer
        title="合同明细"
        width={600}
        placement="right"
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
      >
        {selectedContract && (
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="合同名称">{selectedContract['合同名称']}</Descriptions.Item>
            <Descriptions.Item label="合同编号">{selectedContract['合同编号']}</Descriptions.Item>
            <Descriptions.Item label="对方单位">{selectedContract['对方单位名称']}</Descriptions.Item>
            <Descriptions.Item label="合同金额">¥{Number(selectedContract['合同金额'] || 0).toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={selectedContract['合同状态'] === '执行中' ? 'green' : 'default'}>{selectedContract['合同状态']}</Tag></Descriptions.Item>
            <Descriptions.Item label="签订时间">{selectedContract['签订时间']}</Descriptions.Item>
            <Descriptions.Item label="截止日期">{selectedContract['截止日期']}</Descriptions.Item>
            <Descriptions.Item label="备注">{selectedContract['备注']}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
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
