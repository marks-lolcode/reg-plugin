// config.js
// ╔══════════════════════════════════════════════════════════════════════╗
// ║ CONvergence Check-In Extension — ANNUAL CONFIGURATION               ║
// ║                                                                      ║
// ║ This is the ONLY file that needs to be edited each year.            ║
// ║ Search for "UPDATE EACH YEAR" to find every value that changes.     ║
// ║                                                                      ║
// ║ After changing the password, regenerate the hash using:             ║
// ║ tools/generate-password-hash.html (open locally in Chrome only)     ║
// ╚══════════════════════════════════════════════════════════════════════╝

const CONFIG = {

  // ── EVENT IDs ────────────────────────────────────────────────────────
  // How to find the current event ID:
  // 1. Log into Neon CRM and navigate to the current CONvergence event
  // 2. Look at the URL — find the number after "eventId=" or "query.eventId="
  // 3. Paste that number as currentEventId below
  //
  event: {
    currentEventId: "248",   // ← UPDATE EACH YEAR
    testEventId:    "142",   // ← CONvergence Training Event — do not change
  },

  // ── NEON CRM DOMAINS ─────────────────────────────────────────────────
  // Only update if Neon notifies you of a URL change (very rare).
  //
  neon: {
    productionDomain: "ce.app.neoncrm.com",
    trialDomain:      "trial.z2systems.com",
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
    { nameIncludes: "Adult", ticketLabel: "Adult", badgeImage: "ADULT.tif", requiresAgeCheck: true  },
    { nameIncludes: "Teen",  ticketLabel: "Teen",  badgeImage: "TEEN.tif",  requiresAgeCheck: false },
    { nameIncludes: "Youth", ticketLabel: "Youth", badgeImage: "CHILD.tif", requiresAgeCheck: false },
    { nameIncludes: "Child", ticketLabel: "Child", badgeImage: "KID.tif",   requiresAgeCheck: false },
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

  // ── NEON ATTENDEE FORM FIELD INDEXES ─────────────────────────────────
  // Neon stores custom fields as attendee.customDataList[N].value
  // These index numbers were verified against the live Neon form in 2026.
  //
  // IF FIELDS STOP WORKING: Go to the AttendeeEdit page, open DevTools
  // Console, and run the diagnostic in tools/find-field-indexes.html
  // to rediscover the correct index for each field. Then update below.
  //
  // ⚠ Do NOT change these unless Neon has reorganized their custom fields.
  //
  fieldIndexes: {
    registrationHold:    0,  // checkbox — "Registration Hold - Do Not Release"
    artShowHold:         1,  // checkbox — "Art Show Hold - Do Not Release"
    operationsHold:      2,  // checkbox — "Operations Hold - Do Not Release"
    // index 3 — "Guest Of Badge" checkbox, not used in check-in logic
    preferredName:       4,  // text — "Preferred Name"
    // index 5 — "Pronouns", not used in check-in logic
    nonTransferableName: 6,  // text — "Non-Transferable First and Last Name"
    // index 7 — "Badge Name", not used in check-in logic
    // index 8 — "Volunteering" checkbox, not used in check-in logic
    activeBadgeCount:    9,  // text — "Number of Active Badges"
    iceContact:         18,  // text — "In Case Of Emergency (Name and Phone)"
    // Pickup slots — each entry is a [dateIndex, timeIndex] pair
    pickupSlots: [
      [10, 11],  // Pickup Date 1 / Pickup Time 1
      [12, 13],  // Pickup Date 2 / Pickup Time 2
      [14, 15],  // Pickup Date 3 / Pickup Time 3
      [16, 17],  // Pickup Date 4 / Pickup Time 4
    ],
  },

  // ── HOLD FIELD MESSAGES ──────────────────────────────────────────────
  // Staff-facing messages when a hold is active.
  // Each hold entry has a title (shown bold in popup) and body (resolution instructions).
  // Order must match: [regHold, artShowHold, opsHold]
  // Update message text here if instructions to staff change.
  //
  holdMessages: [
    { title: "Registration Hold", body: "Review notes on account or contact Registration Head.\nDo not release badge." },
    { title: "Art Show Hold",     body: "Direct attendee to Art Show to pay, then return to Registration Help Desk.\nDo not release badge." },
    { title: "Operations Hold",   body: "Direct the attendee to Operations.\nDo not release badge." },
  ],

  // ── REQUIRED CHECK-IN FIELDS (Emergency Contact / ICE) ───────────────
  // Fields that must be non-empty before check-in can proceed.
  // labelText: shown to staff when the field is empty.
  // index: customDataList index — verified against live form 2026.
  //
  requiredFields: [
    { labelText: "In Case Of Emergency (Name and Phone)", index: 18 },
  ],

  // ── MANAGEMENT OVERRIDE PASSWORD ─────────────────────────────────────
  // Allows Help Desk staff to proceed past a red (blocked) status.
  //
  // IMPORTANT: Only a HASH of the password is stored here — never the
  // real password. This file is safe to commit to a public GitHub repo.
  //
  // To change the password each year:
  // 1. Open tools/generate-password-hash.html in Chrome (locally only —
  //    do NOT upload this file to GitHub)
  // 2. Type the new password and click Generate
  // 3. Copy the hash and paste it below, replacing the old value
  // 4. Share the real password with Help Desk staff verbally or via a
  //    password manager — not GitHub, not email, not Slack
  managementPasswordHash: "9c9487bdae4a2c3a76f8dcf5357e0793239d8742499340e83e0814130b6ccdee",  // ← UPDATE EACH YEAR

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
    { key: "incorrectDay",    fixableOnAttendeePage: false },
    { key: "unknownTicket",   fixableOnAttendeePage: false },
    { key: "noAccountId",     fixableOnAttendeePage: false },
    { key: "noAttendeeId",    fixableOnAttendeePage: false },
    { key: "noName",          fixableOnAttendeePage: false },
    { key: "nameMismatch",    fixableOnAttendeePage: false },
    { key: "ageVerification", fixableOnAttendeePage: true  },
    { key: "missingIce",      fixableOnAttendeePage: true  },
  ],

}; // end config.js