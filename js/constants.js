// js/constants.js

// ============================================================================
// Shared constants used across all extension scripts.
// Single source of truth for strings that appear in multiple files.
//
// NOTE: This file is injected as a plain script (not an ES module).
// Do not add import/export statements.
// ============================================================================

// ── PAGE / ICON STATES ───────────────────────────────────────────────────
// These map directly to the colored icons (green/yellow/red) and to the
// CSS classes used in popup.css. Do not rename without updating both.

const STATE = {
  GREEN:  "green",
  YELLOW: "yellow",
  RED:    "red",
};

// ── REGISTRATION STATUS VALUES ───────────────────────────────────────────
// Neon reports registration status as uppercase strings. We only care
// about SUCCEEDED right now, but additional values can be added here
// if we ever need to handle PENDING, REFUNDED, CANCELED, etc.

const REG_STATUS = {
  SUCCEEDED: "SUCCEEDED",
};

// ── MESSAGE ACTION NAMES ─────────────────────────────────────────────────
// Used as the `action` field in chrome.runtime.sendMessage / tabs.sendMessage
// calls between popup, background, and content scripts. Every cross-script
// message MUST use one of these constants — never raw strings.

const ACTION = {
  GET_ATTENDEE_DATA:          "Get Attendee Data",
  GET_REGISTRATIONS:          "Get Registrations Data",
  GET_ACCOUNT_DATA:           "Get Account Data",       // popup → accountPage.js
  INCREMENT_BADGE_COUNT:      "Increment Badge Count",
  HIGHLIGHT_ICE_FIELD:        "Highlight ICE Field",
  NAVIGATE_TO_EVENT_REG:      "Navigate To Event Reg",
  // Sent by attendeeContact.js right before submitting the check-in form.
  // background.js arms a one-shot redirect that fires when the resulting
  // eventRegDetails navigation commits — forcing the volunteer back to the
  // account search so the next check-in starts from a fresh lookup.
  ARM_POST_CHECKIN_REDIRECT:  "Arm Post Check-In Redirect",
};

// ── CHROME.STORAGE.LOCAL KEY NAMES ───────────────────────────────────────
// All keys we read/write in chrome.storage.local are listed here so we can
// search the codebase by key name and find every place that touches it.
//
// ATTENDEE / REGISTRATIONS / ACCOUNT — cached scrape results
// MANAGEMENT_OVERRIDE     — boolean toggle set by options page
// AGE_VERIFIED            — per-attendee flag set when staff confirms ID
// PENDING_ICON_UPDATE     — write here to wake the background service worker
// ACCOUNT_AUTO_NAV        — flag set by popup so accountPage knows to
//                           auto-click the first SUCCEEDED registration
// REGISTRATION_ERROR      — populated when a forwarding step fails
// NOTE_ACKNOWLEDGED       — set by popup when the volunteer dismisses the
//                           registration-note screen; cleared on popup reset

const STORAGE_KEY = {
  ATTENDEE:            "attendee",
  REGISTRATIONS:       "registrations",
  ACCOUNT:             "account",
  MANAGEMENT_OVERRIDE: "managementOverride",
  AGE_VERIFIED:        "ageVerified",
  PENDING_ICON_UPDATE: "pendingIconUpdate",
  ACCOUNT_AUTO_NAV:    "cvgAccountAutoNav",
  REGISTRATION_ERROR:  "REGISTRATION_ERROR",
  NOTE_ACKNOWLEDGED:   "noteAcknowledged",
};

// ── BLOCKING / WARNING CONDITION KEYS ────────────────────────────────────
// Keys for every blocking/warning condition. Used as keys in the reasons
// map produced by buildRegistrantState and getAttendeeInfo, and must match
// the keys in CONFIG.conditionOrder.
//
// Conditions marked fixableOnAttendeePage: true show a Re-check button in
// the popup because the staff member can resolve them on the AttendeeEdit
// form. NOT_PAID is the only red condition that cannot be fixed there.

const CONDITION = {
  WRONG_YEAR:       "wrongYear",
  WRONG_EVENT:      "wrongEvent",          // event name does not match config
  NOT_PAID:         "notPaid",
  REG_HOLD:         "regHold",
  ART_HOLD:         "artHold",
  OPS_HOLD:         "opsHold",
  ALREADY_ISSUED:   "alreadyIssued",
  UNKNOWN_TICKET:   "unknownTicket",
  INCORRECT_DAY:    "incorrectDay",
  NO_ACCOUNT_ID:    "noAccountId",
  NO_ATTENDEE_ID:   "noAttendeeId",
  NO_NAME:          "noName",
  MISSING_ICE:      "missingIce",
  AGE_VERIFICATION: "ageVerification",
  NAME_MISMATCH:    "nameMismatch",
};

// ── EVENT-NAME VALIDATION RESULT TYPES ───────────────────────────────────
// Returned by validateEventName() in registrations.js to indicate whether
// the page we're on is the real con event, a training/test event, or an
// event we don't recognise at all.

const EVENT_MATCH = {
  CURRENT:  "CURRENT",
  TEST:     "TEST",
  MISMATCH: "MISMATCH",
};

// ── ERROR MESSAGE TEMPLATES ──────────────────────────────────────────────
// User-friendly templates for errors surfaced in the popup. Every
// popup-displayed error MUST come from one of these keys — when an
// unrecognised key is passed, callers fall back to UNKNOWN_ERROR.
//
// Defined here (rather than in background.js or popup.js) so the service
// worker, content scripts, and popup all reference the same table. The
// service worker picks this up via importScripts("constants.js"); the
// popup and content scripts pick it up via the manifest content_scripts
// load order or the <script> tags in popup.html.

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
// Cheap wrapper around console.log gated on CONFIG.debug (defined in
// config.js, which is loaded before this file in every entry point).
// Use dbg(...) for chatty per-page-load tracing; keep console.error /
// console.warn for things the developer always wants to see.

function dbg(...args) {
  if (typeof CONFIG !== "undefined" && CONFIG.debug) console.log(...args);
}

// end js/constants.js