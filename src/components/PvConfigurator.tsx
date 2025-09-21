import { useState } from 'react'

interface PvConfiguratorProps {
  currentPvKw: number
  onApply: (pvKw: number) => void
  isLoading?: boolean
  className?: string
}

export function PvConfigurator({ 
  currentPvKw, 
  onApply, 
  isLoading = false,
  className = '' 
}: PvConfiguratorProps) {
  const [pvKw, setPvKw] = useState(currentPvKw)

  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPvKw(Number(event.target.value))
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value)
    if (!isNaN(value) && value >= 0 && value <= 100) {
      setPvKw(value)
    }
  }

  const handleApply = () => {
    onApply(pvKw)
  }

  const hasChanges = pvKw !== currentPvKw

  return (
    <div className={`bg-white rounded-lg shadow-sm border p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        PV Configuration
      </h3>
      
      <div className="space-y-4">
        <div>
          <label htmlFor="pv-capacity" className="block text-sm font-medium text-gray-700 mb-2">
            PV Capacity (kW)
          </label>
          <div className="flex items-center space-x-4">
            <input
              id="pv-capacity-slider"
              type="range"
              min="0"
              max="100"
              step="0.5"
              value={pvKw}
              onChange={handleSliderChange}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            />
            <input
              id="pv-capacity"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={pvKw}
              onChange={handleInputChange}
              className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Current: {currentPvKw} kW
          </div>
        </div>

        <button
          onClick={handleApply}
          disabled={!hasChanges || isLoading}
          className={`w-full py-2 px-4 rounded-md font-medium transition-colors ${
            hasChanges && !isLoading
              ? 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isLoading ? 'Applying...' : 'Apply Changes'}
        </button>

        {hasChanges && (
          <div className="text-sm text-blue-600">
            Changes pending: {pvKw > currentPvKw ? '+' : ''}{(pvKw - currentPvKw).toFixed(1)} kW
          </div>
        )}
      </div>
    </div>
  )
}
