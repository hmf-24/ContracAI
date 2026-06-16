import { useState, useEffect } from 'react';
import { Form, Input, Button, message, Tooltip, Row, Col, Typography, Select, Radio, Space } from 'antd';
import {
  SaveOutlined, FolderOpenOutlined, RobotOutlined, BellOutlined,
  EyeInvisibleOutlined, EyeOutlined, CameraOutlined, InfoCircleOutlined,
  CloudOutlined, DesktopOutlined
} from '@ant-design/icons';
import { getConfig, updateConfig } from '../api';

const { Text } = Typography;

const PROVIDERS = {
  qwen: { name: '阿里通义千问 (Qwen)', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-turbo' },
  glm: { name: '智谱清言 (GLM)', url: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4' },
  minimax: { name: '海螺 (Minimax)', url: 'https://api.minimax.chat/v1', defaultModel: 'abab6.5s-chat' },
  openai: { name: 'OpenAI', url: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' }
};

export default function SettingsPanel({ onSaved }: { onSaved?: () => void }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [chatApiPlaceholder, setChatApiPlaceholder] = useState('输入 API Key');
  const [ocrApiPlaceholder, setOcrApiPlaceholder] = useState('输入 API Key');
  
  const [chatMode, setChatMode] = useState('cloud');
  const [ocrMode, setOcrMode] = useState('cloud');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const data = await getConfig();
      form.setFieldsValue({
        ledger_path: data.ledger_path || '',
        chat_llm_base_url: data.chat_llm?.base_url || '',
        chat_llm_model: data.chat_llm?.model || '',
        ocr_llm_base_url: data.ocr_llm?.base_url || '',
        ocr_llm_model: data.ocr_llm?.model || '',
        dingtalk_webhook: data.dingtalk_webhook || '',
      });
      
      if (data.chat_llm?.api_key) setChatApiPlaceholder(data.chat_llm.api_key);
      if (data.ocr_llm?.api_key) setOcrApiPlaceholder(data.ocr_llm.api_key);
      
      // Guess mode based on URL
      if (data.chat_llm?.base_url && !data.chat_llm.base_url.includes('http://localhost') && !data.chat_llm.base_url.includes('http://127.0')) {
        setChatMode('cloud');
      } else if (data.chat_llm?.base_url) {
        setChatMode('local');
      }
      
      if (data.ocr_llm?.base_url && !data.ocr_llm.base_url.includes('http://localhost') && !data.ocr_llm.base_url.includes('http://127.0')) {
        setOcrMode('cloud');
      } else if (data.ocr_llm?.base_url) {
        setOcrMode('local');
      }
      
    } catch {
      message.error('无法加载配置');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const configData: Record<string, any> = {
        ledger_path: values.ledger_path,
        chat_llm: {
          base_url: values.chat_llm_base_url,
          model: values.chat_llm_model,
        },
        ocr_llm: {
          base_url: values.ocr_llm_base_url,
          model: values.ocr_llm_model,
        },
        dingtalk_webhook: values.dingtalk_webhook,
      };

      if (values.chat_llm_api_key) configData.chat_llm.api_key = values.chat_llm_api_key;
      if (values.ocr_llm_api_key) configData.ocr_llm.api_key = values.ocr_llm_api_key;
      if (values.dingtalk_secret) configData.dingtalk_secret = values.dingtalk_secret;

      await updateConfig(configData);
      message.success('✅ 设置已成功保存并应用');
      onSaved?.();
      
      form.setFieldsValue({
        chat_llm_api_key: undefined,
        ocr_llm_api_key: undefined,
        dingtalk_secret: undefined,
      });
      loadSettings();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error('保存失败: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  const handleProviderChange = (type: 'chat'|'ocr', providerKey: keyof typeof PROVIDERS) => {
    const provider = PROVIDERS[providerKey];
    if (type === 'chat') {
      form.setFieldsValue({ chat_llm_base_url: provider.url, chat_llm_model: provider.defaultModel });
    } else {
      form.setFieldsValue({ ocr_llm_base_url: provider.url, ocr_llm_model: provider.defaultModel });
    }
  };

  const SectionTitle = ({ icon, title, desc }: { icon: React.ReactNode, title: string, desc?: string }) => (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-ink)', margin: 0 }}>
        {icon} {title}
      </h3>
      {desc && <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>{desc}</Text>}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div className="glass-topbar" style={{ height: 'var(--header-height)', display: 'flex', alignItems: 'center', padding: '0 32px', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', margin: 0, fontFamily: 'var(--font-heading)' }}>系统设置</h1>
          <p style={{ fontSize: 12, color: 'var(--color-ink-tertiary)', margin: 0 }}>配置底层存储、双模型服务和外部集成</p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Form form={form} layout="vertical" size="large" disabled={loading}>
            
            <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
              <SectionTitle icon={<FolderOpenOutlined />} title="数据存储" desc="配置本地 Excel 台账文件的绝对路径，作为系统的核心数据库。" />
              <Form.Item name="ledger_path" label="Excel 台账路径" style={{ marginBottom: 0 }}>
                <Input placeholder="例如: E:\Project\台账.xlsx" />
              </Form.Item>
            </div>

            <Row gutter={24}>
              {/* --- Chat LLM 配置 --- */}
              <Col span={12}>
                <div className="glass-card" style={{ padding: 24, marginBottom: 24, height: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <SectionTitle icon={<RobotOutlined />} title="对话与推理模型" desc="负责解析指令与智能问答" />
                    <Radio.Group value={chatMode} onChange={e => setChatMode(e.target.value)} size="small" buttonStyle="solid">
                      <Radio.Button value="cloud"><CloudOutlined /> 云端</Radio.Button>
                      <Radio.Button value="local"><DesktopOutlined /> 本地</Radio.Button>
                    </Radio.Group>
                  </div>
                  
                  {chatMode === 'cloud' && (
                    <Form.Item label="选择预设云厂商" style={{ marginBottom: 12 }}>
                      <Select placeholder="请选择云端模型提供商" onChange={(v) => handleProviderChange('chat', v as any)}>
                        {Object.entries(PROVIDERS).map(([k, v]) => (
                          <Select.Option key={k} value={k}>{v.name}</Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  )}

                  <Form.Item name="chat_llm_base_url" label="API Base URL">
                    <Input placeholder={chatMode === 'cloud' ? "选择厂商自动填充" : "http://localhost:11434/v1"} />
                  </Form.Item>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="chat_llm_model" label="模型名称" style={{ marginBottom: 0 }}>
                        <Input placeholder="模型名" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="chat_llm_api_key" label="API Key">
                        <Input.Password placeholder={chatApiPlaceholder} iconRender={v => v ? <EyeOutlined /> : <EyeInvisibleOutlined />} />
                      </Form.Item>
                    </Col>
                  </Row>
                </div>
              </Col>

              {/* --- OCR LLM 配置 --- */}
              <Col span={12}>
                <div className="glass-card" style={{ padding: 24, marginBottom: 24, height: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <SectionTitle icon={<CameraOutlined />} title="视觉与多模态模型" desc="用于图片和扫描件OCR提取" />
                    <Radio.Group value={ocrMode} onChange={e => setOcrMode(e.target.value)} size="small" buttonStyle="solid">
                      <Radio.Button value="cloud"><CloudOutlined /> 云端</Radio.Button>
                      <Radio.Button value="local"><DesktopOutlined /> 本地</Radio.Button>
                    </Radio.Group>
                  </div>

                  {ocrMode === 'cloud' && (
                    <Form.Item label="选择预设云厂商" style={{ marginBottom: 12 }}>
                      <Select placeholder="请选择云端模型提供商" onChange={(v) => handleProviderChange('ocr', v as any)}>
                        {Object.entries(PROVIDERS).map(([k, v]) => (
                          <Select.Option key={k} value={k}>{v.name}</Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  )}

                  <Form.Item name="ocr_llm_base_url" label="API Base URL">
                    <Input placeholder={ocrMode === 'cloud' ? "选择厂商自动填充" : "http://localhost:11434/v1"} />
                  </Form.Item>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="ocr_llm_model" label="模型名称" style={{ marginBottom: 0 }}>
                        <Input placeholder="模型名" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="ocr_llm_api_key" label="API Key">
                        <Input.Password placeholder={ocrApiPlaceholder} iconRender={v => v ? <EyeOutlined /> : <EyeInvisibleOutlined />} />
                      </Form.Item>
                    </Col>
                  </Row>
                </div>
              </Col>
            </Row>

            {/* --- 钉钉集成 --- */}
            <div className="glass-card" style={{ padding: 24, marginBottom: 32 }}>
              <SectionTitle icon={<BellOutlined />} title="消息推送 (钉钉)" desc="配置机器人的 Webhook 以接收每日合同到期和结项预警。" />
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item name="dingtalk_webhook" label="Webhook URL" style={{ marginBottom: 0 }}>
                    <Input placeholder="https://oapi.dingtalk.com/robot/send?access_token=..." />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="dingtalk_secret" label="加签密钥 (SEC...)" style={{ marginBottom: 0 }}>
                    <Input.Password placeholder="未配置" iconRender={(v) => v ? <EyeOutlined /> : <EyeInvisibleOutlined />} />
                  </Form.Item>
                </Col>
              </Row>
            </div>

            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving} size="large" block style={{ fontWeight: 500, height: 48 }}>
              应用并保存所有设置
            </Button>
          </Form>
        </div>
      </div>
    </div>
  );
}
