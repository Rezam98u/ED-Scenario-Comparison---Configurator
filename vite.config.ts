import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        // FastAPI backend (server-py/, port 8000). Use http://localhost:4000 for the Express backend (server/).
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
