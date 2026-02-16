import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error('Uncaught error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--bg-primary, #0a0e14)',
                    padding: '2rem',
                }}>
                    <div style={{
                        maxWidth: '500px',
                        width: '100%',
                        background: 'var(--bg-card, #0d1117)',
                        borderRadius: '6px',
                        border: '1px solid var(--danger, #ef4444)30',
                        padding: '2.5rem',
                        textAlign: 'center',
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#x26A0;</div>
                        <h1 style={{
                            fontSize: '1.5rem',
                            fontWeight: '700',
                            color: 'var(--text-primary, #fff)',
                            marginBottom: '0.75rem',
                        }}>
                            Something went wrong
                        </h1>
                        <p style={{
                            color: 'var(--text-secondary, #8b8fa3)',
                            marginBottom: '1.5rem',
                            lineHeight: '1.6',
                        }}>
                            An unexpected error occurred. Please try refreshing the page.
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                padding: '10px 24px',
                                background: 'var(--primary, #00d4aa)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                            }}
                        >
                            Refresh Page
                        </button>
                        {this.state.error && (
                            <details style={{
                                marginTop: '1.5rem',
                                textAlign: 'left',
                                fontSize: '0.78rem',
                                color: 'var(--text-secondary, #8b8fa3)',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                background: 'rgba(0,0,0,0.2)',
                                borderRadius: '8px',
                                padding: '12px',
                            }}>
                                <summary style={{ cursor: 'pointer', marginBottom: '8px', fontWeight: 600 }}>
                                    Error Details
                                </summary>
                                <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                                    {this.state.error.toString()}
                                </code>
                                {this.state.errorInfo && (
                                    <pre style={{ marginTop: '8px', fontSize: '0.72rem', opacity: 0.7 }}>
                                        {this.state.errorInfo.componentStack}
                                    </pre>
                                )}
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
