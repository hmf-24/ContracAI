import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import App from './App';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';

dayjs.locale('zh-cn');

/**
 * Ant Design 5 主题定制
 * 基于 Marisync 科幻风 Glassmorphism 规范
 * 深邃暗黑 + 荧光青(Cyan)点缀
 */
const antdTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    // 品牌色 — 核心强调色 (荧光青)
    colorPrimary: '#00E5FF',
    colorPrimaryHover: '#18FFFF',
    colorPrimaryActive: '#00B8D4',

    // 功能色（高饱和度发光）
    colorSuccess: '#00FFA3', // 荧光绿
    colorWarning: '#FFD740', // 荧光黄
    colorError: '#FF4081',   // 霓虹粉
    colorInfo: '#2979FF',    // 科技蓝

    // 中性色（深色背景体系）
    colorText: '#FFFFFF',
    colorTextHeading: '#E0F7FA',
    colorTextSecondary: 'rgba(255, 255, 255, 0.65)',
    colorTextTertiary: 'rgba(255, 255, 255, 0.45)',
    colorTextQuaternary: 'rgba(255, 255, 255, 0.25)',
    colorBgContainer: 'rgba(255, 255, 255, 0.02)',
    colorBgLayout: 'transparent',
    colorBgElevated: 'rgba(10, 20, 45, 0.85)',
    colorBorder: 'rgba(255, 255, 255, 0.08)',
    colorBorderSecondary: 'rgba(255, 255, 255, 0.04)',

    // 字体
    fontFamily: "var(--font-sans)",
    fontSize: 14,

    // 圆角
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 4,

    // 阴影
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
    boxShadowSecondary: '0 0 16px rgba(0, 229, 255, 0.1)',

    controlHeight: 36,
  },
  components: {
    Button: {
      colorPrimary: '#00E5FF',
      colorPrimaryHover: '#18FFFF',
      colorPrimaryActive: '#00B8D4',
      defaultBg: 'rgba(255,255,255,0.05)',
      defaultBorderColor: 'rgba(255,255,255,0.1)',
      defaultHoverBg: 'rgba(255,255,255,0.1)',
      defaultHoverBorderColor: 'rgba(255,255,255,0.2)',
      defaultHoverColor: '#FFFFFF',
      defaultColor: 'rgba(255,255,255,0.85)',
    },
    Input: {
      colorBgContainer: 'rgba(0, 0, 0, 0.2)',
      colorBorder: 'rgba(255, 255, 255, 0.1)',
      hoverBorderColor: '#00E5FF',
      activeBorderColor: '#00E5FF',
      activeShadow: '0 0 0 2px rgba(0, 229, 255, 0.2)',
    },
    Select: {
      colorBgContainer: 'rgba(0, 0, 0, 0.2)',
      colorBorder: 'rgba(255, 255, 255, 0.1)',
      hoverBorderColor: '#00E5FF',
      activeBorderColor: '#00E5FF',
      activeShadow: '0 0 0 2px rgba(0, 229, 255, 0.2)',
      optionSelectedBg: 'rgba(0, 229, 255, 0.2)',
    },
    Card: {
      paddingLG: 24,
      colorBgContainer: 'rgba(255,255,255,0.02)',
    },
    Menu: {
      itemBorderRadius: 20,
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemHoverBg: 'rgba(255, 255, 255, 0.1)',
      itemSelectedBg: '#00E5FF',
      itemSelectedColor: '#000000',
    },
    Modal: {
      contentBg: 'rgba(10, 20, 45, 0.95)',
      headerBg: 'transparent',
    },
    Drawer: {
      colorBgElevated: 'rgba(10, 20, 45, 0.95)',
    },
    Table: {
      headerBg: 'rgba(255, 255, 255, 0.05)',
      headerColor: 'rgba(255, 255, 255, 0.85)',
      colorBgContainer: 'transparent',
      rowHoverBg: 'rgba(255, 255, 255, 0.03)',
    },
  },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ConfigProvider locale={zhCN} theme={antdTheme}>
        <App />
      </ConfigProvider>
    </AuthProvider>
  </React.StrictMode>
);
