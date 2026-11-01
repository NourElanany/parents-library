import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/parents-library/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    target: 'esnext',
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
})
