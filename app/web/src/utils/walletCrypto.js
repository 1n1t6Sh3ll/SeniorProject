/**
 * Wallet encryption utilities using Web Crypto API (AES-GCM + PBKDF2)
 * Encrypts private keys with a user password before storing in localStorage.
 */

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Encrypt a string (private key or mnemonic) with a password.
 * Returns { ciphertext, salt, iv } as hex strings.
 */
export async function encryptData(plaintext, password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  return {
    ciphertext: bufToHex(encrypted),
    salt: bufToHex(salt),
    iv: bufToHex(iv),
  };
}

/**
 * Decrypt data with a password.
 * Takes { ciphertext, salt, iv } as hex strings.
 * Returns the plaintext string, or throws on wrong password.
 */
export async function decryptData({ ciphertext, salt, iv }, password) {
  const key = await deriveKey(password, hexToBuf(salt));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: hexToBuf(iv) },
    key,
    hexToBuf(ciphertext)
  );
  return new TextDecoder().decode(decrypted);
}
