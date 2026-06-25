import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Button, Tag, Alert, message, Modal, Drawer, Descriptions, Progress, Timeline, Space, Tree, Checkbox, Typography, Form, Input, InputNumber, Select, DatePicker, Row, Col, FloatButton, Upload } from 'antd';
import { ReloadOutlined, WarningOutlined, BulbOutlined, ProfileOutlined, UploadOutlined, RobotOutlined, CheckCircleOutlined, ExclamationCircleOutlined, DownloadOutlined, PlusOutlined, MinusCircleOutlined, DeleteOutlined, SearchOutlined, FilterOutlined, HolderOutlined, FileTextOutlined, EyeOutlined } from '@ant-design/icons';
import { getContracts, getWarnings, executeOperation, analyzeRisk, updateContract, updateContractsOrder, deleteContract, uploadAttachment } from '../api';
import dayjs from 'dayjs';
import { useAuth } from '../contexts/AuthContext';

import ChatPanel from './ChatPanel';
import ContractFileViewer from './ContractFileViewer';
import type { ColumnsType } from 'antd/es/table';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const DraggableRow = (props: any) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props['data-row-key'],
  });

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 9999 } : {}),
  };

  return <tr {...props} ref={setNodeRef} style={style} {...attributes} {...listeners} />;
};


/** 将日期字符串统一格式化为 YYYY-MM-DD，去掉多余的 00:00:00 */
function fmtDate(v: any): string {
  if (!v || v === '-') return '-';
  const s = String(v).trim();
  // 如果包含空格或T，取前10位
  if (s.length >= 10) return s.substring(0, 10);
  return s;
}

/* ────────────────────────────────────────────────────────────
   类型定义
   ──────────────────────────────────────────────────────────── */

interface ContractRecord {
  序号?: number;
  合同名称?: string;
  对方单位名称?: string;
  合同金额?: number;
  合同状态?: string;
  付款合计?: number;
  合同未付款合计?: number;
  截止日期?: string;
  [key: string]: any;
}

interface ExpiryWarning {
  合同名称: string;
  截止日期: string;
  剩余天数: number;
  row: number;
}

interface ClosureCandidate {
  合同名称: string;
  对方单位名称: string;
  row: number;
}

export default function LedgerPanel({ initialSearchKeyword = '' }: { initialSearchKeyword?: string }) {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [warnings, setWarnings] = useState<ExpiryWarning[]>([]);
  const [closureCandidates, setClosureCandidates] = useState<ClosureCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Drawer state
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedContract, setSelectedContract] = useState<ContractRecord | null>(null);

  // Chat Copilot state
  const [chatDrawerVisible, setChatDrawerVisible] = useState(false);

  // Risk Analysis state
  const [analyzingRisk, setAnalyzingRisk] = useState(false);
  const [riskData, setRiskData] = useState<any[] | null>(null);



  // 合同原文预览状态
  const [filePreviewVisible, setFilePreviewVisible] = useState(false);
  const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState('');

  // 导出功能状态
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [selectedExportColumns, setSelectedExportColumns] = useState<string[]>(['合同编号', '合同名称', '对方单位名称', '合同金额', '签订时间']);
  const [exporting, setExporting] = useState(false);
  const [draggedRowIndex, setDraggedRowIndex] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 1, // Requires 1px movement before dragging starts, allows onClick to work normally
      },
    })
  );

  const onDragEnd = async ({ active, over }: any) => {
    if (active.id !== over?.id) {
      const activeIndex = contracts.findIndex((i) => i.row_number === active.id);
      const overIndex = contracts.findIndex((i) => i.row_number === over.id);
      
      const newContracts = arrayMove(contracts, activeIndex, overIndex);
      setContracts(newContracts);
      try {
        await updateContractsOrder(newContracts.map(c => c.row_number));
        message.success('顺序已更新并保存');
      } catch (err: any) {
        message.error('保存顺序失败');
        loadData();
      }
    }
  };

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem('ledgerPageSize');
    return saved ? parseInt(saved, 10) : 20;
  });

  // 编辑状态
  const [isEditing, setIsEditing] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editForm] = Form.useForm();

  // 筛选状态
  const [filterKeyword, setFilterKeyword] = useState(initialSearchKeyword);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [filterMinAmount, setFilterMinAmount] = useState<number | undefined>(undefined);
  const [filterMaxAmount, setFilterMaxAmount] = useState<number | undefined>(undefined);

  // 前端本地筛选（毫秒级响应）
  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      // 关键词模糊搜索（同时搜合同名称、对方单位、合同编号）
      if (filterKeyword) {
        const kw = filterKeyword.toLowerCase();
        const nameMatch = String(c['合同名称'] || '').toLowerCase().includes(kw);
        const partyMatch = String(c['对方单位名称'] || '').toLowerCase().includes(kw);
        const noMatch = String(c['合同编号'] || '').toLowerCase().includes(kw);
        if (!nameMatch && !partyMatch && !noMatch) return false;
      }
      // 状态筛选
      if (filterStatus && c['合同状态'] !== filterStatus) return false;
      // 金额范围
      const amt = Number(c['合同金额'] || 0);
      if (filterMinAmount !== undefined && amt < filterMinAmount) return false;
      if (filterMaxAmount !== undefined && amt > filterMaxAmount) return false;
      return true;
    });
  }, [contracts, filterKeyword, filterStatus, filterMinAmount, filterMaxAmount]);

  const ALL_EXPORT_COLUMNS = [
    '序号', '对应销售合同', '合同编号', '合同类型', '合同名称', '对方单位名称',
    '合同金额', '税率', '不含税金额', '履约保证金', '签订时间', '生效日期',
    '截止日期', '合同状态', '初验日期', '终验日期', '经办人', '采购方式',
    '主办部门', '合同支付条款', '备注', '已开票情况', '付款合计', '合同未付款合计'
  ];

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [contractsRes, warningsRes] = await Promise.all([
        getContracts(),
        getWarnings().catch(() => ({ expiry_warnings: [], closure_candidates: [] })),
      ]);
      setContracts(contractsRes.contracts || []);
      setWarnings(warningsRes.expiry_warnings || []);
      setClosureCandidates(warningsRes.closure_candidates || []);
    } catch {
      message.error('无法连接后端服务');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (initialSearchKeyword) {
      setFilterKeyword(initialSearchKeyword);
    }
  }, [initialSearchKeyword]);

  async function handleExport() {
    setExporting(true);
    try {
      const dataToExport = contracts.filter(c => selectedRowKeys.includes(c.row_number));
      const csvRows = [
        selectedExportColumns.join(','),
        ...dataToExport.map(row => 
          selectedExportColumns.map(col => `"${String(row[col] ?? '').replace(/"/g, '""')}"`).join(',')
        )
      ];
      const blob = new Blob([['\uFEFF', csvRows.join('\n')].join('')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `合同台账_${new Date().toLocaleDateString()}.csv`;
      link.click();
      message.success('导出成功');
      setExportModalVisible(false);
    } catch {
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  }

  async function handleClose(row: number, name: string) {
    Modal.confirm({
      title: '确认结项',
      content: `确定要将合同「${name}」状态更新为 "已结项" 吗？`,
      okText: '确认结项',
      cancelText: '取消',
      onOk: async () => {
        try {
          const result = await executeOperation('update_status', { row, status: '已结项' });
          if (result.status === 'success') {
            message.success('✅ 合同状态已更新为 "已结项"！');
            loadData();
          } else {
            message.warning('执行异常: ' + JSON.stringify(result));
          }
        } catch (err: any) {
          message.error('请求失败: ' + err.message);
        }
      },
    });
  }

  async function handleAnalyzeRisk() {
    if (!selectedContract || selectedContract.row_number === undefined) return;
    setAnalyzingRisk(true);
    try {
      const data = await analyzeRisk(selectedContract.row_number);
      setRiskData(data);
    } catch (err: any) {
      message.error('AI分析失败: ' + (err.message || '未知错误'));
    } finally {
      setAnalyzingRisk(false);
    }
  }

  async function handleEditSubmit() {
    if (!selectedContract || selectedContract.row_number === undefined) return;
    try {
      const values = await editForm.validateFields();
      setEditSubmitting(true);
      
      const payload = { ...values };
      const dateFields = ['签订时间', '生效日期', '初验日期', '终验日期', '截止日期'];
      for (const df of dateFields) {
        if (payload[df]) payload[df] = payload[df].format('YYYY-MM-DD');
      }
      
      // 处理 payments 中的日期和附件
      if (payload.payments && Array.isArray(payload.payments)) {
        payload.payments = payload.payments.map((p: any, i: number) => {
          let cleanedAttachments = p.attachments;
          if (Array.isArray(p.attachments)) {
            cleanedAttachments = p.attachments.map((att: any) => ({
              uid: att.uid,
              name: att.name,
              url: att.response?.url || att.url || '',
            }));
          }
          return {
            ...p,
            time: p.time && typeof p.time === 'object' ? p.time.format('YYYY-MM-DD') : p.time,
            group_index: i,
            attachments: cleanedAttachments
          };
        });
        // 自动计算付款合计
        const totalPaid = payload.payments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
        if (payload.payments.length > 0) {
          payload['付款合计'] = totalPaid;
          const totalAmount = Number(payload['合同金额'] || 0);
          payload['合同未付款合计'] = totalAmount > 0 ? Math.max(0, totalAmount - totalPaid) : 0;
        }
      }
      
      await updateContract(selectedContract.row_number, payload);
      message.success('合同修改成功！');
      setIsEditing(false);
      
      setSelectedContract({ ...selectedContract, ...payload });
      loadData();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error('修改失败: ' + (err.message || '未知错误'));
    } finally {
      setEditSubmitting(false);
    }
  }

  const columns: ColumnsType<ContractRecord> = [
    {
      key: 'sort',
      width: 40,
      align: 'center',
      render: () => <HolderOutlined style={{ cursor: 'grab', opacity: 0.5 }} className="drag-handle-icon" title="按住拖拽排序" />
    },
    {
      title: '序号',
      key: 'index',
      width: 60,
      align: 'center',
      render: (_, __, index) => (currentPage - 1) * pageSize + index + 1,
    },
    {
      title: '合同名称',
      dataIndex: '合同名称',
      ellipsis: true,
      width: 280,
      align: 'center',
      render: (v) => v ? <span style={{ fontWeight: 500, color: 'var(--color-ink)' }}>{v}</span> : <div style={{ textAlign: 'center', color: 'var(--color-ink-tertiary)' }}>-</div>,
    },
    {
      title: '收支方向',
      key: 'direction',
      width: 90,
      align: 'center',
      render: (_, record) => {
        const isIncome = record.direction === 'income' || String(record['合同类型'] || '').includes('销售');
        return isIncome ? <Tag color="cyan">收入</Tag> : <Tag color="orange">支出</Tag>;
      }
    },
    {
      title: '对方单位',
      dataIndex: '对方单位名称',
      ellipsis: true,
      width: 220,
      align: 'center',
      render: (v) => v ? v : <div style={{ textAlign: 'center', color: 'var(--color-ink-tertiary)' }}>-</div>,
    },
    {
      title: '合同金额',
      dataIndex: '合同金额',
      width: 120,
      align: 'center',
      sorter: (a, b) => Number(a['合同金额'] || 0) - Number(b['合同金额'] || 0),
      render: (v) => v != null && v !== '' ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>¥{Number(v).toLocaleString()}</span> : <div style={{ textAlign: 'center', color: 'var(--color-ink-tertiary)' }}>-</div>,
    },
    {
      title: '状态',
      dataIndex: '合同状态',
      width: 100,
      align: 'center',
      sorter: (a, b) => String(a['合同状态'] || '').localeCompare(String(b['合同状态'] || '')),
      render: (v) => {
        if (!v) return <div style={{ textAlign: 'center', color: 'var(--color-ink-tertiary)' }}>-</div>;
        const color = v === '执行中' ? 'green' : v === '已结项' ? 'default' : 'orange';
        return <Tag color={color}>{v}</Tag>;
      },
    },
    {
      title: '付款进度',
      key: 'payment_progress',
      width: 140,
      align: 'center',
      sorter: (a, b) => {
        const getPercent = (record: any) => {
          const total = Number(record['合同金额'] || 0);
          const paid = Number(record['付款合计'] || 0);
          return total === 0 ? 0 : paid / total;
        };
        return getPercent(a) - getPercent(b);
      },
      render: (_, record) => {
        const total = Number(record['合同金额'] || 0);
        const paid = Number(record['付款合计'] || 0);
        if (total === 0) return <Progress percent={0} size="small" />;
        const percent = Math.floor((paid / total) * 100);
        return <Progress percent={Math.min(percent, 100)} size="small" strokeColor={percent >= 100 ? 'var(--neon-green)' : 'var(--neon-cyan)'} />;
      }
    },
    {
      title: '截止日期',
      dataIndex: '截止日期',
      width: 120,
      align: 'center',
      sorter: (a, b) => {
        const dateA = new Date(a['截止日期'] || '1970-01-01').getTime();
        const dateB = new Date(b['截止日期'] || '1970-01-01').getTime();
        return dateA - dateB;
      },
      render: (v) => fmtDate(v),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      align: 'center',
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<ProfileOutlined />} onClick={(e) => {
            e.stopPropagation();
            setSelectedContract(record);
            setDrawerVisible(true);
          }}>详情</Button>
          {record['_source_file'] && (
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={(e) => {
              e.stopPropagation();
              setPreviewFileUrl(record['_source_file']);
              setPreviewFileName(record['_original_filename'] || record['合同名称'] || '合同原文');
              setFilePreviewVisible(true);
            }}>原文</Button>
          )}
          {user?.role === 'admin' && (
            <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={(e) => {
              e.stopPropagation();
              Modal.confirm({
                title: '确认删除合同',
                content: `确定要永久删除合同「${record['合同名称']}」吗？此操作无法恢复！`,
                okText: '确认删除',
                okType: 'danger',
                cancelText: '取消',
                onOk: async () => {
                  try {
                    await deleteContract(record.row_number as number);
                    message.success('合同已永久删除');
                    loadData();
                  } catch (err: any) {
                    message.error(err.message || '删除失败');
                  }
                }
              });
            }}>删除</Button>
          )}
        </Space>
      ),
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div className="glass-topbar" style={{ height: 'var(--header-height)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', margin: 0, fontFamily: 'var(--font-heading)' }}>台账预览</h1>
          <p style={{ fontSize: 12, color: 'var(--color-ink-tertiary)', margin: 0 }}>当前合同台账数据概览（点击行查看全部明细）</p>
        </div>
        <Space>
          <Button 
            type="dashed" 
            icon={<DownloadOutlined />} 
            onClick={() => {
              if (selectedRowKeys.length === 0) {
                message.warning('请先在表格中勾选要导出的合同');
                return;
              }
              setExportModalVisible(true);
            }}
          >
            定制化导出 ({selectedRowKeys.length})
          </Button>

          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>刷新</Button>
        </Space>
      </div>

      {/* 筛选栏 */}
      <div className="glass-panel" style={{ margin: '0 32px', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, borderRadius: 12 }}>
        <FilterOutlined style={{ color: 'var(--neon-cyan)', fontSize: 14 }} />
        <Input
          placeholder="搜索合同名称 / 对方单位 / 编号"
          prefix={<SearchOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />}
          allowClear
          value={filterKeyword}
          onChange={e => { setFilterKeyword(e.target.value); setCurrentPage(1); }}
          style={{ width: 260 }}
        />
        <Select
          placeholder="合同状态"
          allowClear
          value={filterStatus}
          onChange={v => { setFilterStatus(v); setCurrentPage(1); }}
          style={{ width: 140 }}
          options={[
            { label: '执行中', value: '执行中' },
            { label: '已结项', value: '已结项' },
            { label: '已验收', value: '已验收' },
            { label: '异常挂起', value: '异常挂起' },
          ]}
        />
        <InputNumber
          placeholder="最小金额"
          value={filterMinAmount}
          onChange={v => { setFilterMinAmount(v ?? undefined); setCurrentPage(1); }}
          style={{ width: 130 }}
          formatter={v => v ? `¥ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
        />
        <span style={{ color: 'rgba(255,255,255,0.3)' }}>~</span>
        <InputNumber
          placeholder="最大金额"
          value={filterMaxAmount}
          onChange={v => { setFilterMaxAmount(v ?? undefined); setCurrentPage(1); }}
          style={{ width: 130 }}
          formatter={v => v ? `¥ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
        />
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginLeft: 'auto' }}>
          筛选结果：{filteredContracts.length} 条
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 32px' }}>
        {warnings.length > 0 && (
          <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {warnings.map((w, idx) => (
              <Alert key={`expiry-${idx}`} type="warning" showIcon icon={<WarningOutlined />} message={<span>合同 <strong>「{w.合同名称}」</strong> 将于 <strong>{fmtDate(w.截止日期)}</strong> 到期（剩余 {w.剩余天数} 天）</span>} />
            ))}
          </div>
        )}

        {closureCandidates.length > 0 && (
          <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {closureCandidates.map((c, idx) => (
              <Alert key={`closure-${idx}`} type="info" showIcon icon={<BulbOutlined />} message={<span>合同 <strong>「{c.合同名称}」</strong>（{c.对方单位名称}）已满足结项条件</span>} action={user?.role === 'admin' ? <Button size="small" type="primary" onClick={() => handleClose(c.row, c.合同名称)}>一键结项</Button> : null} />
            ))}
          </div>
        )}

        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
                    <DndContext sensors={sensors} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
            <SortableContext items={contracts.map((i) => i.row_number)} strategy={verticalListSortingStrategy}>
              <Table
            components={{ body: { row: DraggableRow } }}
            rowSelection={{
              selectedRowKeys,
              onChange: (newSelectedRowKeys) => setSelectedRowKeys(newSelectedRowKeys),
            }}
            columns={columns}
            dataSource={filteredContracts}
            rowKey="row_number"
            loading={loading}
            pagination={{ 
              current: currentPage,
              pageSize: pageSize, 
              showSizeChanger: true, 
              showTotal: (t) => `共 ${t} 条`,
              onChange: (page, size) => {
                setCurrentPage(page);
                setPageSize(size);
                localStorage.setItem('ledgerPageSize', size.toString());
              }
            }}
            size="middle"
            scroll={{ x: 1300 }}
            onRow={(record) => ({
              onClick: () => {
                setSelectedContract(record);
                setRiskData(null);
                setDrawerVisible(true);
              },
              style: { cursor: 'pointer' }
            })}
          />
            </SortableContext>
          </DndContext>
        </div>
      </div>

            <Drawer
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingRight: 24 }}>
            <span style={{ fontWeight: 600 }}>合同明细 {isEditing ? '(编辑模式)' : ''}</span>
            <Space>
              {!isEditing ? (
                <>
                  {selectedContract?.['_source_file'] && (
                    <Button size="small" icon={<FileTextOutlined />} onClick={() => {
                      setPreviewFileUrl(selectedContract['_source_file']);
                      setPreviewFileName(selectedContract['_original_filename'] || selectedContract['合同名称'] || '合同原文');
                      setFilePreviewVisible(true);
                    }}>查看原文</Button>
                  )}
                  <Button size="small" type="primary" onClick={() => {
                    const dates: Record<string, any> = {};
                    const dateFields = ['签订时间', '生效日期', '初验日期', '终验日期', '截止日期'];
                    for (const df of dateFields) {
                      dates[df] = selectedContract?.[df] && selectedContract[df] !== '-' ? dayjs(selectedContract[df]) : null;
                    }
                    const payments = (selectedContract?.payments || []).map((p: any) => ({
                      ...p,
                      time: p.time ? dayjs(p.time) : null
                    }));
                    editForm.setFieldsValue({
                      ...selectedContract,
                      ...dates,
                      payments
                    });
                    setIsEditing(true);
                  }}>编辑修改</Button>
                  {user?.role === 'admin' && (
                    <Button type="primary" size="small" icon={<RobotOutlined />} onClick={handleAnalyzeRisk} loading={analyzingRisk}>
                      AI 风险评估
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button size="small" onClick={() => setIsEditing(false)}>取消</Button>
                  <Button size="small" type="primary" loading={editSubmitting} onClick={handleEditSubmit}>保存修改</Button>
                </>
              )}
            </Space>
          </div>
        }
        width={850}
        placement="right"
        onClose={() => {
          setDrawerVisible(false);
          setIsEditing(false);
        }}
        open={drawerVisible}
      >
        {selectedContract && (
          <Form form={editForm} layout="vertical">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {[
                {
                  title: '基础与合同信息',
                  columns: [
                    
                    { key: '对应销售合同', label: '对应销售合同', type: 'text' },
                    { key: '合同编号', label: '合同编号', type: 'text' },
                    { key: '合同类型', label: '合同类型', type: 'text' },
                    { key: '合同名称', label: '合同名称', type: 'text', required: true },
                    { key: '对方单位名称', label: '对方单位名称', type: 'text', required: true },
                    { key: '合同金额', label: '合同金额（元）', type: 'money' },
                    { key: '税率', label: '税率', type: 'percent' },
                    { key: '不含税金额', label: '不含税金额（元）', type: 'money' },
                    { key: '履约保证金', label: '履约保证金/质保金情况', type: 'text' },
                    { key: '签订时间', label: '签订时间', type: 'date' },
                    { key: '生效日期', label: '生效日期', type: 'date' },
                    { key: '截止日期', label: '截止日期（以质保/维保结束时间为准）', type: 'date' },
                    { key: '合同状态', label: '合同状态', type: 'status' }
                  ]
                },
                {
                  title: '合同执行节点',
                  columns: [
                    { key: '初验日期', label: '初验日期（无初验要求，统一填在终验栏）', type: 'date' },
                    { key: '终验日期', label: '终验日期', type: 'date' }
                  ]
                },
                {
                  title: '归属与流转信息',
                  columns: [
                    { key: '经办人', label: '经办人', type: 'text' },
                    { key: '采购方式', label: '采购方式', type: 'text' },
                    { key: '主办部门', label: '主办部门', type: 'text' },
                    { key: '合同支付条款', label: '合同支付条款', type: 'textarea' },
                    { key: '备注', label: '备注', type: 'textarea' },
                    { key: '已开票情况', label: '已开票情况', type: 'text' }
                  ]
                },
                {
                  title: '结算与支付情况',
                  columns: [
                    { key: '合同未付款合计', label: '合同未付款合计（自动计算）', type: 'money_readonly', color: '#f5222d' },
                    { key: '付款合计', label: '付款合计（自动计算）', type: 'money_readonly', color: '#52c41a' },
                    { key: '退履约保证金质保金', label: '退履约保证金、质保金', type: 'text' }
                  ]
                }
              ].map((group, gIdx) => (
                <Descriptions 
                  key={gIdx} 
                  title={<span style={{ color: 'var(--color-ink)', fontSize: 16, fontWeight: 600 }}>{group.title}</span>} 
                  bordered 
                  size="small" 
                  column={2}
                >
                  {group.columns.map((col: any) => {
                    let viewContent: React.ReactNode = '-';
                    const rawVal = selectedContract[col.key];

                    // 格式化展示逻辑
                    if (['money', 'money_readonly'].includes(col.type)) {
                      viewContent = `¥${Number(rawVal || 0).toLocaleString()}`;
                      if (col.color) {
                        viewContent = <span style={{ color: col.color, fontWeight: 600 }}>{viewContent}</span>;
                      }
                    } else if (col.type === 'percent') {
                      viewContent = `${(Number(rawVal || 0) * 100).toFixed(0)}%`;
                    } else if (col.type === 'date') {
                      viewContent = fmtDate(rawVal);
                      if (col.key === '截止日期' && viewContent !== '-') {
                        viewContent = <span style={{ fontWeight: 600 }}>{viewContent}</span>;
                      }
                    } else if (col.type === 'status') {
                      viewContent = <Tag color={rawVal === '执行中' ? 'green' : 'default'}>{rawVal || '-'}</Tag>;
                    } else {
                      viewContent = rawVal || '-';
                    }

                    // 编辑模式逻辑
                    let editNode = null;
                    if (isEditing) {
                      if (['money_readonly', 'readonly'].includes(col.type)) {
                        editNode = <span style={{ color: 'var(--color-ink-tertiary)' }}>{viewContent} (不可编辑)</span>;
                      } else if (col.type === 'money') {
                        editNode = <Form.Item name={col.key} style={{ margin: 0 }}><InputNumber style={{ width: '100%' }} /></Form.Item>;
                      } else if (col.type === 'percent') {
                        editNode = <Form.Item name={col.key} style={{ margin: 0 }}><InputNumber style={{ width: '100%' }} step={0.01} /></Form.Item>;
                      } else if (col.type === 'date') {
                        editNode = <Form.Item name={col.key} style={{ margin: 0 }}><DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" /></Form.Item>;
                      } else if (col.type === 'status') {
                        editNode = (
                          <Form.Item name={col.key} style={{ margin: 0 }}>
                            <Select options={[
                              { label: '执行中', value: '执行中' },
                              { label: '已结项', value: '已结项' },
                              { label: '异常挂起', value: '异常挂起' }
                            ]} />
                          </Form.Item>
                        );
                      } else if (col.type === 'textarea') {
                        editNode = <Form.Item name={col.key} style={{ margin: 0 }}><Input.TextArea rows={2} /></Form.Item>;
                      } else {
                        editNode = <Form.Item name={col.key} style={{ margin: 0 }} rules={col.required ? [{ required: true }] : []}><Input /></Form.Item>;
                      }
                    }

                    const span = col.type === 'textarea' ? 2 : 1;

                    return (
                      <Descriptions.Item key={col.key} label={col.label} span={span}>
                        <div style={{ 
                          background: isEditing && editNode && !['money_readonly', 'readonly'].includes(col.type) ? 'var(--color-bg-subtle)' : 'transparent', 
                          padding: isEditing ? '4px 8px' : '0', 
                          borderRadius: 6,
                          transition: 'all 0.3s'
                        }}>
                          {isEditing && editNode ? editNode : viewContent}
                        </div>
                      </Descriptions.Item>
                    );
                  })}
                </Descriptions>
              ))}

              {isEditing ? (
                <div style={{ background: 'var(--color-bg-elevated)', padding: '16px 20px', borderRadius: 8, border: '1px dashed var(--color-border)' }}>
                  <Typography.Title level={5} style={{ marginBottom: 16 }}>多期付款流水登记</Typography.Title>
                  <Form.List name="payments">
                    {(fields, { add, remove }) => (
                      <>
                        {fields.map(({ key, name, ...restField }) => (
                          <Row key={key} gutter={16} align="middle" style={{ marginBottom: 8 }}>
                            <Col span={10}>
                              <Form.Item {...restField} name={[name, 'amount']} rules={[{ required: true, message: '请输入付款金额' }]} style={{ marginBottom: 0 }}>
                                <InputNumber placeholder="付款金额 (¥)" style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                            <Col span={10}>
                              <Form.Item {...restField} name={[name, 'time']} rules={[{ required: true, message: '请选择付款时间' }]} style={{ marginBottom: 0 }}>
                                <DatePicker placeholder="付款时间" style={{ width: '100%' }} format="YYYY-MM-DD" />
                              </Form.Item>
                            </Col>
                            <Col span={4}>
                              <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f', fontSize: 16, cursor: 'pointer' }} />
                            </Col>
                          
                                <Col span={24}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, 'attachments']}
                                    valuePropName="fileList"
                                    getValueFromEvent={(e: any) => {
                                      if (Array.isArray(e)) return e;
                                      return e?.fileList;
                                    }}
                                  >
                                    <Upload
                                      customRequest={async (options) => {
                                        const { file, onSuccess, onError } = options;
                                        try {
                                          const res = await uploadAttachment(file as File);
                                          onSuccess?.(res, file as any);
                                        } catch (err: any) {
                                          onError?.(err);
                                        }
                                      }}
                                      multiple
                                      accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.zip,.rar"
                                      listType="text"
                                    >
                                      <Button icon={<UploadOutlined />} size="small">上传附件</Button>
                                    </Upload>
                                  </Form.Item>
                                </Col>
                              </Row>
                        ))}
                        <Form.Item style={{ marginTop: 16, marginBottom: 0 }}>
                          <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>添加一笔付款记录</Button>
                        </Form.Item>
                      </>
                    )}
                  </Form.List>
                </div>
              ) : (
                selectedContract.payments && selectedContract.payments.some((p: any) => p.amount > 0) && (
                  <div style={{ background: 'var(--color-bg-elevated)', padding: '16px 20px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--color-ink)' }}>付款明细追踪</div>
                    <Timeline style={{ marginTop: 8 }}>
                      {selectedContract.payments.filter((p: any) => p.amount > 0).map((p: any) => (
                        <Timeline.Item key={p.group_index} color="green">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 500, color: 'var(--color-ink)' }}>第 {p.group_index + 1} 笔付款</div>
                              <div style={{ fontSize: 12, color: 'var(--color-ink-tertiary)' }}>{p.time || '未记录时间'}</div>
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: '#1677ff' }}>
                              ¥{Number(p.amount).toLocaleString()}
                            </div>
                          </div>
                        </Timeline.Item>
                      ))}
                    </Timeline>
                  </div>
                )
              )}

              {!isEditing && riskData && (
                <div style={{ background: 'var(--color-bg-elevated)', padding: '16px 20px', borderRadius: 8, border: '1px solid var(--color-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--color-brand)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RobotOutlined /> AI 风险与执行建议 (TaskTree)
                  </div>
                  <Tree
                    showLine
                    defaultExpandAll
                    treeData={riskData.map(node => {
                      const mapNode = (n: any): any => ({
                        title: (
                          <span style={{ fontSize: 14 }}>
                            {n.type === 'fund' && <WarningOutlined style={{ color: '#faad14', marginRight: 6 }} />}
                            {n.type === 'compliance' && <ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 6 }} />}
                            {n.type === 'action' && <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />}
                            <strong>{n.title}</strong>: <span style={{ color: 'var(--color-ink-tertiary)' }}>{n.content}</span>
                          </span>
                        ),
                        key: n.id || Math.random().toString(),
                        children: n.children ? n.children.map(mapNode) : []
                      });
                      return mapNode(node);
                    })}
                  />
                </div>
              )}
            </div>
          </Form>
        )}
      </Drawer>

      {/* 合同原文预览 Drawer（左侧滑出） */}
      <Drawer
        title={
          <span style={{ fontWeight: 600 }}>
            <FileTextOutlined style={{ marginRight: 8 }} />
            合同原文预览
          </span>
        }
        placement="left"
        width={600}
        onClose={() => setFilePreviewVisible(false)}
        open={filePreviewVisible}
        styles={{ body: { padding: 0 } }}
      >
        <ContractFileViewer
          fileUrl={previewFileUrl}
          originalFilename={previewFileName}
          height="100%"
        />
      </Drawer>


      <Modal
        title="定制化导出"
        open={exportModalVisible}
        onCancel={() => setExportModalVisible(false)}
        onOk={handleExport}
        confirmLoading={exporting}
        okText="立即导出 CSV"
        cancelText="取消"
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          <Typography.Text type="secondary">
            已选中 {selectedRowKeys.length} 行合同。请勾选您需要导出的列字段：
          </Typography.Text>
        </div>
        <Checkbox.Group
          options={ALL_EXPORT_COLUMNS}
          value={selectedExportColumns}
          onChange={(checkedValues) => setSelectedExportColumns(checkedValues as string[])}
          style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}
        />
      </Modal>

      {/* 智能助理浮窗按钮 */}
      <FloatButton
        icon={<RobotOutlined />}
        type="primary"
        style={{ right: 24, bottom: 24, width: 60, height: 60 }}
        tooltip="唤醒智能助理 (Copilot)"
        onClick={() => setChatDrawerVisible(true)}
      />

      {/* 智能助理 Drawer */}
      <Drawer
        title="🤖"
        placement="right"
        width={450}
        onClose={() => setChatDrawerVisible(false)}
        open={chatDrawerVisible}
        styles={{ body: { padding: 0 } }}
      >
        <ChatPanel 
          selectedContracts={selectedRowKeys.map(k => contracts.find(c => c['序号'] === k)).filter(Boolean)} 
          onLedgerUpdate={loadData} 
        />
      </Drawer>
    </div>
  );
}
