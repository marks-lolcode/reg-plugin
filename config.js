// config.js
// ╔══════════════════════════════════════════════════════════════════════╗
// ║ CONvergence Check-In Extension — ANNUAL CONFIGURATION                ║
// ║                                                                      ║
// ║ This is the ONLY file that needs to be edited each year.             ║
// ║ Search for "UPDATE EACH YEAR" to find every value that changes.      ║
// ║                                                                      ║
// ║ After changing the password, regenerate the hash using:              ║
// ║ tools/generate-password-hash.html (open locally in Chrome only)      ║
// ╚══════════════════════════════════════════════════════════════════════╝

const CONFIG = {

  // ── DEBUG LOGGING ────────────────────────────────────────────────────
  // Set true to enable verbose dbg() output across content scripts and
  // the service worker. console.error / console.warn are unaffected.
  // Leave false in production checkouts.
  debug: false,

  // ── EVENT NAMES ──────────────────────────────────────────────────────
  // The extension validates which event a registration belongs to by
  // matching the event name shown on the Neon page against these arrays.
  //
  // currentEventNames — the REAL con events for this year. Registrations
  //   for any of these will be treated as valid for check-in.
  //
  // testEventNames — training / test events. Registrations for these are
  //   also allowed (so you can practice the workflow), but they should
  //   NEVER include a real CONvergence year event.
  //
  // How to find the current event NAME:
  // 1. Log into Neon CRM and navigate to the current CONvergence event
  // 2. Copy the event name EXACTLY as it appears on the event page
  // 3. Paste it into currentEventNames below, one entry per event
  //
  event: {
    // UPDATE EACH YEAR: Replace these with the actual event names from Neon
    currentEventNames: [
      "CONvergence 2026: The Geek in the Machine",
      "CONvergence 2026 Dealers Spaces",
    ],
    testEventNames: [
      // "Testing Tickets",
      // "Testing Single Ticket Per Registration",
      // "Testing Family",
      // "TEST ONLY",
      // "Test NextGen",
      "CONvergence Example For Training Only",
    ],
  },

  // ── NEON CRM DOMAIN ──────────────────────────────────────────────────
  // The production Neon CRM hostname. Only update if Neon notifies you of
  // a URL change (very rare).
  //
  neon: {
    productionDomain: "ce.app.neoncrm.com",
  },

  // ── TICKET TYPE RULES ────────────────────────────────────────────────
  // Maps Neon ticket names to badge info and age-check requirements.
  // If Neon ticket names change, update "nameIncludes" to match exactly.
  //
  // Fields:
  //   nameIncludes     — word that appears in the Neon ticket name
  //   ticketLabel      — short label shown to staff in the popup
  //   badgeImage       — badge background image filename (.tif)
  //   requiresAgeCheck — if true, popup shows age verification reminder
  //                      and staff must verify ID against legal name
  ticketTypes: [
    { nameIncludes: "Adult",  ticketLabel: "Adult",  badgeImage: "ADULT.tif",  requiresAgeCheck: true  },
    { nameIncludes: "Teen",   ticketLabel: "Teen",   badgeImage: "TEEN.tif",   requiresAgeCheck: false },
    { nameIncludes: "Youth",  ticketLabel: "Youth",  badgeImage: "CHILD.tif",  requiresAgeCheck: false },
    { nameIncludes: "Child",  ticketLabel: "Child",  badgeImage: "KID.tif",    requiresAgeCheck: false },
    // Dealer Spaces registrations have no "Event Admission" ticket row on the page.
    // nameIncludes: "" matches when readTicketType() returns "" (no row found).
    // This prevents dealer attendees from being flagged as UNKNOWN_TICKET.
    { nameIncludes: "",       ticketLabel: "Dealer", badgeImage: "DEALER.tif", requiresAgeCheck: true  },
  ],

  // ── AGE VERIFICATION ─────────────────────────────────────────────────
  // Minimum age to be considered an adult. Cutoff date is calculated
  // automatically from today's date — no year to hardcode manually.
  //
  adultMinimumAge: 18,   // ← confirm each year (typically stays 18)

  // ── CON DAYS ─────────────────────────────────────────────────────────
  // Used to validate Day Pass tickets — must be used on the correct day.
  // Keys must match exactly how the day appears in the Neon ticket name.
  // Values: JS getDay() numbers — 0=Sun, 1=Mon, 4=Thu, 5=Fri, 6=Sat
  conDays: {
    "Thursday": 4,
    "Friday":   5,
    "Saturday": 6,
    "Sunday":   0,
  },

  // ── NEON ATTENDEE FORM FIELD LABELS ──────────────────────────────────
  // The extension finds custom fields dynamically by matching label text
  // (substring match). If Neon renames a label, update the matching value
  // below.
  //
  // ⚠ Three different fields all use the label "HOLD". The extension
  //   resolves these by position (first HOLD = registration, second = art
  //   show, third = operations). If Neon adds or removes HOLD-labeled
  //   fields, this assumption may break.
  //
  fieldLabels: {
    registrationHold:    "HOLD",
    artShowHold:         "HOLD",
    operationsHold:      "HOLD",
    iceContact:          "In Case Of Emergency",
    preferredName:       "Preferred Name",
    nonTransferableName: "Non-Transferable First and Last Name",
    activeBadgeCount:    "Number of Active Badges",
    pickupDateLabel:     "Pickup Date",
    pickupTimeLabel:     "Pickup Time",
  },

  // ── REQUIRED CHECK-IN FIELDS ─────────────────────────────────────────
  // Fields that must be non-empty before check-in can proceed.
  // labelText must match (or be a substring of) the field's label on the form.
  //
  requiredFields: [
    { labelText: "In Case Of Emergency" },
  ],

  // ── HOLD FIELD MESSAGES ──────────────────────────────────────────────
  // Staff-facing messages when a hold is active.
  // Each hold entry has a title (shown bold in popup) and body (resolution instructions).
  // Order must match: [regHold, artShowHold, opsHold]
  //
  holdMessages: [
    { title: "Registration Hold", body: "Review notes on account or contact Registration Head.\nDo not release badge." },
    { title: "Art Show Hold",     body: "Direct attendee to Art Show to pay, then return to Registration Help Desk.\nDo not release badge." },
    { title: "Operations Hold",   body: "Direct the attendee to Operations.\nDo not release badge." },
  ],

  // ── ATTENDEE PAGE MESSAGES ───────────────────────────────────────────
  // Staff-facing messages shown in the popup on the AttendeeEdit page.
  //
  attendeeMessages: {
    missingIce:      "MISSING EMERGENCY CONTACT\nPlease ask the attendee for their emergency contact information.\nFill it in on the form, then click Re-check.",
    ageVerification: "AGE VERIFICATION REQUIRED\nVerify ID matches legal name. Attendee must be {age} or older (DOB before {cutoff}).",
    alreadyIssued:   "ALREADY ISSUED\nThis badge was already issued. Please send attendee to Help Desk.",
    nameMismatch:    "NAME MISMATCH\nBadge was issued to a different person.\nPlease send attendee to Help Desk.",
    noAccountId:     "NO ACCOUNT ID\nPlease direct attendee to Help Desk.",
  },

  // ── MANAGEMENT OVERRIDE PASSWORD ─────────────────────────────────────
  // Allows Help Desk staff to proceed past a red (blocked) status.
  //
  // IMPORTANT: Only a salted PBKDF2-SHA256 HASH of the password is stored
  // here — never the real password. Format:
  //   pbkdf2-sha256$<iterations>$<saltHex>$<hashHex>
  // This file is safe to commit to a public GitHub repo: PBKDF2 makes the
  // hash expensive to brute-force, so use a STRONG production password.
  //
  // To change the password each year:
  // 1. Open tools/generate-password-hash.html in Chrome (from your local
  //    copy)
  // 2. Type the new password and click Generate
  // 3. Copy the full pbkdf2-sha256$... string and paste it below
  // 4. Share the real password with Help Desk staff verbally or via a
  //    password manager — not GitHub, not email, not Slack
  //
  // The committed default below is the HASH of the dev/test password only
  // (see CLAUDE.md). Leadership MUST regenerate this with a strong real
  // password before any production / Chrome Web Store release.
  managementPasswordHash: "pbkdf2-sha256$210000$70887f84385bb22373719ec1d6a6569a$f0522e07c60d1963d30748974968fa85da7e466188d8a12fcbd3ba0e1c5aac96",  // ← UPDATE EACH YEAR

  // ── CONDITION DISPLAY ORDER ──────────────────────────────────────────
  // Controls the order that blocking/warning conditions appear in the popup.
  // Each key must match a CONDITION constant in constants.js.
  //
  // fixableOnAttendeePage: true  → shows a Re-check button so staff can
  //                                resolve the issue on the Neon form without leaving the page.
  // fixableOnAttendeePage: false → no Re-check button; attendee must go
  //                                elsewhere (Help Desk, cashier, etc.) to resolve.
  //
  // To change display order, reorder entries. To add a new condition,
  // add its key to constants.js first, then add an entry here.
  //
  conditionOrder: [
    { key: "regHold",         fixableOnAttendeePage: false },
    { key: "artHold",         fixableOnAttendeePage: false },
    { key: "opsHold",         fixableOnAttendeePage: false },
    { key: "notPaid",         fixableOnAttendeePage: false },
    { key: "alreadyIssued",   fixableOnAttendeePage: false },
    { key: "wrongYear",       fixableOnAttendeePage: false },
    { key: "wrongEvent",      fixableOnAttendeePage: false },
    { key: "incorrectDay",    fixableOnAttendeePage: false },
    { key: "unknownTicket",   fixableOnAttendeePage: false },
    { key: "noAccountId",     fixableOnAttendeePage: false },
    { key: "noAttendeeId",    fixableOnAttendeePage: false },
    { key: "noName",          fixableOnAttendeePage: false },
    { key: "nameMismatch",    fixableOnAttendeePage: false },
    { key: "ageVerification", fixableOnAttendeePage: true  },
    { key: "missingIce",      fixableOnAttendeePage: true  },
  ],


  // ── MERCHANDISE PICKUP TRACKING ──────────────────────────────────────
  // Used by Merch mode (toggle on the options page). Each item describes:
  //   name              -- display name in the popup (e.g., "T-Shirt")
  //   source.type       -- "customField" or "session"
  //   source.label      -- (customField) substring of the custom field
  //                        label on the attendee form that signals the
  //                        attendee has this item. Item counts as
  //                        "included" if the field is non-empty.
  //   source.sessionName-- (session) substring of the Neon session name
  //                        the attendee must be registered for to qualify.
  //   pickupFieldLabel  -- substring of the Neon attendee form field
  //                        where this item's pickup date/time gets
  //                        written. Empty = not yet picked up. Non-empty
  //                        = already picked up (popup greys + locks the
  //                        checkbox and shows the recorded date/time).
  //
  // These fields don't exist in Neon yet -- update the substrings here
  // when the fields are created. The extension matches by label substring
  // exactly like CONFIG.fieldLabels does.
  //
  // UPDATE EACH YEAR: merch.items must match the Neon field labels and
  // not-ordered/ordered values configured on the registration form.
  merch: {
    items: [
      // T-Shirt -- single dropdown field with the size as the value.
      // matchMode "anyExcept" means: ordered if value is anything other
      // than notOrderedValue. When ordered, the field value IS the size
      // variant (e.g., "Unisex L", "Fitted S", "Kids XL") -- shown in popup.
      {
        name: "T-Shirt",
        source: {
          type: "customField",
          label: "Preorder your 2026 T-shirt",
          matchMode: "anyExcept",
          notOrderedValue: "Check the box then click to pick your shirt style and size",
        },
        pickupFieldLabel: "T-Shirt Picked Up",
      },
      // Souvenir Guide -- radio field with a yes/no-style choice.
      // matchMode "substring" means: ordered if the selected value
      // contains matchValue. Using a substring avoids dash-character
      // fragility (en-dash vs hyphen in the full label text).
      {
        name: "Souvenir Guide",
        source: {
          type: "customField",
          label: "Pre-order Souvenir Guide",
          matchMode: "substring",
          matchValue: "Reserve a free printed Guide",
        },
        pickupFieldLabel: "Guide Picked Up",
      },
    ],
  },

}; // end config.js