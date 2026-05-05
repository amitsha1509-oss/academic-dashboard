import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/tasks':       { target: 'http://localhost:8001', changeOrigin: true },
      '/categories':  { target: 'http://localhost:8001', changeOrigin: true },
      '/patterns':    { target: 'http://localhost:8001', changeOrigin: true },
      '/feedback':    { target: 'http://localhost:8001', changeOrigin: true },
      '/admin':       { target: 'http://localhost:8001', changeOrigin: true },
      '/auth':        { target: 'http://localhost:8001', changeOrigin: true },
      '/me':          { target: 'http://localhost:8001', changeOrigin: true },
      '/context':     { target: 'http://localhost:8001', changeOrigin: true },
      '/healthz':     { target: 'http://localhost:8001', changeOrigin: true },
    },
  },
})
