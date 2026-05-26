// js/options.js
//
// Extension options page script.
// Persists two settings to chrome.storage.local:
//   - STORAGE_KEY.EXTENSION_MODE   ("reg" | "merch")  -- drives which popup flow runs
//   - STORAGE_KEY.MANAGEMENT_OVERRIDE (boolean)        -- password-gated bypass
//
// Password verification uses SHA-256 hash comparison -- the real password
// is never stored in code or in chrome.storage.
//
// CONFIG, STORAGE_KEY, EXTENSION_MODE are globals injected via
// extension_options_page.html script tags before this file loads.
// hashPassword() comes from shared/js/crypto.js, also loaded before this file.

/**
 * Reads form values, validates the management password if override is
 * being enabled, saves settings to chrome.storage.local, and closes
 * the window on success.
 */
async function saveOptions() {
  const mngtOverride = document.getElementById("mngtoverride").checked;
  const mode         = document.querySelector('input[name="ext-mode"]:checked')?.value
                       ?? EXTENSION_MODE.REG;
  const statusEl     = document.getElementById("status");

  if (mngtOverride) {
    const entered     = document.getElementById("mngt-password").value;
    const enteredHash = await hashPassword(entered);
    if (enteredHash !== CONFIG.managementPasswordHash) {
      statusEl.className   = "error";
      statusEl.textContent = "Incorrect password -- options not saved.";
      setTimeout(() => { statusEl.textContent = ""; statusEl.className = ""; }, 2000);
      return;
    }
  }

  await chrome.storage.local.set({
    [STORAGE_KEY.MANAGEMENT_OVERRIDE]: mngtOverride,
    [STORAGE_KEY.EXTENSION_MODE]:      mode,
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
    {
      [STORAGE_KEY.MANAGEMENT_OVERRIDE]: false,
      [STORAGE_KEY.EXTENSION_MODE]:      EXTENSION_MODE.REG,
    },
    (items) => {
      document.getElementById("mngtoverride").checked = items[STORAGE_KEY.MANAGEMENT_OVERRIDE];

      const mode  = items[STORAGE_KEY.EXTENSION_MODE];
      const radio = document.querySelector(`input[name="ext-mode"][value="${mode}"]`)
                 ?? document.getElementById("mode-reg");
      radio.checked = true;

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
