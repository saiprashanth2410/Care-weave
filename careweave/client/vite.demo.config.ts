import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'
const root = '/Users/sai/Desktop/hacktober fest/careweave/client'
export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  server: { port: 5300, strictPort: true, allowedHosts: true, proxy: { '/api': 'http://localhost:4100' } },
  resolve: { alias: { '@': path.resolve(root, 'src') } },
})
