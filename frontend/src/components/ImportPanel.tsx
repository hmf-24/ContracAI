import { useState } from 'react';
import { Upload, Button, Form, Input, message, Spin, Result, Steps, Tag, List, Typography, Space, Card, Row, Col, Tabs } from 'antd';
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
import { uploadDocument, executeOperation, uploadInvoice } from '../api';
import ContractFileViewer from './ContractFileViewer';
import { Table, Radio } from 'antd';

const { Dragger } = Upload;
const { Text, Title } = Typography;

const EDITABLE_FIELDS = [
  '项目名称',
  '收支方向',
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

  // 票据模式状态
  const [mode, setMode] = useState<'contract' | 'invoice'>('contract');
  const [invoiceCandidates, setInvoiceCandidates] = useState<any[]>([]);
  const [invoiceExtracted, setInvoiceExtracted] = useState<any>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null);

  async function handleInvoiceUpload(file: File) {
    setFileName(file.name);
    setStage('uploading');
    setUploading(true);
    setUploadStep(0);
    const stepTimer1 = setTimeout(() => setUploadStep(1), 800);
    const stepTimer2 = setTimeout(() => setUploadStep(2), 2000);

    try {
      const data = await uploadInvoice(file);
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setUploadStep(3);

      if (data.status === 'success' && data.extracted) {
        setInvoiceExtracted(data.extracted);
        setInvoiceCandidates(data.candidates || []);
        if (data.candidates && data.candidates.length > 0) {
          setSelectedCandidate(data.candidates[0].row_number);
        }
        setFileUrl(data.file_url || null);
        setStage('editing');
      } else {
        message.error('票据解析失败');
        setStage('idle');
      }
    } catch (err: any) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      message.error('上传失败: ' + err.message);
      setStage('idle');
    } finally {
      setUploading(false);
    }
    return false;
  }

  async function handleInvoiceConfirm() {
    if (!selectedCandidate) {
      message.warning('请选择关联的合同');
      return;
    }
    setSubmitting(true);
    try {
      const amt = invoiceExtracted?.['开票总金额']?.value || 0;
      // 这里调用更新合同付款合计的后端逻辑，或者直接提示成功（需要后端支持记录付款明细或累加付款金额，这里先使用通用 update_status 或自定义逻辑）
      // 假设我们增加付款金额，调用 update_contract 逻辑（在此简单模拟，Phase 4中可直接视为核销成功）
      await executeOperation('update_status', { row: selectedCandidate, status: '票据已核销' });
      message.success(`✅ 票据已成功核销！自动匹配关联金额 ¥${amt}`);
      setStage('done');
    } catch (err: any) {
      message.error('核销失败');
    } finally {
      setSubmitting(false);
    }
  }

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
        console.log('[DEBUG] _raw_bboxes count:', (data.extracted._raw_bboxes || []).length);
        console.log('[DEBUG] _raw_bboxes sample:', (data.extracted._raw_bboxes || [])[0]);
        console.log('[DEBUG] _bboxes (field map):', data.extracted._bboxes);

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
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '6vh' }}>
            {/* 欢迎标题 */}
            <Title level={2} style={{ color: '#fff', fontWeight: 600, marginBottom: 8 }}>智能解析中心</Title>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, marginBottom: 20 }}>让文档和网页内容为台账所用</Text>

            <Tabs 
              centered 
              size="large" 
              activeKey={mode}
              onChange={(k) => setMode(k as 'contract' | 'invoice')}
              items={[
                {
                  label: '📄 合同解析录入',
                  key: 'contract',
                  children: (
                    <div style={{ 
                      width: 700, 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 16,
                      padding: '60px 40px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                      marginTop: 20
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
                            上传合同文件
                          </Button>
                        </div>
                      </Upload>
                      <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 24 }}>
                        支持 PDF, DOCX, 图片等格式
                      </Text>
                    </div>
                  )
                },
                {
                  key: 'invoice',
                  label: <span style={{ fontSize: 16 }}><FileTextOutlined /> 票据凭证核销</span>,
                  children: (
                    <div style={{ 
                      width: 700, 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px dashed rgba(255,255,255,0.2)',
                      borderRadius: 16,
                      padding: '60px 40px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                      marginTop: 20
                    }}>
                      <Title level={4} style={{ color: '#fff', marginBottom: 24, fontWeight: 500 }}>
                        上传发票/收据以智能核销
                      </Title>
                      <Upload
                        accept=".pdf,.jpg,.jpeg,.png"
                        showUploadList={false}
                        beforeUpload={() => false}
                      >
                        <Button type="dashed" size="large" icon={<UploadOutlined />} style={{ width: 160, height: 48, borderRadius: 24 }} disabled>
                          上传发票/回执
                        </Button>
                      </Upload>
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 24 }}>
                        功能即将上线：未来支持钉钉机器人一键直传核销
                      </Text>
                    </div>
                  )
                }
              ]}
            />


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
            {/* 左侧：合同/票据原文预览 */}
            <div style={{ flex: 1, padding: 24, overflow: 'hidden', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
              <ContractFileViewer fileUrl={fileUrl} originalFilename={fileName} height="100%" allBboxes={allBboxes} activeBbox={activeBbox} />
            </div>

            {/* 右侧：提取结果表单/候选列表 */}
            <div style={{ width: 450, padding: 24, overflowY: 'auto' }}>
              {mode === 'contract' ? (
                <>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: '#fff' }}>📋 提取结果</h3>
                  <Form form={form} layout="vertical" size="middle">
                    {EDITABLE_FIELDS.map((field) => (
                      <Form.Item key={field} name={field} label={<span>{field}{getConfidenceTag(field)}</span>} style={getConfidenceStyle(field)}>
                        <Input 
                          placeholder={`请输入${field}`} 
                          onFocus={() => {
                            if (fieldBboxMap[field]) setActiveBbox(fieldBboxMap[field]);
                            else setActiveBbox(undefined);
                          }}
                        />
                      </Form.Item>
                    ))}
                  </Form>
                  <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                    <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleConfirm} loading={submitting} block>确认录入台账</Button>
                    <Button onClick={handleReset} block>重新导入</Button>
                  </div>
                </>
              ) : (
                <>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: '#fff' }}>🧾 票据识别结果</h3>
                  <Card size="small" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
                    <p style={{ margin: '4px 0', color: 'rgba(255,255,255,0.6)' }}>发票号：<span style={{ color: '#fff' }}>{invoiceExtracted?.['发票号码']?.value || '-'}</span></p>
                    <p style={{ margin: '4px 0', color: 'rgba(255,255,255,0.6)' }}>金额：<span style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>¥ {invoiceExtracted?.['开票总金额']?.value || 0}</span></p>
                    <p style={{ margin: '4px 0', color: 'rgba(255,255,255,0.6)' }}>开票方：<span style={{ color: '#fff' }}>{invoiceExtracted?.['开票单位名称']?.value || '-'}</span></p>
                  </Card>
                  
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#fff' }}>🔗 智能匹配合同</h3>
                  {invoiceCandidates.length > 0 ? (
                    <Radio.Group style={{ width: '100%' }} value={selectedCandidate} onChange={e => setSelectedCandidate(e.target.value)}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {invoiceCandidates.map((c: any) => (
                          <Card 
                            key={c.row_number} 
                            size="small" 
                            style={{ 
                              width: '100%', 
                              background: selectedCandidate === c.row_number ? 'rgba(0, 229, 255, 0.1)' : 'rgba(255,255,255,0.02)', 
                              borderColor: selectedCandidate === c.row_number ? 'var(--neon-cyan)' : 'rgba(255,255,255,0.08)',
                              cursor: 'pointer'
                            }}
                            onClick={() => setSelectedCandidate(c.row_number)}
                          >
                            <Radio value={c.row_number} style={{ display: 'flex', width: '100%' }}>
                              <div style={{ marginLeft: 8 }}>
                                <div style={{ color: '#fff', fontWeight: 500 }}>{c['合同名称']}</div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{c['对方单位名称']}</div>
                                <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 12 }}>
                                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>总额: ¥{c['合同金额']}</span>
                                  <span style={{ color: 'var(--neon-cyan)' }}>未付: ¥{c['未付金额']}</span>
                                </div>
                              </div>
                            </Radio>
                          </Card>
                        ))}
                      </Space>
                    </Radio.Group>
                  ) : (
                    <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '20px 0' }}>未找到匹配合同，可能是系统外支出</div>
                  )}

                  <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                    <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleInvoiceConfirm} loading={submitting} block disabled={!selectedCandidate}>确认核销付款</Button>
                    <Button onClick={handleReset} block>重新导入</Button>
                  </div>
                </>
              )}
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
