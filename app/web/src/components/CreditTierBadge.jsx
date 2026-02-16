import Icon from './Icon';

export default function CreditTierBadge({ tier, repayments }) {
    const tierInfo = {
        1: { name: 'Bronze', color: '#cd7f32', ltvBonus: '0%', required: 0, next: 3 },
        2: { name: 'Silver', color: '#c0c0c0', ltvBonus: '+5%', required: 3, next: 10 },
        3: { name: 'Gold', color: '#f0a500', ltvBonus: '+10%', required: 10, next: null }
    };

    const info = tierInfo[tier] || tierInfo[1];
    const progress = info.next ? Math.min((repayments / info.next) * 100, 100) : 100;

    return (
        <div>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-lg)',
                marginBottom: 'var(--spacing-lg)',
                padding: 'var(--spacing-lg)',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)'
            }}>
                <div style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-primary)',
                    border: `2px solid ${info.color}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                }}>
                    <Icon name="shield" size={24} style={{ color: info.color }} />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{
                        fontSize: '1.25rem',
                        fontWeight: '700',
                        marginBottom: '0.25rem'
                    }}>
                        Tier {tier} - {info.name}
                    </div>
                    <div style={{
                        display: 'flex',
                        gap: 'var(--spacing-md)',
                        fontSize: '0.82rem'
                    }}>
                        <span className="badge badge-info">
                            LTV Bonus: {info.ltvBonus}
                        </span>
                        <span className="badge badge-success">
                            {repayments} Repayments
                        </span>
                    </div>
                </div>
            </div>

            {info.next && (
                <div>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 'var(--spacing-sm)',
                        fontSize: '0.82rem'
                    }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>
                            Progress to Tier {tier + 1}
                        </span>
                        <span className="mono" style={{ color: 'var(--primary)', fontWeight: '600' }}>
                            {repayments} / {info.next}
                        </span>
                    </div>

                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                    </div>

                    <p style={{
                        marginTop: 'var(--spacing-md)',
                        fontSize: '0.82rem',
                        color: 'var(--text-secondary)',
                        padding: 'var(--spacing-md)',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-md)',
                        borderLeft: '2px solid var(--primary)'
                    }}>
                        <strong style={{ color: 'var(--text-primary)' }}>
                            {info.next - repayments} more {info.next - repayments === 1 ? 'repayment' : 'repayments'}
                        </strong> to unlock Tier {tier + 1} with {tierInfo[tier + 1].ltvBonus} LTV bonus
                    </p>
                </div>
            )}

            {tier === 3 && (
                <div className="info-box success">
                    <strong>Maximum Tier Achieved</strong>
                    <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                        You have unlocked the best borrowing terms available. Enjoy your +10% LTV bonus.
                    </p>
                </div>
            )}
        </div>
    );
}
