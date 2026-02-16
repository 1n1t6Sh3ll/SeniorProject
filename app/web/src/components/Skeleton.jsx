export function SkeletonText({ width = '100%', height = 14 }) {
    return (
        <div
            className="skeleton skeleton-text"
            style={{ width, height }}
        />
    );
}

export function SkeletonCard({ height = 200 }) {
    return (
        <div
            className="skeleton skeleton-card"
            style={{ height }}
        />
    );
}

export function SkeletonDashboard() {
    return (
        <div className="page-container">
            <div style={{ marginBottom: 'var(--spacing-xl)' }}>
                <SkeletonText width="200px" height={28} />
                <SkeletonText width="300px" height={14} />
            </div>
            <div className="dashboard-grid">
                <SkeletonCard height={280} />
                <SkeletonCard height={280} />
            </div>
            <div className="grid grid-3" style={{ marginTop: 'var(--spacing-lg)' }}>
                <SkeletonCard height={140} />
                <SkeletonCard height={140} />
                <SkeletonCard height={140} />
            </div>
        </div>
    );
}
