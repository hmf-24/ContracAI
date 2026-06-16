import { useState, useEffect } from 'react';
import { Layout, Menu, Typography, Dropdown, Button, Upload, message } from 'antd';
import {
  MessageOutlined,
  TableOutlined,
  UploadOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  ProfileOutlined,
} from '@ant-design/icons';
import ChatPanel from './components/ChatPanel';
import LedgerPanel from './components/LedgerPanel';
import ImportPanel from './components/ImportPanel';
import SettingsPanel from './components/SettingsPanel';
import LoginPanel from './components/LoginPanel';
import DashboardPanel from './components/DashboardPanel';
import GraphPanel from './components/GraphPanel';
import AuditLogDrawer from './components/AuditLogDrawer';
import { getHealth, uploadAvatar } from './api';
import { useAuth } from './contexts/AuthContext';

const { Sider, Content } = Layout;
const { Text } = Typography;

export default function App() {
  const { isAuthenticated, user, logout, updateUser } = useAuth();
  const [activePanel, setActivePanel] = useState('dashboard');
  const [auditVisible, setAuditVisible] = useState(false);
  const [connected, setConnected] = useState(false);
  const [ledgerLoaded, setLedgerLoaded] = useState(false);
  const [ledgerSearchKeyword, setLedgerSearchKeyword] = useState<string>('');

  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };
    window.addEventListener('auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
  }, [logout]);

  useEffect(() => {
    if (isAuthenticated) {
      checkHealth();
      const timer = setInterval(checkHealth, 30_000);
      return () => clearInterval(timer);
    }
  }, [isAuthenticated]);

  async function checkHealth() {
    try {
      const data = await getHealth();
      setConnected(true);
      setLedgerLoaded(data.ledger_loaded);
    } catch {
      setConnected(false);
      setLedgerLoaded(false);
    }
  }

  if (!isAuthenticated) {
    return <LoginPanel />;
  }

  const centralMenuItems = [
    { key: 'dashboard', icon: <TableOutlined />, label: '数据看板' },
    { key: 'graph', icon: <ProfileOutlined />, label: '关系图谱' },
    { key: 'ledger', icon: <TableOutlined />, label: '台账预览' },
  ];

  const menuItems = centralMenuItems;

  const panels: Record<string, React.ReactNode> = {
    dashboard: <DashboardPanel />,
    ledger: <LedgerPanel initialSearchKeyword={ledgerSearchKeyword} />,
    graph: <GraphPanel onNodeClick={(nodeId) => {
      setLedgerSearchKeyword(nodeId);
      setActivePanel('ledger');
    }} />,
    settings: user?.role === 'admin' ? <SettingsPanel onSaved={checkHealth} /> : <div>权限不足</div>,
  };

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      {/* Block 1: Brand / Logo (Top Left Independent Pill) */}
      <div
        className="glass-panel"
        style={{
          position: 'fixed',
          top: 24,
          left: 32,
          height: 56,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          borderRadius: 28,
          gap: 12,
        }}
      >
        <img
          src="/logo.jpg"
          alt="ContracAI Logo"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            boxShadow: '0 0 12px rgba(0, 229, 255, 0.5)',
            objectFit: 'cover'
          }}
        />
        <Text style={{ fontWeight: 700, fontSize: 18, color: '#fff', letterSpacing: '0.5px' }}>
          Contrac<span style={{ color: 'var(--neon-cyan)' }}>AI</span>
        </Text>
      </div>

      {/* Block 2: Central Navigation (Top Center Independent Pill) */}
      <div
        className="glass-panel"
        style={{
          position: 'fixed',
          top: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          height: 56,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          borderRadius: 28,
        }}
      >
        <Menu
          mode="horizontal"
          selectedKeys={[activePanel]}
          onClick={(e) => setActivePanel(e.key)}
          items={menuItems}
          style={{
            borderBottom: 'none',
            lineHeight: '56px',
            minWidth: 350,
            justifyContent: 'center'
          }}
        />
      </div>

      {/* Block 3: Right Actions & User Profile (Top Right Independent Pill) */}
      <div
        className="glass-panel"
        style={{
          position: 'fixed',
          top: 24,
          right: 32,
          height: 56,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px 0 16px',
          borderRadius: 28,
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: connected && ledgerLoaded ? '#00FFA3' : '#FF4081',
              boxShadow: `0 0 8px ${connected && ledgerLoaded ? '#00FFA3' : '#FF4081'}`,
            }}
          />
        </div>

        <Dropdown
          menu={{
            items: [
              ...(user?.role === 'admin' ? [{
                key: 'settings',
                icon: <SettingOutlined />,
                label: '系统设置',
                onClick: () => setActivePanel('settings'),
              }, {
                key: 'audit',
                icon: <ProfileOutlined />,
                label: '操作审计日志',
                onClick: () => setAuditVisible(true),
              }, { type: 'divider' as const }] : []),
              {
                key: 'uploadAvatar',
                icon: <UploadOutlined />,
                label: (
                  <Upload
                    showUploadList={false}
                    beforeUpload={async (file) => {
                      if (file.size > 2 * 1024 * 1024) {
                        message.error('头像图片必须小于 2MB！');
                        return false;
                      }
                      try {
                        const res = await uploadAvatar(file);
                        updateUser({ ...user!, avatar: res.avatar });
                        message.success('头像更新成功！');
                      } catch (err: any) {
                        message.error(err.message || '上传失败');
                      }
                      return false;
                    }}
                  >
                    <span>修改头像</span>
                  </Upload>
                ),
              },
              { type: 'divider' as const },
              {
                key: 'logout',
                icon: <LogoutOutlined />,
                label: '退出登录',
                onClick: logout,
                danger: true,
              },
            ],
          }}
          placement="bottomRight"
        >
          <Button
            type="text"
            style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff', padding: '4px 12px', borderRadius: 20 }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                overflow: 'hidden',
              }}
            >
              {user?.avatar ? <img src={user.avatar} alt="avatar" style={{width:'100%',height:'100%',objectFit:'cover'}} /> : <UserOutlined />}
            </div>
            <span style={{ fontWeight: 500 }}>{user?.username}</span>
          </Button>
        </Dropdown>
      </div>

      {/* Main Content Area */}
      <Content
        style={{
          marginTop: 104, // Space for floating pills (24 + 56 + 24)
          padding: '0 32px 32px 32px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {panels[activePanel]}
      </Content>

      <AuditLogDrawer visible={auditVisible} onClose={() => setAuditVisible(false)} />
    </Layout>
  );
}
