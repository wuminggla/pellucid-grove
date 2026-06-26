import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// pellucid-grove · 部署目标说明
// - 开发: 本地 pnpm dev 跑 localhost:5173 (base='/')
// - 生产: GitHub Pages + jsdelivr CDN, 仓库名 pellucid-grove
//        → 部署到 https://<user>.github.io/pellucid-grove/
//        → jsdelivr URL: https://cdn.jsdelivr.net/gh/<user>/pellucid-grove@<ver>/dist/...
// base 必须改 '/pellucid-grove/' 让生产构建的资源 URL 相对正确
//
// VITE_BASE 环境变量允许 GitHub Actions 部署时覆盖(便于改仓库名或自部署到根)

export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE ?? (mode === 'production' ? '/pellucid-grove/' : '/'),
  plugins: [react()],
  build: {
    // jsdelivr/iframe 加载场景: 资源相对路径就行,不需要绝对 host
    assetsInlineLimit: 4096, // 小资源内联(避免 iframe 多请求)
  },
}))
