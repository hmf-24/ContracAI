import { useState, useRef } from 'react';
import { Upload, Button, Form, Input, message, Spin, Result } from 'antd';
import {
  InboxOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { uploadDocument, executeOperation } from '../api';

const { Dragger } = Upload;

/* ────────────────────────────────────────────────────────────
   可编辑字段列表
   ──────────────────────────────────────────────────────────── */

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
];

/* ────────────────────────────────────────────────────────────
   组件
   ──────────────────────────────────────────────────────────── */

/**
 * 合同导入面板
 *
 * 功能：
 *   - 文件拖拽 / 点击上传（支持 PDF、Word、图片）
 *   - 上传后展示 OCR 解析结果的可编辑表单
 *   - 确认后调用 create_contract 写入台账
 */
export default function ImportPanel() {
  const [form] = Form.useForm();
  /** 当前阶段: idle → uploading → editing → done */
  const [stage, setStage] = useState<'idle' | 'uploading' | 'editing' | 'done'>('idle');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fileName, setFileName] = useState('');

  /* ── 处理文件上传 ────────────────────────────────────── */

  async function handleUpload(file: File) {
    setFileName(file.name);
    setStage('uploading');
    setUploading(true);

    try {
      const data = await uploadDocument(file);
      if (data.status === 'success' && data.extracted) {
        // 将提取结果填入表单
        form.setFieldsValue(data.extracted);
        setStage('editing');
      } else {
        message.error('解析失败: 未能提取有效数据');
        setStage('idle');
      }
    } catch (err: any) {
      message.error('上传失败: ' + err.message);
      setStage('idle');
    } finally {
      setUploading(false);
    }

    // 阻止 antd Upload 的默认行为
    return false;
  }

  /* ── 确认录入台账 ────────────────────────────────────── */

  async function handleConfirm() {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      // 转换数值字段
      const params = { ...values };
      if (params['合同金额']) params['合同金额'] = parseFloat(params['合同金额']);
      if (params['税率']) params['税率'] = parseFloat(params['税率']);

      const result = await executeOperation('create_contract', params);
      if (result.status === 'success') {
        message.success('✅ 合同已成功录入台账！');
        setStage('done');
      } else {
        message.warning('录入异常: ' + JSON.stringify(result));
      }
    } catch (err: any) {
      if (err.errorFields) {
        // 表单验证错误
        return;
      }
      message.error('请求失败: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  /* ── 重置 ────────────────────────────────────────────── */

  function handleReset() {
    form.resetFields();
    setFileName('');
    setStage('idle');
  }

  /* ── 渲染 ────────────────────────────────────────────── */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* 标题栏 */}
      <div
        className="glass-topbar"
        style={{
          height: 'var(--header-height)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 32px',
          flexShrink: 0,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              margin: 0,
              fontFamily: 'var(--font-heading)',
            }}
          >
            合同导入
          </h1>
          <p
            style={{
              fontSize: 12,
              color: 'var(--color-ink-tertiary)',
              margin: 0,
            }}
          >
            上传合同文件，智能提取关键信息
          </p>
        </div>
      </div>

      {/* 内容区 */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 32px',
          maxWidth: 800,
        }}
      >
        {/* 阶段一：上传区域 */}
        {stage === 'idle' && (
          <div className="glass-card" style={{ padding: 0 }}>
            <Dragger
              accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.webp"
              showUploadList={false}
              beforeUpload={(file) => {
                handleUpload(file);
                return false;
              }}
              style={{
                padding: '48px 24px',
                background: 'transparent',
                border: 'none',
              }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined
                  style={{ fontSize: 48, color: 'var(--color-ink-tertiary)' }}
                />
              </p>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 500,
                  color: 'var(--color-ink)',
                }}
              >
                拖拽文件到此处，或点击选择文件
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--color-ink-tertiary)',
                }}
              >
                支持 PDF、Word (.docx)、图片 (.jpg/.png) 格式
              </p>
            </Dragger>
          </div>
        )}

        {/* 阶段二：加载中 */}
        {stage === 'uploading' && (
          <div
            className="glass-card"
            style={{
              padding: '48px 24px',
              textAlign: 'center',
            }}
          >
            <Spin size="large" />
            <p
              style={{
                marginTop: 16,
                fontSize: 14,
                color: 'var(--color-ink-secondary)',
              }}
            >
              正在解析 <strong>{fileName}</strong>...
            </p>
          </div>
        )}

        {/* 阶段三：编辑提取结果 */}
        {stage === 'editing' && (
          <div className="glass-card" style={{ padding: 24 }}>
            <h3
              style={{
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 20,
                color: 'var(--color-ink)',
              }}
            >
              📋 提取结果 — {fileName}
            </h3>

            <Form form={form} layout="vertical" size="middle">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '0 24px',
                }}
              >
                {EDITABLE_FIELDS.map((field) => (
                  <Form.Item
                    key={field}
                    name={field}
                    label={field}
                    style={{ marginBottom: 12 }}
                  >
                    <Input placeholder={`请输入${field}`} />
                  </Form.Item>
                ))}
              </div>
            </Form>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={handleConfirm}
                loading={submitting}
              >
                确认录入台账
              </Button>
              <Button
                icon={<CloseCircleOutlined />}
                onClick={handleReset}
              >
                取消
              </Button>
            </div>
          </div>
        )}

        {/* 阶段四：完成 */}
        {stage === 'done' && (
          <div className="glass-card" style={{ padding: 24 }}>
            <Result
              status="success"
              title="合同已成功录入！"
              subTitle={`文件 ${fileName} 的数据已写入 Excel 台账。`}
              extra={
                <Button type="primary" onClick={handleReset}>
                  继续导入
                </Button>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
