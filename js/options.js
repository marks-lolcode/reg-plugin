// js/options.js

// Extension options page script.
// Saves management override state to chrome.storage.local.
// Password verification uses SHA-256 hash comparison — the real password
// is never stored in code or in chrome.storage.
//
// CONFIG and STORAGE_KEY are globals injected via extension_options_page.html
// script tags before this file loads.

/**
 * Hashes a plaintext password using SHA-256 via the browser's built-in
 * Web Crypto API. No external libraries required.
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

/**
 * Reads form values, validates the management password if override is
 * being enabled, saves settings to chrome.storage.local, and closes
 * the window on success.
 */
async function saveOptions() {
  const mngtOverride = document.getElementById("mngtoverride").checked;
  const statusEl     = document.getElementById("status");

  if (mngtOverride) {
    const entered     = document.getElementById("mngt-password").value;
    const enteredHash = await hashPassword(entered);
    if (enteredHash !== CONFIG.managementPasswordHash) {
      statusEl.className   = "error";
      statusEl.textContent = "Incorrect password — options not saved.";
      setTimeout(() => { statusEl.textContent = ""; statusEl.className = ""; }, 2000);
      return;
    }
  }

  await chrome.storage.local.set({
    [STORAGE_KEY.MANAGEMENT_OVERRIDE]: mngtOverride,
  });

  statusEl.className   = "";
  statusEl.textContent = "Options saved.";

  // Close the options window after a brief confirmation pause.
  // window.close() works when opened as a popup; if opened as a
  // full tab it will be blocked by the browser and the status
  // message will remain visible instead.
  setTimeout(() => window.close(), 1000);
}

/**
 * Restores saved settings into the options form on page load.
 */
function restoreOptions() {
  chrome.storage.local.get(
    { [STORAGE_KEY.MANAGEMENT_OVERRIDE]: false },
    (items) => {
      document.getElementById("mngtoverride").checked = items[STORAGE_KEY.MANAGEMENT_OVERRIDE];
      togglePasswordField();
    }
  );
}

/**
 * Shows or hides the password input based on the override checkbox state.
 */
function togglePasswordField() {
  document.getElementById("password-row").style.display =
    document.getElementById("mngtoverride").checked ? "block" : "none";
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.getElementById("save").addEventListener("click", saveOptions);
document.getElementById("mngtoverride").addEventListener("change", togglePasswordField);

// end js/options.js
