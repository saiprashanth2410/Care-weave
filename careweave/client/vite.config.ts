import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: true,
    proxy: { '/api': 'http://localhost:4000' },
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
