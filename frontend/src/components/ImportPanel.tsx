import { useState } from 'react';
import { Upload, Button, Form, Input, message, Spin, Result, Steps, Tag, List, Typography, Space, Card, Row, Col } from 'antd';
import {
  InboxOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  UploadOutlined,
  FilePdfOutlined,
  PlusOutlined,
  AppstoreOutlined,
  StarOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { uploadDocument, executeOperation } from '../api';
import ContractFileViewer from './ContractFileViewer';

const { Dragger } = Upload;
const { Text, Title } = Typography;

const EDITABLE_FIELDS = [
  '合同名称',
  '合同编号',
  '合同类型',
  '对方单位名称',
  '合同金额',
  '税率',
  '签订时间',
  '生效日期',
  '截止日期',
  '合同支付条款',
  '履约保证金',
  '经办人',
  '采购方式',
  '主办部门',
];

interface DocItem {
  id: string;
  name: string;
  status: 'idle' | 'uploading' | 'editing' | 'done';
}

export default function ImportPanel() {
  const [form] = Form.useForm();
  
  // 文档管理列表
  const [docList, setDocList] = useState<DocItem[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  // 当前选中态
  const [stage, setStage] = useState<'idle' | 'uploading' | 'editing' | 'done'>('idle');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState('');
  const [confidence, setConfidence] = useState<Record<string, string>>({});
  const [uploadStep, setUploadStep] = useState(0);
  
  // OCR BBox 状态
  const [allBboxes, setAllBboxes] = useState<any[]>([]);
  const [fieldBboxMap, setFieldBboxMap] = useState<Record<string, number[]>>({});
  const [activeBbox, setActiveBbox] = useState<number[] | undefined>(undefined);

  async function handleUpload(file: File) {
    const newDocId = Date.now().toString();
    const newDoc: DocItem = { id: newDocId, name: file.name, status: 'uploading' };
    
    setDocList(prev => [newDoc, ...prev]);
    setActiveDocId(newDocId);

    setFileName(file.name);
    setStage('uploading');
    setUploading(true);
    setUploadStep(0);

    const stepTimer1 = setTimeout(() => setUploadStep(1), 800);
    const stepTimer2 = setTimeout(() => setUploadStep(2), 2000);

    try {
      const data = await uploadDocument(file);
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setUploadStep(3);

      if (data.status === 'success' && data.extracted) {
        const conf = data.extracted._confidence || {};
        setConfidence(conf);
        
        setFieldBboxMap(data.extracted._bboxes || {});
        setAllBboxes(data.extracted._raw_bboxes || []);

        const formData = { ...data.extracted };
        delete formData._confidence;
        delete formData._bboxes;
        delete formData._raw_bboxes;
        delete formData._source_file;
        delete formData._original_filename;
        delete formData._parse_error;
        delete formData._raw_response;
        form.setFieldsValue(formData);

        setFileUrl(data.file_url || data.extracted._source_file || null);
        setFileType(data.file_type || '');

        setStage('editing');
        setDocList(prev => prev.map(d => d.id === newDocId ? { ...d, status: 'editing' } : d));
      } else {
        message.error('解析失败: 未能提取有效数据');
        setStage('idle');
        setDocList(prev => prev.map(d => d.id === newDocId ? { ...d, status: 'idle' } : d));
      }
    } catch (err: any) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      message.error('上传失败: ' + err.message);
      setStage('idle');
      setDocList(prev => prev.map(d => d.id === newDocId ? { ...d, status: 'idle' } : d));
    } finally {
      setUploading(false);
    }
    return false;
  }

  async function handleConfirm() {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const params = { ...values };
      if (params['合同金额']) params['合同金额'] = parseFloat(params['合同金额']);
      if (params['税率']) params['税率'] = parseFloat(params['税率']);
      if (fileUrl) params['_source_file'] = fileUrl;

      const result = await executeOperation('create_contract', params);
      if (result.status === 'success') {
        message.success('✅ 合同已成功录入台账！');
        setStage('done');
        setDocList(prev => prev.map(d => d.id === activeDocId ? { ...d, status: 'done' } : d));
      } else {
        message.warning('录入异常: ' + JSON.stringify(result));
      }
    } catch (err: any) {
      if (err.errorFields) return;
      message.error('请求失败: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    form.resetFields();
    setFileName('');
    setFileUrl(null);
    setFileType('');
    setConfidence({});
    setUploadStep(0);
    setStage('idle');
    setActiveDocId(null);
  }

  function getConfidenceStyle(field: string) {
    const level = confidence[field];
    if (level === 'low') return { 
      borderLeft: '3px solid rgba(255, 77, 79, 0.8)', 
      paddingLeft: 12, 
      background: 'linear-gradient(90deg, rgba(255, 77, 79, 0.05) 0%, transparent 100%)',
      marginBottom: 16
    };
    if (level === 'medium') return { 
      borderLeft: '3px solid rgba(250, 173, 20, 0.8)', 
      paddingLeft: 12, 
      background: 'linear-gradient(90deg, rgba(250, 173, 20, 0.05) 0%, transparent 100%)',
      marginBottom: 16
    };
    return { marginBottom: 16, borderLeft: '3px solid transparent', paddingLeft: 12 };
  }

  function getConfidenceTag(field: string) {
    const level = confidence[field];
    if (level === 'low') return <Tag color="red" style={{ marginLeft: 4, fontSize: 10 }}>低置信</Tag>;
    if (level === 'medium') return <Tag color="orange" style={{ marginLeft: 4, fontSize: 10 }}>待核对</Tag>;
    return null;
  }

  return (
    <div className="glass-card" style={{ display: 'flex', height: 'calc(100vh - 130px)', padding: 0, overflow: 'hidden' }}>
      
      {/* 侧边栏：完美复刻 MinerU 结构 */}
      <div style={{
        width: 260,
        background: 'var(--color-bg-subtle)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* 新解析按钮区域 */}
        <div style={{ padding: '24px 20px 16px' }}>
          <Button 
            type="primary" 
            ghost
            icon={<PlusOutlined />} 
            onClick={handleReset}
            style={{ 
              width: '100%', 
              height: 40, 
              borderRadius: 8,
              borderColor: 'var(--neon-cyan)',
              color: 'var(--neon-cyan)',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 229, 255, 0.05)'
            }}
          >
            新解析
          </Button>
        </div>

        {/* 导航菜单 */}
        <div style={{ padding: '0 12px' }}>
          <div style={{ padding: '12px 16px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, color: '#fff', background: 'rgba(255,255,255,0.05)' }}>
            <AppstoreOutlined style={{ fontSize: 16 }} />
            <span style={{ fontSize: 14 }}>任务管理</span>
          </div>
          <div style={{ padding: '12px 16px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, color: 'rgba(255,255,255,0.6)' }}>
            <StarOutlined style={{ fontSize: 16 }} />
            <span style={{ fontSize: 14 }}>我的收藏</span>
          </div>
        </div>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '16px 20px' }} />

        {/* 文件列表 */}
        <List
          size="small"
          dataSource={docList}
          style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}
          renderItem={(item) => (
            <List.Item
              onClick={() => {
                setActiveDocId(item.id);
                // 这里在真实场景可以切换状态，为了Demo暂且只做选中效果
              }}
              style={{
                cursor: 'pointer',
                borderRadius: 8,
                padding: '10px 16px',
                border: 'none',
                background: activeDocId === item.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                marginBottom: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                <FilePdfOutlined style={{ color: '#fff', fontSize: 16 }} />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <Text ellipsis style={{ color: activeDocId === item.id ? '#fff' : 'rgba(255,255,255,0.8)', fontSize: 13, display: 'block' }}>
                    {item.name}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                    {item.status === 'uploading' ? '处理中...' : item.status === 'done' ? '已归档' : '草稿'}
                  </Text>
                </div>
              </div>
            </List.Item>
          )}
        />
      </div>

      {/* 主内容区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(13, 17, 23, 0.5)', overflow: 'hidden' }}>
        
        {stage === 'idle' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '10vh' }}>
            {/* 欢迎标题 */}
            <Title level={2} style={{ color: '#fff', fontWeight: 600, marginBottom: 8 }}>智能合同解析</Title>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, marginBottom: 40 }}>让文档和网页内容为台账所用</Text>

            {/* 上传卡片 */}
            <div style={{ 
              width: 700, 
              background: 'rgba(255,255,255,0.02)', 
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16,
              padding: '60px 40px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
            }}>
              <Upload
                accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.webp"
                showUploadList={false}
                beforeUpload={(file) => {
                  handleUpload(file);
                  return false;
                }}
              >
                <div style={{ display: 'flex', gap: 24 }}>
                  <Button type="primary" size="large" icon={<UploadOutlined />} style={{ width: 160, height: 48, borderRadius: 24 }}>
                    上传文件
                  </Button>
                  <Button size="large" icon={<FileTextOutlined />} style={{ width: 160, height: 48, borderRadius: 24, background: 'rgba(255,255,255,0.05)', color: '#fff', borderColor: 'transparent' }}>
                    网页链接
                  </Button>
                </div>
              </Upload>
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 24 }}>
                服务策略调整：单次上限 5000 份 | 单文件 &lt; 200 页 | 高优每日 1000 页 | 频控优化
              </Text>
            </div>

            {/* 示例 */}
            <div style={{ width: 700, marginTop: 48 }}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <FileTextOutlined /> 示例
              </Text>
              <Row gutter={16}>
                <Col span={8}>
                  <Card size="small" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
                    <div style={{ height: 80, background: 'rgba(0,0,0,0.2)', marginBottom: 12, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FilePdfOutlined style={{ fontSize: 24, color: '#fff' }} />
                    </div>
                    <Text strong style={{ color: '#fff', fontSize: 13, display: 'block', textAlign: 'center' }}>标准采购合同.pdf</Text>
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
                    <div style={{ height: 80, background: 'rgba(0,0,0,0.2)', marginBottom: 12, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FilePdfOutlined style={{ fontSize: 24, color: '#fff' }} />
                    </div>
                    <Text strong style={{ color: '#fff', fontSize: 13, display: 'block', textAlign: 'center' }}>房屋租赁协议.pdf</Text>
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
                    <div style={{ height: 80, background: 'rgba(0,0,0,0.2)', marginBottom: 12, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FilePdfOutlined style={{ fontSize: 24, color: '#fff' }} />
                    </div>
                    <Text strong style={{ color: '#fff', fontSize: 13, display: 'block', textAlign: 'center' }}>框架合作协议.pdf</Text>
                  </Card>
                </Col>
              </Row>
            </div>
          </div>
        )}

        {stage === 'uploading' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
            <p style={{ marginTop: 24, fontSize: 14, color: 'var(--color-ink-secondary)' }}>正在解析 <strong>{fileName}</strong></p>
            <Steps current={uploadStep} size="small" style={{ marginTop: 24, maxWidth: 400 }} items={[{ title: '上传文件' }, { title: 'OCR 识别' }, { title: '结构化提取' }, { title: '完成' }]} />
          </div>
        )}

        {stage === 'editing' && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* 左侧：合同原文预览 */}
            <div style={{ flex: 1, padding: 24, overflow: 'hidden', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
              <ContractFileViewer fileUrl={fileUrl} originalFilename={fileName} height="100%" allBboxes={allBboxes} activeBbox={activeBbox} />
            </div>

            {/* 右侧：提取结果表单 */}
            <div style={{ width: 400, padding: 24, overflowY: 'auto' }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#fff' }}>📋 提取结果</h3>
              <p style={{ fontSize: 12, color: 'var(--color-ink-tertiary)', marginBottom: 20 }}>
                <WarningOutlined style={{ color: '#faad14', marginRight: 4 }} />
                高亮字段请重点核对原文
              </p>

              <Form form={form} layout="vertical" size="middle">
                {EDITABLE_FIELDS.map((field) => (
                  <Form.Item key={field} name={field} label={<span>{field}{getConfidenceTag(field)}</span>} style={{ marginBottom: 16, ...getConfidenceStyle(field) }}>
                    <Input 
                      placeholder={`请输入${field}`} 
                      onFocus={() => {
                        if (fieldBboxMap[field]) setActiveBbox(fieldBboxMap[field]);
                        else setActiveBbox(undefined);
                      }}
                      onBlur={() => setActiveBbox(undefined)}
                    />
                  </Form.Item>
                ))}
              </Form>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleConfirm} loading={submitting} block>确认录入台账</Button>
                <Button onClick={handleReset} block>重新导入</Button>
              </div>
            </div>
          </div>
        )}

        {stage === 'done' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Result status="success" title="合同已成功录入！" subTitle={`文件 ${fileName} 的数据已写入台账，原文已归档可随时调阅。`} extra={<Button type="primary" onClick={handleReset}>继续导入新文件</Button>} />
          </div>
        )}
      </div>

    </div>
  );
}
