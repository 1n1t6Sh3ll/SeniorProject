import Icon from './Icon';

export default function ConfirmationModal({
    isOpen,
    onConfirm,
    onCancel,
    title = 'Confirm Transaction',
    description,
    details = [],
    confirmText = 'Confirm',
    confirmVariant = 'primary',
    loading = false,
    warningMessage,
}) {
    if (!isOpen) return null;

    const btnClass = confirmVariant === 'danger'
        ? 'btn btn-primary'
        : 'btn btn-primary';
    const btnStyle = confirmVariant === 'danger'
        ? { background: 'var(--danger)' }
        : {};

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">{title}</h3>
                    <button className="modal-close" onClick={onCancel}>&times;</button>
                </div>

                {description && (
                    <p className="text-muted text-sm" style={{ marginBottom: 'var(--spacing-lg)' }}>
                        {description}
                    </p>
                )}

                {details.length > 0 && (
                    <div className="confirm-details">
                        {details.map((d, i) => (
                            <div key={i} className="confirm-detail-row">
                                <span className="text-muted">{d.label}</span>
                                <span className="mono font-bold" style={d.style || {}}>
                                    {d.value}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {warningMessage && (
                    <div className="info-box warning" style={{ marginTop: 'var(--spacing-md)' }}>
                        <Icon name="warning" size={14} style={{ flexShrink: 0 }} />
                        <span>{warningMessage}</span>
                    </div>
                )}

                <div className="confirm-actions">
                    <button
                        className="btn btn-secondary flex-1"
                        onClick={onCancel}
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button
                        className={`${btnClass} flex-1`}
                        onClick={onConfirm}
                        disabled={loading}
                        style={btnStyle}
                    >
                        {loading ? <><span className="loading"></span> Processing...</> : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
