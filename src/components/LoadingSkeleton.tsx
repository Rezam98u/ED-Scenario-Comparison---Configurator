interface LoadingSkeletonProps {
  className?: string
  style?: React.CSSProperties
}

export function LoadingSkeleton({ className = '', style }: LoadingSkeletonProps) {
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
        {Array.from({ length: 24 }).map((_, i) => (
          <LoadingSkeleton 
            key={i} 
            className="w-full"
            style={{ height: `${Math.random() * 60 + 20}%` }}
          />
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
