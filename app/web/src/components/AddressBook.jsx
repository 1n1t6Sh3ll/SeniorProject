import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import Icon from './Icon';
import { getContacts, addContact, removeContact, updateContact } from '../utils/addressBook';

export default function AddressBook({ isOpen, onClose, onSelect }) {
    const [contacts, setContacts] = useState([]);
    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const [newAddress, setNewAddress] = useState('');
    const [newNotes, setNewNotes] = useState('');
    const [editingAddr, setEditingAddr] = useState(null);
    const [editName, setEditName] = useState('');
    const [editNotes, setEditNotes] = useState('');

    useEffect(() => {
        if (isOpen) setContacts(getContacts());
    }, [isOpen]);

    if (!isOpen) return null;

    const handleAdd = () => {
        if (!newName.trim() || !ethers.isAddress(newAddress)) return;
        const success = addContact(newName.trim(), newAddress.trim(), newNotes.trim());
        if (success) {
            setContacts(getContacts());
            setNewName('');
            setNewAddress('');
            setNewNotes('');
            setShowAdd(false);
        }
    };

    const handleDelete = (addr) => {
        removeContact(addr);
        setContacts(getContacts());
    };

    const handleEdit = (contact) => {
        setEditingAddr(contact.address);
        setEditName(contact.name);
        setEditNotes(contact.notes || '');
    };

    const handleSaveEdit = () => {
        if (!editName.trim()) return;
        updateContact(editingAddr, { name: editName.trim(), notes: editNotes.trim() });
        setEditingAddr(null);
        setContacts(getContacts());
    };

    const handleSelect = (contact) => {
        if (onSelect) onSelect(contact.address, contact.name);
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal address-book-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">Address Book</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <div className="address-book-body">
                    {contacts.length === 0 && !showAdd ? (
                        <div className="text-center" style={{ padding: 'var(--spacing-xl)' }}>
                            <Icon name="user" size={40} />
                            <p className="text-muted mt-md">No saved contacts</p>
                            <button className="btn btn-primary btn-sm mt-md" onClick={() => setShowAdd(true)}>
                                Add Contact
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="address-book-list">
                                {contacts.map(contact => (
                                    <div key={contact.address} className="address-book-item">
                                        {editingAddr === contact.address ? (
                                            <div className="flex flex-col gap-sm" style={{ width: '100%' }}>
                                                <input className="form-input" value={editName}
                                                    onChange={e => setEditName(e.target.value)} placeholder="Name" style={{ fontSize: '0.85rem' }} />
                                                <input className="form-input" value={editNotes}
                                                    onChange={e => setEditNotes(e.target.value)} placeholder="Notes (optional)" style={{ fontSize: '0.85rem' }} />
                                                <div className="flex gap-sm">
                                                    <button className="btn btn-primary btn-sm" onClick={handleSaveEdit}>Save</button>
                                                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingAddr(null)}>Cancel</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="address-book-item-info" onClick={() => handleSelect(contact)} style={{ cursor: 'pointer', flex: 1 }}>
                                                    <div className="font-bold">{contact.name}</div>
                                                    <div className="mono text-xs text-muted">
                                                        {contact.address.slice(0, 10)}...{contact.address.slice(-8)}
                                                    </div>
                                                    {contact.notes && <div className="text-xs text-muted mt-xs">{contact.notes}</div>}
                                                    {contact.lastUsed && (
                                                        <div className="text-xs text-muted mt-xs">
                                                            Last used: {new Date(contact.lastUsed).toLocaleDateString()} ({contact.transactionCount || 0} txs)
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex gap-xs">
                                                    <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(contact)}
                                                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}>Edit</button>
                                                    <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(contact.address)}
                                                        style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--danger)' }}>Del</button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {!showAdd && (
                                <button className="btn btn-secondary w-full mt-md" onClick={() => setShowAdd(true)}>
                                    + Add New Contact
                                </button>
                            )}
                        </>
                    )}

                    {showAdd && (
                        <div className="address-book-add" style={{ marginTop: 'var(--spacing-md)' }}>
                            <div className="text-sm font-bold mb-sm">New Contact</div>
                            <div className="flex flex-col gap-sm">
                                <input className="form-input" placeholder="Name" value={newName}
                                    onChange={e => setNewName(e.target.value)} style={{ fontSize: '0.85rem' }} />
                                <input className="form-input mono" placeholder="0x... address" value={newAddress}
                                    onChange={e => setNewAddress(e.target.value)} style={{ fontSize: '0.85rem' }} />
                                <input className="form-input" placeholder="Notes (optional)" value={newNotes}
                                    onChange={e => setNewNotes(e.target.value)} style={{ fontSize: '0.85rem' }} />
                                <div className="flex gap-sm">
                                    <button className="btn btn-primary btn-sm flex-1" onClick={handleAdd}
                                        disabled={!newName.trim() || !ethers.isAddress(newAddress)}>
                                        Save Contact
                                    </button>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)}>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
