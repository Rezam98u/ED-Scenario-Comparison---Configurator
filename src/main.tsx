import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Initialize MSW in development
if (import.meta.env.MODE === 'development') {
  console.log('Initializing MSW in development mode...')
  import('./mocks/browser').then(() => {
    console.log('MSW imported successfully')
  }).catch((error) => {
    console.error('Failed to import MSW:', error)
  })
}

// Render the app immediately
console.log('Rendering React app...')
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
