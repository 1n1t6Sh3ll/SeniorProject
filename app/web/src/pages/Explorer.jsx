import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import Icon from '../components/Icon';
import { getReadProvider, getContract, getUserPosition, getTransactionHistory, getOraclePrices } from '../utils/contracts';

export default function Explorer() {
    const [tab, setTab] = useState('transactions'); // 'transactions' | 'blocks' | 'lookup'
    const [loading, setLoading] = useState(false);
    const [events, setEvents] = useState([]);
    const [blocks, setBlocks] = useState([]);
    const [expandedBlock, setExpandedBlock] = useState(null);
    const [blockTxs, setBlockTxs] = useState({});
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [selectedTx, setSelectedTx] = useState(null);
    const [txDetail, setTxDetail] = useState(null);

    // Address Lookup
    const [lookupAddress, setLookupAddress] = useState('');
    const [lookupResult, setLookupResult] = useState(null);
    const [lookupTxs, setLookupTxs] = useState([]);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [prices, setPrices] = useState({ ethPrice: 2000, wbtcPrice: 40000 });

    // Live feed
    const [liveEnabled, setLiveEnabled] = useState(false);
    const liveRef = useRef(null);
    const [newEventIds, setNewEventIds] = useState(new Set());

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (liveEnabled) {
            liveRef.current = setInterval(() => loadData(true), 10000);
            return () => clearInterval(liveRef.current);
        } else if (liveRef.current) {
            clearInterval(liveRef.current);
        }
    }, [liveEnabled]);

    const loadData = async (isRefresh = false) => {
        if (!isRefresh) setLoading(true);
        try {
            const provider = getReadProvider();
            const [oraclePrices] = await Promise.all([
                getOraclePrices(provider),
            ]);
            setPrices(oraclePrices);

            // Load blocks
            const currentBlock = await provider.getBlockNumber();
            const blockPromises = [];
            for (let i = currentBlock; i >= Math.max(0, currentBlock - 19); i--) {
                blockPromises.push(provider.getBlock(i));
            }
            const blockData = await Promise.all(blockPromises);
            setBlocks(blockData.filter(Boolean));

            // Load all protocol events
            const allEvents = await getAllProtocolEvents(provider, currentBlock);

            if (isRefresh && events.length > 0) {
                const existingHashes = new Set(events.map(e => e.txHash + e.type));
                const newIds = new Set();
                allEvents.forEach(e => {
                    if (!existingHashes.has(e.txHash + e.type)) {
                        newIds.add(e.txHash + e.type);
                    }
                });
                setNewEventIds(newIds);
                setTimeout(() => setNewEventIds(new Set()), 3000);
            }

            setEvents(allEvents);
        } catch (error) {
            console.error('Explorer load error:', error);
        } finally {
            setLoading(false);
        }
    };

    const getAllProtocolEvents = async (provider, currentBlock) => {
        try {
            const creditProtocol = getContract('CreditProtocol', provider);
            const fromBlock = Math.max(0, currentBlock - 10000);

            const [depositEvents, borrowEvents, repayEvents, withdrawEvents, tierEvents] = await Promise.all([
                creditProtocol.queryFilter(creditProtocol.filters.CollateralDeposited(), fromBlock, currentBlock),
                creditProtocol.queryFilter(creditProtocol.filters.Borrowed(), fromBlock, currentBlock),
                creditProtocol.queryFilter(creditProtocol.filters.Repaid(), fromBlock, currentBlock),
                creditProtocol.queryFilter(creditProtocol.filters.CollateralWithdrawn(), fromBlock, currentBlock),
                creditProtocol.queryFilter(creditProtocol.filters.TierUpgraded(), fromBlock, currentBlock),
            ]);

            const allEvents = [];

            for (const event of depositEvents) {
                const block = await event.getBlock();
                allEvents.push({
                    type: 'CollateralDeposited',
                    user: event.args.user,
                    asset: event.args.asset === ethers.ZeroAddress ? 'ETH' : 'WBTC',
                    amount: event.args.asset === ethers.ZeroAddress
                        ? ethers.formatEther(event.args.amount)
                        : ethers.formatUnits(event.args.amount, 8),
                    timestamp: block.timestamp,
                    txHash: event.transactionHash,
                    blockNumber: event.blockNumber,
                    logIndex: event.index,
                    rawArgs: {
                        user: event.args.user,
                        asset: event.args.asset,
                        amount: event.args.amount.toString(),
                    },
                });
            }

            for (const event of borrowEvents) {
                const block = await event.getBlock();
                allEvents.push({
                    type: 'Borrowed',
                    user: event.args.user,
                    asset: 'USDX',
                    amount: ethers.formatEther(event.args.amount),
                    timestamp: block.timestamp,
                    txHash: event.transactionHash,
                    blockNumber: event.blockNumber,
                    logIndex: event.index,
                    rawArgs: {
                        user: event.args.user,
                        amount: event.args.amount.toString(),
                    },
                });
            }

            for (const event of repayEvents) {
                const block = await event.getBlock();
                allEvents.push({
                    type: 'Repaid',
                    user: event.args.user,
                    asset: 'USDX',
                    amount: ethers.formatEther(event.args.amount),
                    timestamp: block.timestamp,
                    txHash: event.transactionHash,
                    blockNumber: event.blockNumber,
                    logIndex: event.index,
                    rawArgs: {
                        user: event.args.user,
                        amount: event.args.amount.toString(),
                    },
                });
            }

            for (const event of withdrawEvents) {
                const block = await event.getBlock();
                allEvents.push({
                    type: 'CollateralWithdrawn',
                    user: event.args.user,
                    asset: event.args.asset === ethers.ZeroAddress ? 'ETH' : 'WBTC',
                    amount: event.args.asset === ethers.ZeroAddress
                        ? ethers.formatEther(event.args.amount)
                        : ethers.formatUnits(event.args.amount, 8),
                    timestamp: block.timestamp,
                    txHash: event.transactionHash,
                    blockNumber: event.blockNumber,
                    logIndex: event.index,
                    rawArgs: {
                        user: event.args.user,
                        asset: event.args.asset,
                        amount: event.args.amount.toString(),
                    },
                });
            }

            for (const event of tierEvents) {
                const block = await event.getBlock();
                allEvents.push({
                    type: 'TierUpgraded',
                    user: event.args.user,
                    asset: '',
                    amount: `Tier ${event.args.newTier}`,
                    timestamp: block.timestamp,
                    txHash: event.transactionHash,
                    blockNumber: event.blockNumber,
                    logIndex: event.index,
                    rawArgs: {
                        user: event.args.user,
                        newTier: event.args.newTier.toString(),
                    },
                });
            }

            allEvents.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
            return allEvents;
        } catch (error) {
            console.error('Error fetching protocol events:', error);
            return [];
        }
    };

    const loadBlockTxs = async (blockNumber) => {
        if (blockTxs[blockNumber]) return;
        try {
            const provider = getReadProvider();
            const block = await provider.getBlock(blockNumber, true);
            if (block && block.transactions) {
                const txPromises = block.transactions.slice(0, 20).map(async (hash) => {
                    try {
                        const tx = await provider.getTransaction(hash);
                        return tx;
                    } catch { return null; }
                });
                const txs = (await Promise.all(txPromises)).filter(Boolean);
                setBlockTxs(prev => ({ ...prev, [blockNumber]: txs }));
            }
        } catch (err) {
            console.error('Error loading block txs:', err);
        }
    };

    const loadTxDetail = async (txHash) => {
        try {
            const provider = getReadProvider();
            const [tx, receipt] = await Promise.all([
                provider.getTransaction(txHash),
                provider.getTransactionReceipt(txHash),
            ]);
            setTxDetail({ tx, receipt });
        } catch (err) {
            console.error('Error loading tx detail:', err);
        }
    };

    const handleLookup = async (overrideAddr) => {
        const addr = (overrideAddr || lookupAddress).trim();
        if (!ethers.isAddress(addr)) return;
        setLookupLoading(true);
        try {
            const provider = getReadProvider();
            const [position, txs] = await Promise.all([
                getUserPosition(addr, provider),
                getTransactionHistory(addr, provider),
            ]);
            const ethBal = await provider.getBalance(addr);
            setLookupResult({
                address: addr,
                ethBalance: ethers.formatEther(ethBal),
                position,
            });
            setLookupTxs(txs);
        } catch (err) {
            console.error('Lookup error:', err);
            setLookupResult(null);
            setLookupTxs([]);
        } finally {
            setLookupLoading(false);
        }
    };

    const formatTime = (timestamp) => {
        const date = new Date(Number(timestamp) * 1000);
        const now = new Date();
        const diff = now - date;
        const secs = Math.floor(diff / 1000);
        if (secs < 60) return `${secs}s ago`;
        const mins = Math.floor(secs / 60);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    };

    const truncHash = (hash) => hash ? `${hash.slice(0, 10)}...${hash.slice(-6)}` : '';
    const truncAddr = (addr) => addr ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : '';

    const getEventColor = (type) => {
        const colors = {
            CollateralDeposited: 'var(--primary)',
            Borrowed: 'var(--info)',
            Repaid: 'var(--success)',
            CollateralWithdrawn: 'var(--warning)',
            TierUpgraded: 'var(--accent)',
        };
        return colors[type] || 'var(--text-secondary)';
    };

    const getEventIcon = (type) => {
        const iconNames = {
            CollateralDeposited: 'deposit',
            Borrowed: 'borrow',
            Repaid: 'check',
            CollateralWithdrawn: 'withdraw',
            TierUpgraded: 'shield',
        };
        return <Icon name={iconNames[type] || 'history'} size={16} />;
    };

    const formatEventName = (type) => type.replace(/([A-Z])/g, ' $1').trim();

    const filteredEvents = events.filter(e => {
        if (typeFilter !== 'all' && e.type !== typeFilter) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
                e.txHash?.toLowerCase().includes(q) ||
                e.user?.toLowerCase().includes(q) ||
                e.type?.toLowerCase().includes(q) ||
                e.amount?.includes(q)
            );
        }
        return true;
    });

    const eventTypes = [...new Set(events.map(e => e.type))];

    return (
        <main className="page-section">
            <div className="page-container">
                    <div className="page-header">
                        <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
                            <div>
                                <h1 className="page-title">Explorer</h1>
                                <p className="page-subtitle">Browse blocks, transactions, and protocol events</p>
                            </div>
                            <div className="flex items-center gap-sm">
                                <label className="flex items-center gap-sm" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
                                    <div
                                        onClick={() => setLiveEnabled(!liveEnabled)}
                                        style={{
                                            width: 36, height: 20, borderRadius: 10,
                                            background: liveEnabled ? 'var(--primary)' : 'var(--border)',
                                            position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                                        }}
                                    >
                                        <div style={{
                                            width: 16, height: 16, borderRadius: '50%',
                                            background: '#fff', position: 'absolute', top: 2,
                                            left: liveEnabled ? 18 : 2, transition: 'left 0.2s',
                                        }} />
                                    </div>
                                    <span className="text-muted">Live</span>
                                    {liveEnabled && (
                                        <span className="explorer-live-dot" />
                                    )}
                                </label>
                                <button onClick={() => loadData()} className="btn btn-secondary btn-sm" disabled={loading}>
                                    {loading ? 'Loading...' : 'Refresh'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Stats Bar */}
                    <div className="grid grid-4 mb-lg" style={{ gap: 'var(--spacing-md)' }}>
                        {[
                            { label: 'Latest Block', value: blocks[0]?.number?.toLocaleString() || '—', icon: 'cube', color: 'var(--primary)' },
                            { label: 'Total Events', value: events.length.toLocaleString(), icon: 'history', color: 'var(--info)' },
                            { label: 'Unique Users', value: [...new Set(events.map(e => e.user).filter(Boolean))].length, icon: 'user', color: 'var(--accent)' },
                            { label: 'ETH Price', value: `$${prices.ethPrice.toLocaleString()}`, icon: 'market', color: 'var(--success)' },
                        ].map((stat, i) => (
                            <div key={i} className="explorer-stat-card">
                                <div className="flex items-center gap-sm mb-sm">
                                    <span style={{ color: stat.color }}><Icon name={stat.icon} size={16} /></span>
                                    <span className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</span>
                                </div>
                                <div className="mono font-bold" style={{ fontSize: '1.25rem', color: stat.color }}>{stat.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Tabs */}
                    <div className="explorer-tabs mb-lg">
                        {[
                            { id: 'transactions', label: 'Transactions', count: events.length, icon: 'history' },
                            { id: 'blocks', label: 'Blocks', count: blocks.length, icon: 'cube' },
                            { id: 'lookup', label: 'Address Lookup', icon: 'search' },
                        ].map(t => (
                            <button
                                key={t.id}
                                className={`explorer-tab ${tab === t.id ? 'explorer-tab-active' : ''}`}
                                onClick={() => setTab(t.id)}
                            >
                                <Icon name={t.icon} size={14} />
                                <span>{t.label}</span>
                                {t.count !== undefined && <span className="explorer-tab-count">{t.count}</span>}
                            </button>
                        ))}
                    </div>

                    {/* TRANSACTIONS TAB */}
                    {tab === 'transactions' && (
                        <div className="dashboard-card">
                            <div className="flex gap-sm mb-lg" style={{ flexWrap: 'wrap' }}>
                                <div className="input-group" style={{ flex: '1 1 200px' }}>
                                    <span className="input-addon" style={{ padding: '0 8px' }}><Icon name="search" size={14} /></span>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Search by tx hash, address, type..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        style={{ fontSize: '0.85rem' }}
                                    />
                                </div>
                                <select
                                    className="form-input"
                                    value={typeFilter}
                                    onChange={e => setTypeFilter(e.target.value)}
                                    style={{ width: 'auto', fontSize: '0.85rem' }}
                                >
                                    <option value="all">All Types</option>
                                    {eventTypes.map(t => (
                                        <option key={t} value={t}>{formatEventName(t)}</option>
                                    ))}
                                </select>
                            </div>

                            {loading && events.length === 0 ? (
                                <div className="loading-container" style={{ minHeight: 200 }}>
                                    <div className="spinner"></div>
                                    <p>Loading events...</p>
                                </div>
                            ) : filteredEvents.length === 0 ? (
                                <div className="text-center" style={{ padding: 'var(--spacing-3xl)' }}>
                                    <Icon name="history" size={48} />
                                    <h3 className="mb-sm mt-md">No Events Found</h3>
                                    <p className="text-muted">No protocol events match your search criteria</p>
                                </div>
                            ) : (
                                <>
                                    <div className="text-xs text-muted mb-sm">
                                        Showing {filteredEvents.length} of {events.length} events
                                    </div>

                                    {/* Table Header */}
                                    <div className="explorer-table-header">
                                        <span style={{ width: 140 }}>Tx Hash</span>
                                        <span style={{ width: 130 }}>Type</span>
                                        <span style={{ width: 150 }}>User</span>
                                        <span style={{ width: 130 }}>Amount</span>
                                        <span style={{ width: 70 }}>Block</span>
                                        <span style={{ flex: 1 }}>Time</span>
                                    </div>

                                    <div className="flex flex-col">
                                        {filteredEvents.map((event, idx) => {
                                            const isNew = newEventIds.has(event.txHash + event.type);
                                            return (
                                                <div
                                                    key={`${event.txHash}-${event.logIndex}-${idx}`}
                                                    className={`explorer-table-row ${isNew ? 'explorer-new-event' : ''}`}
                                                    onClick={() => {
                                                        setSelectedTx(event);
                                                        loadTxDetail(event.txHash);
                                                    }}
                                                >
                                                    <span className="mono" style={{ width: 140, color: 'var(--primary)', fontSize: '0.75rem' }} title={event.txHash || ''}>
                                                        {truncHash(event.txHash)}
                                                    </span>
                                                    <span style={{ width: 130 }}>
                                                        <span className="flex items-center gap-sm" style={{ color: getEventColor(event.type) }}>
                                                            {getEventIcon(event.type)}
                                                            <span style={{ fontSize: '0.8rem' }}>{formatEventName(event.type)}</span>
                                                        </span>
                                                    </span>
                                                    <span className="mono" style={{ width: 150, fontSize: '0.78rem' }}>
                                                        <span
                                                            style={{ cursor: 'pointer', color: 'var(--info)' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setLookupAddress(event.user);
                                                                setTab('lookup');
                                                                handleLookup(event.user);
                                                            }}
                                                        >
                                                            {truncAddr(event.user)}
                                                        </span>
                                                    </span>
                                                    <span className="mono font-bold" style={{ width: 130, fontSize: '0.8rem' }}>
                                                        {event.amount ? `${parseFloat(event.amount).toFixed(event.asset === 'WBTC' ? 6 : 4)}` : '—'}
                                                        {event.asset && <span className="text-muted" style={{ marginLeft: 4 }}>{event.asset}</span>}
                                                    </span>
                                                    <span className="mono" style={{ width: 70, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                                        #{event.blockNumber}
                                                    </span>
                                                    <span className="text-muted" style={{ flex: 1, fontSize: '0.78rem' }}>
                                                        {formatTime(event.timestamp)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* BLOCKS TAB */}
                    {tab === 'blocks' && (
                        <div className="dashboard-card">
                            <h3 className="card-title">Recent Blocks</h3>
                            {loading && blocks.length === 0 ? (
                                <div className="loading-container" style={{ minHeight: 200 }}>
                                    <div className="spinner"></div>
                                    <p>Loading blocks...</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-sm">
                                    {blocks.map(block => (
                                        <div key={block.number}>
                                            <div
                                                className="explorer-block-card"
                                                onClick={() => {
                                                    if (expandedBlock === block.number) {
                                                        setExpandedBlock(null);
                                                    } else {
                                                        setExpandedBlock(block.number);
                                                        loadBlockTxs(block.number);
                                                    }
                                                }}
                                            >
                                                <div className="flex items-center gap-md" style={{ flex: 1 }}>
                                                    <div style={{
                                                        width: 40, height: 40, borderRadius: 'var(--radius-md)',
                                                        background: 'rgba(0,212,170,0.08)',
                                                        border: '1px solid rgba(0,212,170,0.2)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    }}>
                                                        <Icon name="cube" size={18} />
                                                    </div>
                                                    <div>
                                                        <div className="font-bold" style={{ color: 'var(--primary)' }}>
                                                            Block #{block.number}
                                                        </div>
                                                        <div className="text-xs text-muted">
                                                            {formatTime(block.timestamp)}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-lg text-sm">
                                                    <div className="text-center">
                                                        <div className="text-xs text-muted">Txns</div>
                                                        <div className="mono font-bold">{block.transactions?.length || 0}</div>
                                                    </div>
                                                    <div className="text-center">
                                                        <div className="text-xs text-muted">Gas Used</div>
                                                        <div className="mono font-bold">{Number(block.gasUsed).toLocaleString()}</div>
                                                    </div>
                                                    <div style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <span style={{
                                                            display: 'inline-block',
                                                            transform: expandedBlock === block.number ? 'rotate(180deg)' : 'rotate(0)',
                                                            transition: 'transform 0.2s',
                                                            fontSize: '0.8rem',
                                                        }}>&#9660;</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {expandedBlock === block.number && (
                                                <div className="explorer-block-expanded">
                                                    <div className="text-xs text-muted mb-sm" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                        Block Details
                                                    </div>
                                                    <div className="grid grid-2 gap-sm mb-md" style={{ fontSize: '0.85rem' }}>
                                                        <div><span className="text-muted">Hash: </span><span className="mono" style={{ fontSize: '0.75rem' }}>{truncHash(block.hash)}</span></div>
                                                        <div><span className="text-muted">Parent: </span><span className="mono" style={{ fontSize: '0.75rem' }}>{truncHash(block.parentHash)}</span></div>
                                                        <div><span className="text-muted">Gas Limit: </span><span className="mono">{Number(block.gasLimit).toLocaleString()}</span></div>
                                                        <div><span className="text-muted">Nonce: </span><span className="mono">{block.nonce}</span></div>
                                                    </div>

                                                    {blockTxs[block.number] ? (
                                                        blockTxs[block.number].length > 0 ? (
                                                            <div>
                                                                <div className="text-xs text-muted mb-sm">Transactions in Block</div>
                                                                {blockTxs[block.number].map((tx, i) => (
                                                                    <div key={i} className="explorer-block-tx">
                                                                        <span className="mono" style={{ color: 'var(--primary)', fontSize: '0.78rem' }}>
                                                                            {truncHash(tx.hash)}
                                                                        </span>
                                                                        <span className="mono text-muted" style={{ fontSize: '0.78rem' }}>
                                                                            {truncAddr(tx.from)} &rarr; {tx.to ? truncAddr(tx.to) : 'Contract Create'}
                                                                        </span>
                                                                        <span className="mono font-bold" style={{ fontSize: '0.78rem' }}>
                                                                            {parseFloat(ethers.formatEther(tx.value)).toFixed(4)} ETH
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div className="text-sm text-muted">No transactions in this block</div>
                                                        )
                                                    ) : (
                                                        <div className="text-sm text-muted">Loading transactions...</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ADDRESS LOOKUP TAB */}
                    {tab === 'lookup' && (
                        <div className="dashboard-card">
                            <h3 className="card-title">Address Lookup</h3>
                            <div className="flex gap-sm mb-lg">
                                <div className="input-group" style={{ flex: 1 }}>
                                    <span className="input-addon" style={{ padding: '0 8px' }}><Icon name="search" size={14} /></span>
                                    <input
                                        type="text"
                                        className="form-input mono"
                                        placeholder="Enter Ethereum address (0x...)"
                                        value={lookupAddress}
                                        onChange={e => setLookupAddress(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleLookup()}
                                        style={{ fontSize: '0.85rem' }}
                                    />
                                </div>
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={handleLookup}
                                    disabled={lookupLoading || !lookupAddress.trim()}
                                >
                                    {lookupLoading ? 'Looking up...' : 'Search'}
                                </button>
                            </div>

                            {lookupResult && (
                                <>
                                    {/* Address Info Card */}
                                    <div style={{
                                        padding: 'var(--spacing-lg)',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: 'var(--radius-lg)',
                                        border: '1px solid var(--border)',
                                        marginBottom: 'var(--spacing-lg)',
                                    }}>
                                        <div className="flex items-center gap-md mb-md">
                                            <div style={{
                                                width: 44, height: 44, borderRadius: '50%',
                                                background: 'rgba(0,212,170,0.1)',
                                                border: '1px solid rgba(0,212,170,0.3)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <Icon name="user" size={22} />
                                            </div>
                                            <div>
                                                <div className="text-xs text-muted">Address</div>
                                                <div className="mono" style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>
                                                    {lookupResult.address}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-3" style={{ gap: 'var(--spacing-lg)' }}>
                                            <div>
                                                <div className="text-xs text-muted mb-sm">ETH Balance</div>
                                                <div className="mono font-bold" style={{ fontSize: '1.1rem' }}>
                                                    {parseFloat(lookupResult.ethBalance).toFixed(4)} ETH
                                                </div>
                                            </div>
                                            {lookupResult.position && (
                                                <>
                                                    <div>
                                                        <div className="text-xs text-muted mb-sm">Collateral (ETH)</div>
                                                        <div className="mono font-bold" style={{ fontSize: '1.1rem' }}>
                                                            {parseFloat(ethers.formatEther(lookupResult.position.ethCollateral || 0n)).toFixed(4)}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs text-muted mb-sm">Collateral (WBTC)</div>
                                                        <div className="mono font-bold" style={{ fontSize: '1.1rem' }}>
                                                            {parseFloat(ethers.formatUnits(lookupResult.position.wbtcCollateral || 0n, 8)).toFixed(8)}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs text-muted mb-sm">Outstanding Debt</div>
                                                        <div className="mono font-bold" style={{ fontSize: '1.1rem', color: lookupResult.position.debtAmount > 0n ? 'var(--warning)' : 'var(--text-primary)' }}>
                                                            {parseFloat(ethers.formatEther(lookupResult.position.debtAmount || 0n)).toFixed(2)} USDX
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs text-muted mb-sm">Credit Tier</div>
                                                        <div className="mono font-bold" style={{ fontSize: '1.1rem', color: 'var(--accent)' }}>
                                                            Tier {lookupResult.position.creditTier || 1}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs text-muted mb-sm">Health Factor</div>
                                                        <div className="mono font-bold" style={{
                                                            fontSize: '1.1rem',
                                                            color: lookupResult.position.healthFactor >= BigInt('0xffffffffffffff')
                                                                ? 'var(--success)'
                                                                : parseFloat(ethers.formatEther(lookupResult.position.healthFactor)) < 1.5
                                                                    ? 'var(--danger)'
                                                                    : 'var(--success)',
                                                        }}>
                                                            {lookupResult.position.healthFactor >= BigInt('0xffffffffffffff')
                                                                ? 'Infinity'
                                                                : parseFloat(ethers.formatEther(lookupResult.position.healthFactor)).toFixed(2)}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Address Transaction History */}
                                    <h4 className="card-title">Transaction History ({lookupTxs.length})</h4>
                                    {lookupTxs.length === 0 ? (
                                        <div className="text-center text-muted" style={{ padding: 'var(--spacing-xl)' }}>
                                            No transactions found for this address
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-sm">
                                            {lookupTxs.map((tx, idx) => (
                                                <div key={`${tx.txHash}-${idx}`} className="explorer-table-row">
                                                    <span className="mono" style={{ width: 140, color: 'var(--primary)', fontSize: '0.75rem' }} title={tx.txHash || ''}>
                                                        {truncHash(tx.txHash)}
                                                    </span>
                                                    <span style={{ width: 130 }}>
                                                        <span className="flex items-center gap-sm" style={{ color: getEventColor(tx.type) }}>
                                                            {getEventIcon(tx.type)}
                                                            <span style={{ fontSize: '0.8rem' }}>{formatEventName(tx.type)}</span>
                                                        </span>
                                                    </span>
                                                    <span className="mono font-bold" style={{ flex: 1, fontSize: '0.8rem' }}>
                                                        {tx.amount ? parseFloat(tx.amount).toFixed(4) : '—'} {tx.asset}
                                                    </span>
                                                    <span className="mono text-muted" style={{ fontSize: '0.78rem' }}>
                                                        #{tx.blockNumber}
                                                    </span>
                                                    <span className="text-muted" style={{ fontSize: '0.78rem', marginLeft: 'var(--spacing-md)' }}>
                                                        {formatTime(tx.timestamp)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {!lookupResult && !lookupLoading && (
                                <div className="text-center" style={{ padding: 'var(--spacing-3xl)' }}>
                                    <Icon name="search" size={48} />
                                    <h3 className="mb-sm mt-md">Look Up Any Address</h3>
                                    <p className="text-muted">Enter an Ethereum address to view their position, collateral, debt, and transaction history</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TX DETAIL MODAL */}
                    {selectedTx && (
                        <div className="modal-overlay" onClick={() => { setSelectedTx(null); setTxDetail(null); }}>
                            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
                                <div className="modal-header">
                                    <h3 className="modal-title">Transaction Details</h3>
                                    <button className="modal-close" onClick={() => { setSelectedTx(null); setTxDetail(null); }}>&times;</button>
                                </div>

                                <div className="flex flex-col gap-md">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted">Event Type</span>
                                        <span className="font-bold" style={{ color: getEventColor(selectedTx.type) }}>
                                            {formatEventName(selectedTx.type)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted">Transaction Hash</span>
                                        <span className="mono" style={{ fontSize: '0.75rem', wordBreak: 'break-all', maxWidth: '60%', textAlign: 'right' }}>
                                            {selectedTx.txHash}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted">Block</span>
                                        <span className="mono font-bold">#{selectedTx.blockNumber}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted">User</span>
                                        <span className="mono" style={{ fontSize: '0.78rem' }}>{selectedTx.user}</span>
                                    </div>
                                    {selectedTx.amount && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted">Amount</span>
                                            <span className="mono font-bold">{selectedTx.amount} {selectedTx.asset}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted">Timestamp</span>
                                        <span>{new Date(Number(selectedTx.timestamp) * 1000).toLocaleString()}</span>
                                    </div>

                                    {txDetail?.tx && (
                                        <>
                                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-md)' }}>
                                                <div className="text-xs text-muted mb-sm" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                    Transaction Info
                                                </div>
                                                <div className="flex justify-between text-sm mb-sm">
                                                    <span className="text-muted">From</span>
                                                    <span className="mono" style={{ fontSize: '0.78rem' }}>{txDetail.tx.from}</span>
                                                </div>
                                                <div className="flex justify-between text-sm mb-sm">
                                                    <span className="text-muted">To (Contract)</span>
                                                    <span className="mono" style={{ fontSize: '0.78rem' }}>{truncAddr(txDetail.tx.to)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm mb-sm">
                                                    <span className="text-muted">Value</span>
                                                    <span className="mono">{ethers.formatEther(txDetail.tx.value)} ETH</span>
                                                </div>
                                                <div className="flex justify-between text-sm mb-sm">
                                                    <span className="text-muted">Gas Price</span>
                                                    <span className="mono">{txDetail.tx.gasPrice ? parseFloat(ethers.formatUnits(txDetail.tx.gasPrice, 'gwei')).toFixed(2) + ' Gwei' : '—'}</span>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {txDetail?.receipt && (
                                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-md)' }}>
                                            <div className="text-xs text-muted mb-sm" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                Receipt
                                            </div>
                                            <div className="flex justify-between text-sm mb-sm">
                                                <span className="text-muted">Status</span>
                                                <span className={`badge ${txDetail.receipt.status === 1 ? 'badge-success' : 'badge-danger'}`}>
                                                    {txDetail.receipt.status === 1 ? 'Success' : 'Failed'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-sm mb-sm">
                                                <span className="text-muted">Gas Used</span>
                                                <span className="mono">{Number(txDetail.receipt.gasUsed).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted">Logs</span>
                                                <span className="mono">{txDetail.receipt.logs?.length || 0} event(s)</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Raw Event Args */}
                                    {selectedTx.rawArgs && (
                                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-md)' }}>
                                            <div className="text-xs text-muted mb-sm" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                Decoded Event Arguments
                                            </div>
                                            <div style={{
                                                background: 'var(--bg-tertiary)',
                                                borderRadius: 'var(--radius-md)',
                                                padding: 'var(--spacing-md)',
                                                border: '1px solid var(--border)',
                                            }}>
                                                {Object.entries(selectedTx.rawArgs).map(([key, val]) => (
                                                    <div key={key} className="flex justify-between text-sm mb-sm" style={{ wordBreak: 'break-all' }}>
                                                        <span className="text-muted" style={{ minWidth: 80 }}>{key}</span>
                                                        <span className="mono" style={{ fontSize: '0.75rem', textAlign: 'right' }}>{val}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
        </main>
    );
}
