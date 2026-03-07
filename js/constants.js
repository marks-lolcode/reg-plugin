// js/constants.js

// Shared constants used across all extension scripts.
// Single source of truth for strings that appear in multiple files.
//
// NOTE: This file is injected as a plain script (not an ES module).
// Do not add import/export statements.

const STATE = {
  GREEN:  "green",
  YELLOW: "yellow",
  RED:    "red",
};

const REG_STATUS = {
  SUCCEEDED: "SUCCEEDED",
};

const ACTION = {
  GET_ATTENDEE_DATA:     "Get Attendee Data",
  GET_REGISTRATIONS:     "Get Registrations Data",
  INCREMENT_BADGE_COUNT: "Increment Badge Count",
  HIGHLIGHT_ICE_FIELD:   "Highlight ICE Field",
};

const STORAGE_KEY = {
  ATTENDEE:            "attendee",
  REGISTRATIONS:       "registrations",
  MANAGEMENT_OVERRIDE: "managementOverride",
  AGE_VERIFIED:        "ageVerified",
  // Written by content scripts to reliably wake the background service worker.
  PENDING_ICON_UPDATE: "pendingIconUpdate",
  NOTE_ACKNOWLEDGED:   "noteAcknowledged",
};

/**
 * Keys for every blocking/warning condition.
 * These are used as keys in the reasons map produced by buildRegistrantState
 * and getAttendeeInfo, and must match the keys in CONFIG.conditionOrder.
 *
 * Conditions marked fixableOnAttendeePage: true show a Re-check button in the
 * popup because the staff member can resolve them on the AttendeeEdit form.
 * NOT_PAID is the only red condition that cannot be fixed there.
 */
const CONDITION = {
  WRONG_YEAR:       "wrongYear",
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

// end js/constants.js
