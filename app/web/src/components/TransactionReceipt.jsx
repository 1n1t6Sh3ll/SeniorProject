import Icon from './Icon';

export default function TransactionReceipt({ isOpen, onClose, transaction }) {
    if (!isOpen || !transaction) return null;

    const tx = transaction;
    const date = tx.timestamp ? new Date(Number(tx.timestamp) * 1000) : new Date();

    const handleCopyHash = () => {
        if (tx.txHash) navigator.clipboard.writeText(tx.txHash);
    };

    const handlePrint = () => {
        const printContent = document.querySelector('.receipt-content');
        if (!printContent) return;
        const w = window.open('', '_blank');
        w.document.write(`<html><head><title>Transaction Receipt</title>
            <style>body{font-family:monospace;padding:20px;max-width:600px;margin:0 auto}
            .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}
            .label{color:#666}.value{font-weight:bold}h2{text-align:center;margin-bottom:20px}</style>
            </head><body>`);
        w.document.write(`<h2>CryptoCredit Bank - Transaction Receipt</h2>`);
        w.document.write(`<div class="row"><span class="label">Type</span><span class="value">${formatEventName(tx.type)}</span></div>`);
        w.document.write(`<div class="row"><span class="label">Date</span><span class="value">${date.toLocaleString()}</span></div>`);
        if (tx.amount) w.document.write(`<div class="row"><span class="label">Amount</span><span class="value">${parseFloat(tx.amount).toFixed(6)} ${tx.asset || ''}</span></div>`);
        if (tx.txHash) w.document.write(`<div class="row"><span class="label">Tx Hash</span><span class="value" style="word-break:break-all;font-size:0.8em">${tx.txHash}</span></div>`);
        w.document.write(`</body></html>`);
        w.document.close();
        w.print();
    };

    const formatEventName = (type) => (type || '').replace(/([A-Z])/g, ' $1').trim();

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal receipt-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">Transaction Receipt</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <div className="receipt-content">
                    <div className="receipt-header-badge" style={{ textAlign: 'center', marginBottom: 'var(--spacing-lg)' }}>
                        <Icon name="check" size={32} style={{ color: 'var(--success)' }} />
                        <div className="font-bold mt-sm" style={{ fontSize: '1.1rem' }}>
                            {formatEventName(tx.type)}
                        </div>
                    </div>

                    <div className="confirm-details">
                        <div className="confirm-detail-row">
                            <span className="text-muted">Date & Time</span>
                            <span className="mono">{date.toLocaleString()}</span>
                        </div>

                        {tx.amount && (
                            <div className="confirm-detail-row">
                                <span className="text-muted">Amount</span>
                                <span className="mono font-bold">
                                    {parseFloat(tx.amount).toFixed(tx.asset === 'WBTC' ? 6 : 4)} {tx.asset || 'USDX'}
                                </span>
                            </div>
                        )}

                        <div className="confirm-detail-row">
                            <span className="text-muted">Transaction Type</span>
                            <span className="mono">{formatEventName(tx.type)}</span>
                        </div>

                        {tx.txHash && (
                            <div className="confirm-detail-row" style={{ flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
                                <span className="text-muted">Transaction Hash</span>
                                <span className="mono text-xs" style={{ wordBreak: 'break-all', color: 'var(--primary)' }}>
                                    {tx.txHash}
                                </span>
                            </div>
                        )}

                        {tx.blockNumber && (
                            <div className="confirm-detail-row">
                                <span className="text-muted">Block Number</span>
                                <span className="mono">{tx.blockNumber}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="confirm-actions" style={{ marginTop: 'var(--spacing-lg)' }}>
                    <button className="btn btn-secondary flex-1" onClick={handleCopyHash} disabled={!tx.txHash}>
                        <Icon name="copy" size={14} /> Copy Hash
                    </button>
                    <button className="btn btn-secondary flex-1" onClick={handlePrint}>
                        Print
                    </button>
                    <button className="btn btn-primary flex-1" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
