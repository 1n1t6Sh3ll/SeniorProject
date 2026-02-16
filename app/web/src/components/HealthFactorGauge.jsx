export default function HealthFactorGauge({ value, healthFactor }) {
    const hf = value ?? healthFactor ?? 0;
    const numericHf = typeof hf === 'object' ? parseFloat(hf.toString()) / 1e18 : parseFloat(hf);
    const displayValue = isNaN(numericHf) || numericHf > 999 ? 999 : numericHf;

    const getHealthStatus = (v) => {
        if (v >= 1.5) return { status: 'safe', label: 'Healthy', color: 'var(--success)' };
        if (v >= 1.2) return { status: 'warning', label: 'Caution', color: 'var(--warning)' };
        return { status: 'danger', label: 'At Risk', color: 'var(--danger)' };
    };

    const { status, label, color } = getHealthStatus(displayValue);

    return (
        <div className="health-factor-container">
            <div className={`health-factor ${status}`}>
                <div className={`health-indicator ${status}`}>
                    {displayValue >= 999 ? '\u221E' : displayValue.toFixed(1)}
                </div>
                <div style={{ flex: 1 }}>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                        Health Factor
                    </div>
                    <div className="mono" style={{ fontSize: '2rem', fontWeight: '800', color, lineHeight: 1 }}>
                        {displayValue >= 999 ? '\u221E' : displayValue.toFixed(2)}
                    </div>
                    <div style={{
                        marginTop: '6px',
                        width: '60px',
                        height: '2px',
                        background: color,
                        borderRadius: '1px'
                    }} />
                    <div style={{
                        marginTop: '6px',
                        fontSize: '0.78rem',
                        fontWeight: '600',
                        color
                    }}>
                        {label}
                    </div>
                </div>
            </div>

            <div style={{
                marginTop: 'var(--spacing-md)',
                padding: '10px 14px',
                background: 'var(--bg-primary)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.78rem',
                lineHeight: '2'
            }}>
                <div className="flex justify-between">
                    <span style={{ color: 'var(--text-tertiary)' }}>Safe Zone</span>
                    <span className="mono" style={{ color: 'var(--success)', fontWeight: '700' }}>&gt; 1.5</span>
                </div>
                <div className="flex justify-between">
                    <span style={{ color: 'var(--text-tertiary)' }}>Warning Zone</span>
                    <span className="mono" style={{ color: 'var(--warning)', fontWeight: '700' }}>1.2 - 1.5</span>
                </div>
                <div className="flex justify-between">
                    <span style={{ color: 'var(--text-tertiary)' }}>Liquidation Risk</span>
                    <span className="mono" style={{ color: 'var(--danger)', fontWeight: '700' }}>&lt; 1.0</span>
                </div>
            </div>
        </div>
    );
}
