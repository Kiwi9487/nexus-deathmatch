import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  preview: { port: 4173, strictPort: true, allowedHosts: true },
  build: { target: 'esnext' },
})
