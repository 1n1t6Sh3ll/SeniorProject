import { useState } from 'react';

const glossary = [
    { term: 'Borrow', definition: 'Take out a loan in USDX stablecoin using your deposited collateral. The amount you can borrow depends on your collateral value and credit tier.' },
    { term: 'Collateral', definition: 'Assets (ETH or WBTC) you deposit into the protocol to back your loans. Acts as a security deposit that can be claimed if you fail to repay.' },
    { term: 'Credit Tier', definition: 'Your reputation score in the protocol. Tier 1 (default), Tier 2 (+5% LTV after 3 repayments), Tier 3 (+10% LTV after 10 repayments). Higher tiers let you borrow more.' },
    { term: 'Health Factor', definition: 'A safety score for your position. Above 1.0 means safe. Below 1.0 means your position can be liquidated. Calculated as (collateral value × liquidation threshold) / debt.' },
    { term: 'Liquidation', definition: 'When your health factor drops below 1.0, anyone can repay your debt and receive your collateral plus a 5% bonus. This mechanism keeps the protocol solvent.' },
    { term: 'Liquidation Bonus', definition: 'A 5% incentive paid to liquidators. When someone liquidates an unhealthy position, they receive the collateral value plus this bonus.' },
    { term: 'Liquidation Price', definition: 'The asset price at which your position becomes liquidatable. If ETH or WBTC drops to this price, your health factor hits 1.0.' },
    { term: 'LTV (Loan-to-Value)', definition: 'The maximum percentage of your collateral value you can borrow. ETH base LTV is 60%, WBTC is 65%. Higher credit tiers add bonuses.' },
    { term: 'Repay', definition: 'Return borrowed USDX to reduce or eliminate your debt. Successful full repayments count toward credit tier upgrades.' },
    { term: 'USDX', definition: 'The protocol\'s stablecoin pegged to $1 USD. Minted when you borrow and burned when you repay. Can be sent to other users.' },
    { term: 'WBTC (Wrapped Bitcoin)', definition: 'An ERC-20 token that represents Bitcoin on Ethereum. Used as collateral in this protocol with a 65% LTV ratio.' },
    { term: 'Withdraw', definition: 'Remove collateral from the protocol. Only allowed if your remaining health factor stays above 1.0 after withdrawal.' },
];

export default function GlossaryPanel() {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filtered = glossary.filter(g =>
        g.term.toLowerCase().includes(search.toLowerCase()) ||
        g.definition.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <>
            <button
                className="glossary-fab"
                onClick={() => setOpen(!open)}
                title="Help & Glossary"
            >
                ?
            </button>

            {open && <div className="glossary-backdrop" onClick={() => setOpen(false)} />}

            <div className={`glossary-panel ${open ? 'open' : ''}`}>
                <div className="glossary-header">
                    <div>
                        <div className="font-bold" style={{ fontSize: '1rem' }}>DeFi Glossary</div>
                        <div className="text-xs text-muted">Learn key terms</div>
                    </div>
                    <button
                        onClick={() => setOpen(false)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.5rem' }}
                    >
                        &times;
                    </button>
                </div>

                <div style={{ padding: '0 var(--spacing-md) var(--spacing-md)' }}>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Search terms..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ fontSize: '0.85rem' }}
                    />
                </div>

                <div className="glossary-list">
                    {filtered.map(g => (
                        <div key={g.term} className="glossary-item">
                            <div className="glossary-term">{g.term}</div>
                            <div className="glossary-def">{g.definition}</div>
                        </div>
                    ))}
                    {filtered.length === 0 && (
                        <div className="text-muted text-sm" style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
                            No matching terms found
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
