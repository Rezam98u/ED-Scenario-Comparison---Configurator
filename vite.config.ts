import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Vite uses the first matching key, so /api/chat must come before /api
    proxy: {
      '/api/chat': {
        // AI agent (feature/ai-agent-integration) only exists in Express (server/, port 4000)
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/api': {
        // Everything else goes to FastAPI (server-py/, port 8000). Express has no
        // POST /api/energy/calculate or GET /api/energy/analysis.
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
