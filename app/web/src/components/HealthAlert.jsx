import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { ethers } from 'ethers';
import { Link } from 'react-router-dom';
import { getUserPosition, getReadProvider } from '../utils/contracts';
import Icon from './Icon';

export default function HealthAlert() {
    const { address, isConnected } = useWallet();
    const [healthFactor, setHealthFactor] = useState(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (isConnected && address) {
            fetchHealth();
            const interval = setInterval(fetchHealth, 15000);
            return () => clearInterval(interval);
        }
    }, [isConnected, address]);

    const fetchHealth = async () => {
        try {
            const provider = getReadProvider();
            const pos = await getUserPosition(address, provider);
            if (!pos) { setHealthFactor(null); return; }

            const debt = parseFloat(ethers.formatEther(pos.debtAmount || 0n));
            if (debt === 0) { setHealthFactor(null); return; }

            const hfBig = typeof pos.healthFactor === 'bigint' ? pos.healthFactor : BigInt(pos.healthFactor || 0);
            if (hfBig > BigInt('1000000000000000000000')) {
                setHealthFactor(999);
            } else {
                setHealthFactor(parseFloat(ethers.formatEther(hfBig)));
            }
        } catch {
            setHealthFactor(null);
        }
    };

    if (!isConnected || healthFactor === null || healthFactor >= 1.5 || dismissed) return null;

    const isRed = healthFactor < 1.0;

    return (
        <div className={`health-alert-bar ${isRed ? 'health-alert-danger' : 'health-alert-warning'}`}>
            <div className="health-alert-content">
                <Icon name="warning" size={16} />
                <span>
                    Your health factor is <strong>{healthFactor.toFixed(2)}</strong>.
                    {isRed ? ' Your position is at risk of liquidation!' : ' Add collateral or repay debt to stay safe.'}
                </span>
                <Link to="/deposit" className="health-alert-link">Deposit</Link>
                <Link to="/repay" className="health-alert-link">Repay</Link>
            </div>
            <button className="health-alert-dismiss" onClick={() => setDismissed(true)}>&times;</button>
        </div>
    );
}
