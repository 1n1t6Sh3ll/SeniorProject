import { useState, useRef, useEffect } from 'react';

const definitions = {
    healthFactor: {
        title: 'Health Factor',
        description: 'A numeric representation of the safety of your collateral vs. your debt. Above 1.0 is safe; below 1.0 means your position can be liquidated. Keep it above 1.5 for a safety buffer.',
    },
    ltv: {
        title: 'Loan-to-Value (LTV)',
        description: 'The maximum percentage of your collateral value that you can borrow. Higher credit tiers unlock higher LTV ratios.',
    },
    liquidationThreshold: {
        title: 'Liquidation Threshold',
        description: 'The collateral ratio at which your position becomes eligible for liquidation. If your collateral value drops below this ratio relative to debt, anyone can liquidate your position.',
    },
    creditTier: {
        title: 'Credit Tier',
        description: 'Your credit score within the protocol. Tier 1 is default, Tier 2 unlocks after 3 successful repayments (+5% LTV), and Tier 3 after 10 repayments (+10% LTV).',
    },
    collateral: {
        title: 'Collateral',
        description: 'Assets you deposit (ETH or WBTC) to back your loans. If their value drops too low relative to your debt, your position may be liquidated.',
    },
    usdx: {
        title: 'USDX',
        description: 'The protocol\'s stablecoin pegged to $1 USD. Minted when you borrow against your collateral and burned when you repay.',
    },
    liquidation: {
        title: 'Liquidation',
        description: 'When a position\'s health factor drops below 1.0, anyone can repay the debt and claim the collateral plus a bonus. This keeps the protocol solvent.',
    },
    liquidationBonus: {
        title: 'Liquidation Bonus',
        description: 'A 5% bonus that liquidators earn on top of the repaid debt amount as an incentive to maintain protocol health.',
    },
};

export default function Tooltip({ term }) {
    const [show, setShow] = useState(false);
    const [position, setPosition] = useState('above');
    const triggerRef = useRef(null);
    const def = definitions[term];

    useEffect(() => {
        if (show && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPosition(rect.top < 200 ? 'below' : 'above');
        }
    }, [show]);

    if (!def) return null;

    return (
        <span
            className="tooltip-trigger"
            ref={triggerRef}
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
            onClick={() => setShow(!show)}
        >
            <span className="tooltip-icon">?</span>
            {show && (
                <span className={`tooltip-popup tooltip-${position}`}>
                    <span className="tooltip-popup-title">{def.title}</span>
                    <span>{def.description}</span>
                </span>
            )}
        </span>
    );
}
