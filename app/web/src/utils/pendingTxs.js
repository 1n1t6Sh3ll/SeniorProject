const STORAGE_KEY = 'cryptocredit_pending_txs';

function getAll() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
}

function save(txs) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(txs)); } catch {}
}

export function addPendingTx(hash, type, details = {}) {
    const txs = getAll();
    if (txs.find(t => t.hash === hash)) return;
    txs.unshift({
        hash,
        type,
        status: 'pending',
        timestamp: Date.now(),
        ...details,
    });
    // Keep max 100
    if (txs.length > 100) txs.length = 100;
    save(txs);
}

export function updateTxStatus(hash, status, extra = {}) {
    const txs = getAll();
    const tx = txs.find(t => t.hash === hash);
    if (tx) {
        tx.status = status;
        tx.confirmedAt = Date.now();
        Object.assign(tx, extra);
        save(txs);
    }
}

export function getPendingTxs() {
    return getAll().filter(t => t.status === 'pending');
}

export function getRecentTxs(limit = 10) {
    return getAll().slice(0, limit);
}

export function getPendingCount() {
    return getPendingTxs().length;
}

export function clearConfirmed() {
    const txs = getAll().filter(t => t.status === 'pending');
    save(txs);
}

// Poll provider for pending tx receipts and update status
export async function pollPendingTxs(provider) {
    const pending = getPendingTxs();
    for (const tx of pending) {
        try {
            const receipt = await provider.getTransactionReceipt(tx.hash);
            if (receipt) {
                updateTxStatus(tx.hash, receipt.status === 1 ? 'confirmed' : 'failed', {
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed?.toString(),
                });
            }
        } catch {
            // ignore - tx may not be mined yet
        }
    }
}
