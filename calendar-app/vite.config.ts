import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/calendar/',
  server: {
    port: 5174,
    proxy: {
      '/auth':    { target: 'http://localhost:8001', changeOrigin: true },
      '/tasks':   { target: 'http://localhost:8001', changeOrigin: true },
      '/gcal':    { target: 'http://localhost:8001', changeOrigin: true },
      '/healthz': { target: 'http://localhost:8001', changeOrigin: true },
    },
  },
})
