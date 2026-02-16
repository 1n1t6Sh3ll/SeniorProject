/**
 * Address Book - Saved Recipients
 *
 * Stores saved contacts in localStorage for the Send page.
 */

const STORAGE_KEY = 'cryptocredit_address_book';

function loadContacts() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveContacts(contacts) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
    } catch {}
}

/**
 * Get all saved contacts
 */
export function getContacts() {
    return loadContacts();
}

/**
 * Add a new contact
 */
export function addContact(name, address, notes = '') {
    if (!name || !address) return false;
    const contacts = loadContacts();
    const normalized = address.toLowerCase();
    if (contacts.find(c => c.address.toLowerCase() === normalized)) return false;

    contacts.push({
        name,
        address,
        notes,
        addedAt: Date.now(),
        lastUsed: null,
        transactionCount: 0,
    });
    saveContacts(contacts);
    return true;
}

/**
 * Remove a contact by address
 */
export function removeContact(address) {
    const contacts = loadContacts();
    const filtered = contacts.filter(c => c.address.toLowerCase() !== address.toLowerCase());
    saveContacts(filtered);
}

/**
 * Update a contact
 */
export function updateContact(address, updates) {
    const contacts = loadContacts();
    const idx = contacts.findIndex(c => c.address.toLowerCase() === address.toLowerCase());
    if (idx === -1) return false;
    contacts[idx] = { ...contacts[idx], ...updates };
    saveContacts(contacts);
    return true;
}

/**
 * Check if an address is saved
 */
export function isContactSaved(address) {
    if (!address) return false;
    return loadContacts().some(c => c.address.toLowerCase() === address.toLowerCase());
}

/**
 * Get a contact by address
 */
export function getContactByAddress(address) {
    if (!address) return null;
    return loadContacts().find(c => c.address.toLowerCase() === address.toLowerCase()) || null;
}

/**
 * Record that a contact was used in a transaction
 */
export function recordContactUsage(address) {
    const contacts = loadContacts();
    const idx = contacts.findIndex(c => c.address.toLowerCase() === address.toLowerCase());
    if (idx === -1) return;
    contacts[idx].lastUsed = Date.now();
    contacts[idx].transactionCount = (contacts[idx].transactionCount || 0) + 1;
    saveContacts(contacts);
}
