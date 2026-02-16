import { createContext, useContext, useState, useCallback, useRef } from 'react';
import Icon from './Icon';

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const [history, setHistory] = useState([]);
    const timersRef = useRef({});

    const removeToast = useCallback((id) => {
        clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
        setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 250);
    }, []);

    const addToast = useCallback((type, title, message, duration = 5000, meta = {}) => {
        const id = ++toastId;
        const toast = { id, type, title, message, meta, exiting: false };
        setToasts(prev => [...prev, toast]);

        // Add to history (keep last 20)
        setHistory(prev => [...prev, { type, title, message, meta, timestamp: Date.now() }].slice(-20));

        if (duration > 0) {
            timersRef.current[id] = setTimeout(() => removeToast(id), duration);
        }
        return id;
    }, [removeToast]);

    const toastFns = useRef({
        success: () => {},
        error: () => {},
        warning: () => {},
        info: () => {},
        tx: () => {},
        history: [],
    });

    toastFns.current.success = (title, message) => addToast('success', title, message);
    toastFns.current.error = (title, message) => addToast('error', title, message, 8000);
    toastFns.current.warning = (title, message) => addToast('warning', title, message, 6000);
    toastFns.current.info = (title, message) => addToast('info', title, message);
    toastFns.current.tx = (title, message, txHash) => addToast('tx', title, message, 10000, { txHash });
    toastFns.current.history = history;

    const iconMap = {
        success: 'check',
        error: 'error',
        warning: 'warning',
        info: 'info',
        tx: 'check',
    };

    const copyTxHash = (hash) => {
        navigator.clipboard.writeText(hash);
    };

    return (
        <ToastContext.Provider value={toastFns.current}>
            {children}
            <div className="toast-container">
                {toasts.map(t => (
                    <div key={t.id} className={`toast ${t.type} ${t.exiting ? 'toast-exit' : ''}`}>
                        <div className="toast-icon"><Icon name={iconMap[t.type] || 'info'} size={16} /></div>
                        <div className="toast-body">
                            <div className="toast-title">{t.title}</div>
                            {t.message && <div className="toast-message">{t.message}</div>}
                            {t.meta?.txHash && (
                                <button
                                    className="toast-tx-hash"
                                    onClick={() => copyTxHash(t.meta.txHash)}
                                    title="Click to copy transaction hash"
                                >
                                    tx: {t.meta.txHash.slice(0, 10)}...{t.meta.txHash.slice(-6)} (copy)
                                </button>
                            )}
                        </div>
                        <button className="toast-close" onClick={() => removeToast(t.id)}>&times;</button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        return {
            success: (title, msg) => console.log('Toast:', title, msg),
            error: (title, msg) => console.error('Toast:', title, msg),
            warning: (title, msg) => console.warn('Toast:', title, msg),
            info: (title, msg) => console.info('Toast:', title, msg),
            tx: (title, msg, hash) => console.log('Toast TX:', title, msg, hash),
            history: [],
        };
    }
    return context;
}
