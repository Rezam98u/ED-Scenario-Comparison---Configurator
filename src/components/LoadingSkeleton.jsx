const SKELETON_BAR_HEIGHTS = [
  55, 72, 40, 80, 65, 30, 50, 75, 45, 60,
  35, 70, 55, 42, 68, 78, 33, 58, 47, 63,
  38, 72, 50, 44
]

export function LoadingSkeleton({ className = '', style }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded ${className}`} style={style}>
      <div className="h-full w-full bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 bg-[length:200%_100%] animate-shimmer rounded"></div>
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <div className="mb-4">
        <LoadingSkeleton className="h-6 w-48 mb-2" />
        <LoadingSkeleton className="h-4 w-32" />
      </div>
      <div className="h-80 flex items-end justify-between space-x-1">
        {SKELETON_BAR_HEIGHTS.map((height, i) => (
          <LoadingSkeleton key={i} className="w-full" style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  )
}

export function KpiCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <LoadingSkeleton className="h-4 w-24 mb-2" />
      <LoadingSkeleton className="h-8 w-16 mb-1" />
      <LoadingSkeleton className="h-3 w-12" />
    </div>
  )
}
