// shared/js/constants-base.js
//
// ============================================================================
// FRAMEWORK-LEVEL CONSTANTS shared by all Neon-CRM helper extensions.
// ============================================================================
//
// Loaded as a plain script BEFORE each extension's own js/constants.js.
// The extension's constants.js may add app-specific entries (CONDITION,
// EVENT_MATCH, additional ACTION / STORAGE_KEY values), but should never
// redefine anything here.
//
// Do not add import/export statements — this file is injected as a global.
// ============================================================================

// ── PAGE / ICON STATES ───────────────────────────────────────────────────
// Map directly to the colored icons (green/yellow/red) and to the CSS
// classes used in popup.css. Do not rename without updating both.

const STATE = {
  GREEN:  "green",
  YELLOW: "yellow",
  RED:    "red",
};

// ── EXTENSION MODE ──────────────────────────────────────────────────────
// Drives which popup flow the extension shows. Set on the options page
// and persisted in chrome.storage.local[STORAGE_KEY.EXTENSION_MODE].
// When no stored value exists, the popup defaults to EXTENSION_MODE.REG
// so existing installs keep the registration flow they had before.

const EXTENSION_MODE = {
  REG:   "reg",
  MERCH: "merch",
};

// ── chrome.storage.local KEYS USED BY THE SHARED ICON MACHINERY ──────────
// Keys here MUST be unique across all extensions that consume this file.
// Extension-specific keys (ATTENDEE, REGISTRATIONS, etc.) live in the
// extension's own js/constants.js and extend STORAGE_KEY at runtime.

const STORAGE_KEY = {
  MANAGEMENT_OVERRIDE: "managementOverride",
  PENDING_ICON_UPDATE: "pendingIconUpdate",
  REGISTRATION_ERROR:  "REGISTRATION_ERROR",
  EXTENSION_MODE:      "extensionMode",
};

// ── ERROR MESSAGE TEMPLATES ──────────────────────────────────────────────
// Generic templates surfaced by the popup. Extensions may add app-specific
// templates to this object from their own constants.js.

const ERROR_MESSAGES = {
  NO_VALID_EVENT: {
    title:  "No event found",
    detail: "We couldn't locate your current event. Please make sure you're viewing the correct account page.",
    action: "Try refreshing the page and clicking the extension icon again",
  },
  NO_SUCCEEDED_REGISTRATION: {
    title:  "No active registrations found",
    detail: "This attendee doesn't have any confirmed registrations for the current event.",
    action: "Verify the attendee is registered for this event in Neon",
  },
  NAVIGATION_FAILED: {
    title:  "Navigation error",
    detail: "We couldn't navigate to the registration page automatically.",
    action: "Navigate to the event registrations page manually and try again",
  },
  SCRIPT_INJECTION_FAILED: {
    title:  "Unable to read account data",
    detail: "The extension encountered a technical issue reading the page.",
    action: "Refresh the page and try clicking the extension icon again",
  },
  TIMEOUT: {
    title:  "Request took too long",
    detail: "The page didn't load quickly enough. This can happen if you're on a slow connection.",
    action: "Wait a moment and try again",
  },
  UNKNOWN_ERROR: {
    title:  "Something went wrong",
    detail: "An unexpected error occurred while processing your request.",
    action: "Try refreshing the page and try again. If the problem persists, contact IT",
  },
};

// ── DEBUG HELPER ─────────────────────────────────────────────────────────
// Cheap wrapper around console.log gated on CONFIG.debug (defined in each
// extension's config.js, which is loaded after this file).

function dbg(...args) {
  if (typeof CONFIG !== "undefined" && CONFIG.debug) console.log(...args);
}

// end shared/js/constants-base.js
