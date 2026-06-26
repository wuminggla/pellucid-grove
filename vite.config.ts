import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// pellucid-grove · 部署目标说明
// - 开发: 本地 pnpm dev 跑 localhost:5173 (base='/')
// - 生产: 同时兼容 GitHub Pages + jsdelivr CDN 两种加载方式
//   * GitHub Pages: https://<user>.github.io/pellucid-grove/
//   * jsdelivr   : https://cdn.jsdelivr.net/gh/<user>/pellucid-grove@gh-pages/
//
// 关键: 必须用相对路径 base='./',因为两种加载方式的 URL 前缀不同。
//      Vite 在 index.html 里把 <script src="/.../assets/xxx.js"> 改成 src="./assets/xxx.js",
//      浏览器据此相对当前 URL 解析,两种加载方式都对。
//
// VITE_BASE 环境变量允许 Actions 部署时覆盖(高级场景)

export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE ?? (mode === 'production' ? './' : '/'),
  plugins: [react()],
  build: {
    assetsInlineLimit: 4096, // 小资源内联(避免 iframe 多请求)
  },
}))
