import { useState } from 'react'

function App() {
  console.log('App component is rendering')
  
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-4xl font-bold text-center text-blue-600 mb-8">
        🔋 Energy Dashboard Debug
      </h1>
      
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-semibold mb-4">Debug Information</h2>
        
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded p-4">
            <h3 className="font-medium text-green-800">✅ React is working</h3>
            <p className="text-green-700">If you can see this, React is rendering correctly.</p>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded p-4">
            <h3 className="font-medium text-blue-800">🎨 Tailwind CSS is working</h3>
            <p className="text-blue-700">If this looks styled, Tailwind CSS is loaded.</p>
          </div>
          
          <div className="bg-purple-50 border border-purple-200 rounded p-4">
            <h3 className="font-medium text-purple-800">⚡ Vite is working</h3>
            <p className="text-purple-700">Environment: {import.meta.env.MODE}</p>
          </div>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
            <h3 className="font-medium text-yellow-800">🔧 Next Steps</h3>
            <p className="text-yellow-700">
              Check the browser console for any JavaScript errors.
              If you see this page, the basic setup is working.
            </p>
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-gray-50 rounded">
          <button 
            onClick={() => console.log('Button clicked')}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            Test Button (check console)
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
