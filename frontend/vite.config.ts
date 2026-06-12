import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Vite 构建配置
 *
 * - 开发模式下将 /api 请求代理到 FastAPI 后端 (端口 18920)
 * - 生产构建输出到 dist 目录，供 FastAPI 静态托管
 */
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // 生产环境使用相对路径，便于 FastAPI 静态托管
  base: mode === 'production' ? './' : '/',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 3000,
    // 开发环境下代理 API 请求到 FastAPI 后端
    proxy: mode === 'development' ? {
      '/api': {
        target: 'http://127.0.0.1:18920',
        changeOrigin: true,
      },
    } : undefined,
  },
}));
