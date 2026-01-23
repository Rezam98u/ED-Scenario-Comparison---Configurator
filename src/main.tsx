import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Initialize MSW in development
if (import.meta.env.MODE === 'development') {
  import('./mocks/browser').catch(() => {
    // MSW initialization failed, app will use fallback data
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
