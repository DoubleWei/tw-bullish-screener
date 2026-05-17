import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  // 對應 GitHub Pages project page URL
  base: '/tw-bullish-screener/',
  plugins: [react(), tailwindcss()],
  // dev 模式從 dev-public 提供 fixture JSON；build 模式不複製任何東西（data/ 由 Actions 管理）
  publicDir: mode === 'development' ? 'dev-public' : false,
  build: {
    outDir: '../public',
    emptyOutDir: false,  // 不清空 public/data/
  },
}))
