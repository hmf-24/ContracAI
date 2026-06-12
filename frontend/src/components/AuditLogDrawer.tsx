import { useState, useEffect } from 'react';
import { Drawer, Table, Tag, Typography, message } from 'antd';
import { getAuditLogs } from '../api';
import dayjs from 'dayjs';

const { Text } = Typography;

interface AuditLog {
  id: number;
  timestamp: string;
  user_id: string;
  username: string;
  action: string;
  target: string;
  detail: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function AuditLogDrawer({ visible, onClose }: Props) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });

  useEffect(() => {
    if (visible) {
      loadLogs(1, pagination.pageSize);
    }
  }, [visible]);

  async function loadLogs(page: number, pageSize: number) {
    setLoading(true);
    try {
      const offset = (page - 1) * pageSize;
      const res = await getAuditLogs(pageSize, offset);
      setLogs(res.logs || []);
      setTotal(res.total || 0);
      setPagination({ current: page, pageSize });
    } catch (err: any) {
      message.error(err.message || '加载审计日志失败');
    } finally {
      setLoading(false);
    }
  }

  const columns = [
    {
      title: '操作时间',
      dataIndex: 'timestamp',
      width: 160,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作人',
      dataIndex: 'username',
      width: 100,
    },
    {
      title: '动作类型',
      dataIndex: 'action',
      width: 120,
      render: (v: string) => {
        let color = 'default';
        if (v.includes('AI')) color = 'cyan';
        else if (v.includes('删除')) color = 'error';
        else if (v.includes('新建')) color = 'success';
        return <Tag color={color}>{v}</Tag>;
      }
    },
    {
      title: '目标对象',
      dataIndex: 'target',
      width: 200,
      ellipsis: true,
    },
    {
      title: '操作详情',
      dataIndex: 'detail',
    }
  ];

  return (
    <Drawer
      title="系统操作审计日志"
      width={900}
      placement="right"
      onClose={onClose}
      open={visible}
    >
      <div className="glass-panel" style={{ padding: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <Text style={{ color: 'rgba(255,255,255,0.6)' }}>
            记录系统中所有关键操作的修改痕迹，共 {total} 条记录。
          </Text>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          <Table
            columns={columns}
            dataSource={logs}
            rowKey="id"
            size="small"
            loading={loading}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: total,
              showSizeChanger: true,
              onChange: loadLogs
            }}
          />
        </div>
      </div>
    </Drawer>
  );
}
