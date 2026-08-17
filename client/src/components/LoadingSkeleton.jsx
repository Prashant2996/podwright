export function LoadingSkeleton({ rows = 5 }) {
  return (
    <div className="card p-4 animate-pulse">
      <div className="space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-4 bg-gray-700 rounded" style={{ width: `${20 + Math.random() * 30}%` }} />
            <div className="h-4 bg-gray-700 rounded" style={{ width: `${10 + Math.random() * 20}%` }} />
            <div className="h-4 bg-gray-700 rounded" style={{ width: `${15 + Math.random() * 15}%` }} />
            <div className="h-4 bg-gray-700 rounded" style={{ width: `${10 + Math.random() * 10}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoadingCards({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4">
          <div className="h-4 bg-gray-700 rounded w-1/2 mb-3" />
          <div className="h-8 bg-gray-700 rounded w-1/3 mb-2" />
          <div className="h-3 bg-gray-700 rounded w-2/3" />
        </div>
      ))}
    </div>
  );
}

export default LoadingSkeleton;
