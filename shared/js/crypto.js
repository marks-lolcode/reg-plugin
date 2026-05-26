// shared/js/crypto.js
//
// ============================================================================
// SHA-256 password hashing via the browser's built-in Web Crypto API.
// No external libraries required. Used by options pages that gate behavior
// behind a manager-override password whose plaintext is never stored.
// ============================================================================

/**
 * Hashes a plaintext password using SHA-256.
 * @param {string} password
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
async function hashPassword(password) {
  const data       = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// end shared/js/crypto.js
