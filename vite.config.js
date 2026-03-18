import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const defaultBase =
  process.env.GITHUB_ACTIONS === 'true' && repoName ? `/${repoName}/` : '/'

export default defineConfig({
  base: process.env.VITE_BASE_PATH || defaultBase,
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/ai': {
        target: process.env.VITE_DEV_AI_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai/, ''),
      },
    },
  }
})
