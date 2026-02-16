import { getScoreLabel, getScoreColor } from '../utils/creditScore';

export default function CreditScoreGauge({ score, breakdown, size = 'md' }) {
    const label = getScoreLabel(score);
    const color = getScoreColor(score);

    const sizes = { sm: 120, md: 180, lg: 240 };
    const dim = sizes[size] || sizes.md;
    const strokeWidth = size === 'sm' ? 8 : size === 'lg' ? 14 : 10;
    const radius = (dim - strokeWidth) / 2;
    const cx = dim / 2;
    const cy = dim / 2;

    // Semi-circle arc (180 degrees, from left to right)
    const startAngle = Math.PI;
    const endAngle = 0;
    const totalArc = Math.PI;

    // Normalize score to 0-1 range (300-850)
    const normalized = Math.max(0, Math.min(1, (score - 300) / 550));
    const sweepAngle = totalArc * normalized;

    // Arc path helpers
    const polarToCartesian = (angle) => ({
        x: cx + radius * Math.cos(angle),
        y: cy - radius * Math.sin(angle),
    });

    const start = polarToCartesian(startAngle);
    const bgEnd = polarToCartesian(endAngle);
    const fillEnd = polarToCartesian(startAngle - sweepAngle);

    const bgArc = `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${bgEnd.x} ${bgEnd.y}`;
    const fillArc = sweepAngle > 0
        ? `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${sweepAngle > Math.PI / 2 ? 1 : 0} 1 ${fillEnd.x} ${fillEnd.y}`
        : '';

    const fontSize = size === 'sm' ? '1.5rem' : size === 'lg' ? '2.5rem' : '2rem';
    const labelSize = size === 'sm' ? '0.65rem' : size === 'lg' ? '0.9rem' : '0.75rem';

    return (
        <div className="credit-score-gauge">
            <svg width={dim} height={dim * 0.6 + 10} viewBox={`0 ${dim * 0.15} ${dim} ${dim * 0.6}`}>
                {/* Background arc */}
                <path d={bgArc} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} strokeLinecap="round" />
                {/* Filled arc */}
                {fillArc && (
                    <path d={fillArc} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
                        style={{ filter: `drop-shadow(0 0 6px ${color}40)` }} />
                )}
            </svg>
            <div className="credit-score-value" style={{ marginTop: -(dim * 0.25) }}>
                <div className="mono font-bold" style={{ fontSize, color, lineHeight: 1 }}>{score}</div>
                <div style={{ fontSize: labelSize, color, fontWeight: 600, marginTop: 4 }}>{label}</div>
            </div>

            {breakdown && size !== 'sm' && (
                <div className="credit-score-breakdown">
                    {Object.values(breakdown).map((factor, i) => (
                        <div key={i} className="score-factor">
                            <div className="flex justify-between text-xs mb-xs">
                                <span className="text-muted">{factor.label}</span>
                                <span className="mono" style={{ color: factor.score >= 0.7 ? 'var(--success)' : factor.score >= 0.4 ? 'var(--warning)' : 'var(--danger)' }}>
                                    {Math.round(factor.score * 100)}%
                                </span>
                            </div>
                            <div className="score-factor-bar">
                                <div className="score-factor-fill" style={{
                                    width: `${factor.score * 100}%`,
                                    background: factor.score >= 0.7 ? 'var(--success)' : factor.score >= 0.4 ? 'var(--warning)' : 'var(--danger)',
                                }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
