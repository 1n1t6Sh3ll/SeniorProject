import { useState, useRef, useEffect } from 'react';
import { formatAPR } from '../utils/interest';
import { calculateOriginationFee, calculateTotalBorrowCost } from '../utils/fees';

export default function LoanAgreement({ isOpen, onAgree, onCancel, amount, tier, apr }) {
    const [canAgree, setCanAgree] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (isOpen) setCanAgree(false);
    }, [isOpen]);

    if (!isOpen) return null;

    const principal = parseFloat(amount) || 0;
    const origFee = calculateOriginationFee(principal);
    const cost6m = calculateTotalBorrowCost(principal, tier, 6);
    const cost12m = calculateTotalBorrowCost(principal, tier, 12);
    const monthlyRate = apr / 12;
    const monthlyPayment6 = monthlyRate > 0
        ? principal * (monthlyRate * Math.pow(1 + monthlyRate, 6)) / (Math.pow(1 + monthlyRate, 6) - 1)
        : principal / 6;
    const monthlyPayment12 = monthlyRate > 0
        ? principal * (monthlyRate * Math.pow(1 + monthlyRate, 12)) / (Math.pow(1 + monthlyRate, 12) - 1)
        : principal / 12;

    const handleScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 30;
        if (atBottom) setCanAgree(true);
    };

    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal loan-agreement-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">Loan Agreement</h3>
                    <button className="modal-close" onClick={onCancel}>&times;</button>
                </div>

                <div className="loan-agreement-body" ref={scrollRef} onScroll={handleScroll}>
                    <div className="loan-agreement-doc">
                        <h2 className="agreement-heading">CRYPTOCREDIT BANK</h2>
                        <h3 className="agreement-subheading">Loan Agreement & Disclosure Statement</h3>
                        <p className="agreement-date">Effective Date: {today}</p>

                        <div className="agreement-summary">
                            <div className="agreement-summary-row">
                                <span>Loan Principal</span>
                                <span className="mono font-bold">${principal.toFixed(2)} USDX</span>
                            </div>
                            <div className="agreement-summary-row">
                                <span>Annual Percentage Rate (APR)</span>
                                <span className="mono font-bold">{formatAPR(apr)}</span>
                            </div>
                            <div className="agreement-summary-row">
                                <span>Origination Fee (0.5%)</span>
                                <span className="mono font-bold">${origFee.toFixed(2)} USDX</span>
                            </div>
                            <div className="agreement-summary-row">
                                <span>Est. Monthly Payment (6-mo plan)</span>
                                <span className="mono font-bold">${monthlyPayment6.toFixed(2)}</span>
                            </div>
                            <div className="agreement-summary-row">
                                <span>Est. Monthly Payment (12-mo plan)</span>
                                <span className="mono font-bold">${monthlyPayment12.toFixed(2)}</span>
                            </div>
                            <div className="agreement-summary-row" style={{ borderTop: '2px solid var(--border)', paddingTop: 'var(--spacing-sm)' }}>
                                <span className="font-bold">Est. Total Repayment (12 months)</span>
                                <span className="mono font-bold" style={{ color: 'var(--primary)' }}>${cost12m.totalCost.toFixed(2)}</span>
                            </div>
                        </div>

                        <h4 className="agreement-section-title">1. LOAN TERMS</h4>
                        <p className="agreement-text">
                            1.1. The Borrower agrees to repay the principal amount of <strong>${principal.toFixed(2)} USDX</strong> plus
                            accrued interest at the annual rate of <strong>{formatAPR(apr)}</strong>, compounded daily.
                        </p>
                        <p className="agreement-text">
                            1.2. An origination fee of <strong>${origFee.toFixed(2)} USDX</strong> (0.5% of principal) is assessed
                            at the time of borrowing and included in the total cost of the loan.
                        </p>
                        <p className="agreement-text">
                            1.3. The Borrower may choose a repayment plan of 3, 6, or 12 months. Early repayment
                            is permitted without penalty.
                        </p>

                        <h4 className="agreement-section-title">2. INTEREST & FEES</h4>
                        <p className="agreement-text">
                            2.1. Interest accrues daily from the date of disbursement. The effective APR is determined
                            by the Borrower's credit tier at the time of borrowing.
                        </p>
                        <p className="agreement-text">
                            2.2. A late payment fee of <strong>$25.00 USDX</strong> will be assessed if no repayment
                            activity occurs within 30 calendar days. Additionally, a penalty APR of +2% will be
                            applied to the outstanding balance after the grace period.
                        </p>

                        <h4 className="agreement-section-title">3. COLLATERAL REQUIREMENTS</h4>
                        <p className="agreement-text">
                            3.1. The loan is secured by the Borrower's deposited collateral (ETH and/or WBTC).
                            The Borrower must maintain a health factor above 1.0 at all times.
                        </p>
                        <p className="agreement-text">
                            3.2. If the health factor falls below 1.0, the collateral may be subject to liquidation
                            to recover the outstanding debt. A liquidation penalty of 10% applies.
                        </p>

                        <h4 className="agreement-section-title">4. DEFAULT & REMEDIES</h4>
                        <p className="agreement-text">
                            4.1. Failure to maintain adequate collateral or repay within the agreed terms constitutes
                            a default. Upon default, CryptoCredit Bank reserves the right to liquidate collateral
                            and apply proceeds to the outstanding balance.
                        </p>

                        <h4 className="agreement-section-title">5. ACKNOWLEDGMENT</h4>
                        <p className="agreement-text">
                            By clicking "I Agree" below, the Borrower acknowledges that they have read, understood,
                            and agree to the terms and conditions set forth in this Loan Agreement. This is a
                            simulated agreement for demonstration purposes.
                        </p>
                    </div>
                </div>

                <div className="loan-agreement-footer">
                    {!canAgree && (
                        <div className="text-xs text-muted text-center mb-sm">
                            Scroll to the bottom to enable agreement
                        </div>
                    )}
                    <div className="confirm-actions">
                        <button className="btn btn-secondary flex-1" onClick={onCancel}>
                            Decline
                        </button>
                        <button
                            className="btn btn-primary flex-1"
                            onClick={onAgree}
                            disabled={!canAgree}
                        >
                            I Agree to Terms
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
