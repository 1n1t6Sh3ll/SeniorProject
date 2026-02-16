import Icon from './Icon';

const TIERS = [
    { tier: 1, name: 'Bronze', color: '#cd7f32', bonus: '0%', required: 0, label: 'Default' },
    { tier: 2, name: 'Silver', color: '#c0c0c0', bonus: '+5%', required: 3, label: '3 repayments' },
    { tier: 3, name: 'Gold', color: '#f0a500', bonus: '+10%', required: 10, label: '10 repayments' },
];

export default function CreditTierRoadmap({ currentTier = 1, repayments = 0 }) {
    return (
        <div className="tier-roadmap">
            <div className="tier-roadmap-header">
                <h3 className="card-title" style={{ marginBottom: 0 }}>Credit Tier Roadmap</h3>
                <span className="text-sm text-muted">{repayments} successful repayments</span>
            </div>
            <div className="tier-roadmap-track">
                {TIERS.map((t, i) => {
                    const isActive = currentTier === t.tier;
                    const isCompleted = currentTier > t.tier;
                    const isLocked = currentTier < t.tier;
                    const repaymentsToNext = isActive && i < TIERS.length - 1
                        ? Math.max(0, TIERS[i + 1].required - repayments)
                        : 0;

                    return (
                        <div key={t.tier} className="tier-roadmap-step">
                            {i > 0 && (
                                <div
                                    className="tier-connector"
                                    style={{ background: isCompleted || isActive ? 'var(--success)' : 'var(--border)' }}
                                />
                            )}
                            <div
                                className={`tier-node ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isLocked ? 'locked' : ''}`}
                                style={{ borderColor: isActive ? t.color : isCompleted ? 'var(--success)' : 'var(--border)' }}
                            >
                                <div className="tier-node-icon" style={{ color: isLocked ? 'var(--text-tertiary)' : t.color }}>
                                    {isCompleted
                                        ? <Icon name="check" size={20} style={{ color: 'var(--success)' }} />
                                        : <Icon name="shield" size={20} />
                                    }
                                </div>
                                <div className="tier-node-name">{t.name}</div>
                                <div className="tier-node-bonus" style={{ color: t.color }}>LTV {t.bonus}</div>
                                <div className="tier-node-req">
                                    {isActive && i < TIERS.length - 1
                                        ? `${repaymentsToNext} more to next`
                                        : isCompleted
                                            ? 'Completed'
                                            : isActive
                                                ? 'Current Tier'
                                                : t.label
                                    }
                                </div>
                                {isActive && (
                                    <div className="tier-current-badge">Current</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
