export function Skeleton({ width = '100%', height = 14, radius = 6, style }) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />
}

export function SkeletonCard() {
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <Skeleton width="40%" height={11} style={{ marginBottom: 10 }} />
      <Skeleton width="70%" height={20} />
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="member-row">
      <Skeleton width={40} height={40} radius={20} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Skeleton width="55%" height={13} style={{ marginBottom: 6 }} />
        <Skeleton width="35%" height={11} />
      </div>
    </div>
  )
}

// Generic dashboard skeleton: topnav placeholder + a couple of stat cards + a
// few list rows. Used instead of a blank/splash-only screen while a
// dashboard's data is loading.
export function DashboardSkeleton({ rows = 4 }) {
  return (
    <div className="page">
      <div className="topnav">
        <div style={{ width: 64 }} />
        <div style={{ textAlign: 'center' }}>
          <Skeleton width={120} height={16} style={{ margin: '0 auto 6px' }} />
          <Skeleton width={60} height={10} style={{ margin: '0 auto' }} />
        </div>
        <div style={{ width: 64 }} />
      </div>
      <div className="content">
        <SkeletonCard />
        <SkeletonCard />
        <div className="card" style={{ marginTop: 16 }}>
          {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      </div>
    </div>
  )
}
