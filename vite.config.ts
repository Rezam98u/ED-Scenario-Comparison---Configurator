import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        // FastAPI backend (server-py/, port 8000). Same API as the Express
        // backend in server/, so set this back to http://localhost:4000 to use Express.
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
