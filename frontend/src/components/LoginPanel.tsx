import { useState } from 'react';
import { Form, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPanel() {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async (values: any) => {
    setLoading(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        const data = await response.json();
        login(data.access_token, data.user);
        message.success(`欢迎回来, ${data.user.username}`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        message.error(errorData.detail || '登录失败，请检查用户名或密码');
      }
    } catch (err) {
      message.error('无法连接到服务器');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
      }}
    >
      <div
        className="glass-card stagger-item"
        style={{
          width: 400,
          padding: '40px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-button)',
            background: 'var(--color-brand)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}
        >
          <span
            style={{
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: 24,
              fontFamily: 'var(--font-heading)',
            }}
          >
            C
          </span>
        </div>
        
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--color-ink)',
            marginBottom: 8,
            fontFamily: 'var(--font-heading)',
          }}
        >
          ContracAI
        </h1>
        <p style={{ color: 'var(--color-ink-tertiary)', marginBottom: 32, fontSize: 13 }}>
          采购合同台账智能管理系统
        </p>

        <Form
          name="login"
          onFinish={handleLogin}
          style={{ width: '100%' }}
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>

          <Form.Item style={{ marginTop: 24, marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              style={{ fontWeight: 500 }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}
