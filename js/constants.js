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

const STORAGE_KEY = {
  ATTENDEE:            "attendee",
  REGISTRATIONS:       "registrations",
  ACCOUNT:             "account",
  MANAGEMENT_OVERRIDE: "managementOverride",
  AGE_VERIFIED:        "ageVerified",
  PENDING_ICON_UPDATE: "pendingIconUpdate",
  ACCOUNT_AUTO_NAV:    "cvgAccountAutoNav",
  REGISTRATION_ERROR:  "REGISTRATION_ERROR",
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

// end js/constants.js