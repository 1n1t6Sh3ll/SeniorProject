import { useState, useRef, useEffect } from 'react';
import { useToast } from './Toast';
import Icon from './Icon';

export default function NotificationCenter() {
    const { history } = useToast();
    const [open, setOpen] = useState(false);
    const [seen, setSeen] = useState(0);
    const ref = useRef(null);

    const unseen = history.length - seen;

    useEffect(() => {
        const handleClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleOpen = () => {
        setOpen(!open);
        if (!open) setSeen(history.length);
    };

    const iconMap = { success: 'check', error: 'error', warning: 'warning', info: 'info', tx: 'check' };

    return (
        <div className="notification-center" ref={ref}>
            <button className="notification-bell" onClick={handleOpen} title="Notifications">
                <Icon name="history" size={16} />
                {unseen > 0 && <span className="notification-badge">{unseen > 9 ? '9+' : unseen}</span>}
            </button>

            {open && (
                <div className="notification-dropdown">
                    <div className="notification-dropdown-header">
                        <span className="font-bold text-sm">Notifications</span>
                        <span className="text-xs text-muted">{history.length} total</span>
                    </div>
                    <div className="notification-dropdown-list">
                        {history.length === 0 ? (
                            <div className="text-muted text-sm" style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
                                No notifications yet
                            </div>
                        ) : (
                            [...history].reverse().map((t, i) => (
                                <div key={i} className={`notification-item notification-${t.type}`}>
                                    <div className="notification-item-icon">
                                        <Icon name={iconMap[t.type] || 'info'} size={12} />
                                    </div>
                                    <div className="notification-item-content">
                                        <div className="text-sm font-bold">{t.title}</div>
                                        <div className="text-xs text-muted">{t.message}</div>
                                        {t.meta?.txHash && (
                                            <div className="text-xs mono" style={{ color: 'var(--primary)', marginTop: '2px' }}>
                                                tx: {t.meta.txHash.slice(0, 10)}...{t.meta.txHash.slice(-6)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted" style={{ flexShrink: 0 }}>
                                        {formatTime(t.timestamp)}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function formatTime(ts) {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
}
