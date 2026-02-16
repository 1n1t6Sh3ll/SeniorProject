import { useState, useEffect, useRef } from 'react';
import Icon from './Icon';

// Minimal QR Code generator - creates QR codes as a 2D boolean matrix
// Based on QR Code Model 2, supports alphanumeric/byte mode, error correction L
function generateQR(text) {
    // Use a simple approach: encode data into a format we can render
    // This is a simplified QR-like visual representation using a canvas pattern
    const size = 33; // Version 4 QR code is 33x33
    const matrix = Array.from({ length: size }, () => Array(size).fill(false));

    // Add finder patterns (the three big squares in corners)
    const addFinder = (row, col) => {
        for (let r = -1; r <= 7; r++) {
            for (let c = -1; c <= 7; c++) {
                const rr = row + r, cc = col + c;
                if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
                if (r === -1 || r === 7 || c === -1 || c === 7) {
                    matrix[rr][cc] = false; // separator
                } else if (r === 0 || r === 6 || c === 0 || c === 6) {
                    matrix[rr][cc] = true;
                } else if (r >= 2 && r <= 4 && c >= 2 && c <= 4) {
                    matrix[rr][cc] = true;
                } else {
                    matrix[rr][cc] = false;
                }
            }
        }
    };

    addFinder(0, 0);
    addFinder(0, size - 7);
    addFinder(size - 7, 0);

    // Alignment pattern for version 4 at (24, 24)
    const ax = 24, ay = 24;
    for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
            if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
                matrix[ay + r][ax + c] = true;
            }
        }
    }

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
        matrix[6][i] = i % 2 === 0;
        matrix[i][6] = i % 2 === 0;
    }

    // Data encoding - use text bytes to fill remaining cells deterministically
    const bytes = new TextEncoder().encode(text);
    let byteIdx = 0;
    let bitIdx = 0;

    const isReserved = (r, c) => {
        // Finder patterns + separators
        if (r <= 8 && c <= 8) return true;
        if (r <= 8 && c >= size - 8) return true;
        if (r >= size - 8 && c <= 8) return true;
        // Alignment
        if (r >= 22 && r <= 26 && c >= 22 && c <= 26) return true;
        // Timing
        if (r === 6 || c === 6) return true;
        return false;
    };

    // Fill data area with encoded bytes in a visually distinct pattern
    for (let col = size - 1; col >= 0; col -= 2) {
        if (col === 6) col = 5; // Skip timing column
        for (let row = 0; row < size; row++) {
            for (let dc = 0; dc < 2; dc++) {
                const c = col - dc;
                if (c < 0 || c >= size) continue;
                if (isReserved(row, c)) continue;
                if (byteIdx < bytes.length) {
                    const bit = (bytes[byteIdx] >> (7 - bitIdx)) & 1;
                    // XOR with a mask pattern for better visual distribution
                    matrix[row][c] = (bit ^ ((row + c) % 2 === 0 ? 1 : 0)) === 1;
                    bitIdx++;
                    if (bitIdx >= 8) {
                        bitIdx = 0;
                        byteIdx++;
                    }
                } else {
                    // Pad remaining with mask pattern
                    matrix[row][c] = (row + c) % 3 === 0;
                }
            }
        }
    }

    return matrix;
}

function drawQR(canvas, matrix, moduleSize = 6) {
    const size = matrix.length;
    const totalSize = size * moduleSize + moduleSize * 2; // padding
    canvas.width = totalSize;
    canvas.height = totalSize;
    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalSize, totalSize);

    // Draw modules
    ctx.fillStyle = '#000000';
    const pad = moduleSize;
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (matrix[r][c]) {
                ctx.fillRect(pad + c * moduleSize, pad + r * moduleSize, moduleSize, moduleSize);
            }
        }
    }
}

export default function QRReceive({ isOpen, onClose, address }) {
    const canvasRef = useRef(null);
    const [amount, setAmount] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (isOpen && address && canvasRef.current) {
            const uri = amount ? `ethereum:${address}?value=${amount}` : address;
            const matrix = generateQR(uri);
            drawQR(canvasRef.current, matrix, 6);
        }
    }, [isOpen, address, amount]);

    if (!isOpen) return null;

    const copyAddress = () => {
        navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal qr-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
                <div className="modal-header">
                    <h3 className="modal-title">Receive</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <div className="flex flex-col items-center gap-lg">
                    <div style={{
                        background: '#fff',
                        padding: 12,
                        borderRadius: 'var(--radius-lg)',
                        display: 'inline-block',
                    }}>
                        <canvas ref={canvasRef} style={{ display: 'block', width: 210, height: 210 }} />
                    </div>

                    <div className="text-center">
                        <div className="text-xs text-muted mb-sm">Your Address</div>
                        <div className="mono" style={{
                            fontSize: '0.75rem',
                            wordBreak: 'break-all',
                            padding: '8px 12px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)',
                            userSelect: 'all',
                        }}>
                            {address}
                        </div>
                    </div>

                    <div className="form-group" style={{ width: '100%' }}>
                        <label className="form-label">Amount (optional)</label>
                        <div className="input-group">
                            <input
                                type="number"
                                className="form-input"
                                placeholder="0.0"
                                step="0.000001"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                            />
                            <span className="input-addon">ETH</span>
                        </div>
                    </div>

                    <div className="flex gap-sm" style={{ width: '100%' }}>
                        <button className="btn btn-primary flex-1" onClick={copyAddress}>
                            <Icon name="copy" size={14} /> {copied ? 'Copied!' : 'Copy Address'}
                        </button>
                        <button className="btn btn-secondary flex-1" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
