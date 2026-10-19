import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        // FastAPI backend (server-py/, port 8000). Set this to http://localhost:4000
        // to use Express (server/), but Express has no POST /api/energy/calculate,
        // so the dashboard's scenario calculation only works with FastAPI.
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
