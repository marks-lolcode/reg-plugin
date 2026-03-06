// js/registrations.js

// Content script for the Neon EventRegDetails page.
// Handles Steps 9–11: scrapes all attendee data and validates full
// check-in eligibility directly from this page, so blocked attendees
// never navigate to the AttendeeEdit page for regular staff.
//
// CONFIG, STATE, REG_STATUS, ACTION, STORAGE_KEY, CONDITION are injected
// as globals by the manifest. Do not add import statements.
//
// Injected by manifest on: /np/admin/event/eventRegDetails.do

// ── TRIGGER ICON UPDATE ON PAGE LOAD ──────────────────────────────────

(async function triggerIconUpdate() {
  const data = getRegistrationsInfo();
  await chrome.storage.local.set({ [STORAGE_KEY.REGISTRATIONS]: { data } });
  await chrome.storage.local.set({ [STORAGE_KEY.PENDING_ICON_UPDATE]: { page: "registrations", ts: Date.now() } });
  console.log("registrations.js: wrote registration data and triggered icon update");
})();

// ── MESSAGE LISTENER ───────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === ACTION.GET_REGISTRATIONS) {
    sendResponse({ data: getRegistrationsInfo() });
  }
});

// ── PAGE-LEVEL HELPERS ─────────────────────────────────────────────────

function getRegStatus() {
  return Array.from(document.querySelectorAll("font"))
    .map(f => f.textContent.trim())
    .find(t => t.length > 0 && t === t.toUpperCase() && t.length < 30)
    ?? "";
}

function getEventId() {
  const eventLink = document.querySelector(".contentHeader a");
  const eventHref = eventLink?.getAttribute("href") ?? "";
  return new URLSearchParams(eventHref.split("?")[1] ?? "").get("id") ?? "";
}

// ── PER-ATTENDEE HELPERS ───────────────────────────────────────────────

function readField(fieldsTable, labelText) {
  if (!fieldsTable) return "";
  for (const td of fieldsTable.querySelectorAll("td.viewLabel")) {
    if (td.childNodes[0]?.textContent?.trim().startsWith(labelText)) {
      return td.querySelector("span.viewField")?.textContent?.trim() ?? "";
    }
  }
  return "";
}

function findFieldsTable(textSmallTd) {
  let row = textSmallTd.closest("tr")?.nextElementSibling;
  while (row) {
    if (row.querySelector("td.textSmall")) break;
    const nestedTable = row.querySelector("table");
    if (nestedTable) {
      const firstLabel = nestedTable.querySelector("td.viewLabel");
      if (firstLabel?.textContent?.includes("Registration Hold")) return nestedTable;
    }
    row = row.nextElementSibling;
  }
  return null;
}

function readTicketType(textSmallTd) {
  let row   = textSmallTd.closest("tr")?.nextElementSibling;
  let steps = 0;
  while (row && steps < 20) {
    if (row.querySelector("td.textSmall")) break;
    const label = row.querySelector("td.viewLabel");
    if (label?.textContent?.includes("Event Admission")) {
      const raw   = label.textContent.trim().replace(/\s+/g, " ");
      const match = raw.match(/\((.+)\)\s*$/);
      return match ? match[1].trim() : raw;
    }
    row = row.nextElementSibling;
    steps++;
  }
  return "";
}

// ── DATE HELPERS ───────────────────────────────────────────────────────

function adultCutoffDateString() {
  const today  = new Date();
  const cutoff = new Date(today.getFullYear() - CONFIG.adultMinimumAge, today.getMonth(), today.getDate());
  return cutoff.toLocaleDateString();
}

// ── TICKET HELPERS ─────────────────────────────────────────────────────

function resolveTicketConfig(ticketTypeName) {
  return CONFIG.ticketTypes.find(t => ticketTypeName.includes(t.nameIncludes))
    ?? { ticketLabel: "Unknown", badgeImage: "NONE.tif", requiresAgeCheck: false };
}

function validateDayPass(ticketTypeName) {
  const dayName = Object.keys(CONFIG.conDays).find(d => ticketTypeName.includes(d));
  if (!dayName || new Date().getDay() !== CONFIG.conDays[dayName]) {
    return { valid: false };
  }
  return { valid: true };
}

// ── MAIN SCRAPE FUNCTION ───────────────────────────────────────────────

function getRegistrationsInfo() {
  console.log("getRegistrationsInfo: scraping registration page");

  const eventId   = getEventId();
  const regStatus = getRegStatus();
  console.log(`Event ID: ${eventId} | Reg Status: ${regStatus}`);

  const attendeeRows = document.querySelectorAll("td.textSmall");
  if (attendeeRows.length === 0) {
    console.warn("getRegistrationsInfo: no attendee rows found");
    return [{
      accountId:             "",
      neonAttendeeId:        "",
      legalName:             "Page Error",
      preferredName:         "",
      state:                 STATE.RED,
      reasons:               [{ key: null, text: "Could not read attendee data from this page. The Neon page structure may have changed — please contact Registration Head.", fixable: false }],
      missingRequiredFields: [],
    }];
  }

  const results = Array.from(attendeeRows).map((td, i) => {
    const editLink       = td.querySelector("a[href*='attendeeEdit']");
    const editHref       = editLink?.getAttribute("href") ?? "";
    const neonAttendeeId = new URLSearchParams(editHref.split("?")[1] ?? "").get("id") ?? "";

    let accountId = "";
    let legalName = "";
    let row       = td.closest("tr")?.nextElementSibling;
    let steps     = 0;
    while (row && steps < 5) {
      const anchor = row.querySelector("td.viewField a");
      if (anchor) {
        const href = anchor.getAttribute("href") ?? "";
        accountId  = new URLSearchParams(href.split("?")[1] ?? "").get("id") ?? "";
        legalName  = anchor.textContent.trim();
        break;
      }
      row = row.nextElementSibling;
      steps++;
    }

    const ticketTypeName = readTicketType(td);
    const fieldsTable    = findFieldsTable(td);

    const preferredName   = readField(fieldsTable, "Preferred Name");
    const activeBadgesRaw = readField(fieldsTable, "Number of Active Badges");
    const activeBadges    = activeBadgesRaw === "" ? 0 : parseInt(activeBadgesRaw, 10);
    const iceContact      = readField(fieldsTable, "In Case Of Emergency");
    const regHold         = readField(fieldsTable, "Registration Hold") === "HOLD";
    const artHold         = readField(fieldsTable, "Art Show Hold")      === "HOLD";
    const opsHold         = readField(fieldsTable, "Operations Hold")    === "HOLD";

    console.log(`Attendee ${i}: ${legalName} | accountId: ${accountId} | ticket: ${ticketTypeName} | badges: ${activeBadges}`);

    return buildRegistrantState({
      accountId, neonAttendeeId, legalName, preferredName,
      ticketTypeName, regStatus, eventId,
      activeBadges, iceContact,
      regHold, artHold, opsHold,
    });
  });

  console.log(`Processed ${results.length} attendee(s)`);
  return results;
}

// ── BUILD REGISTRANT STATE ─────────────────────────────────────────────

/**
 * Evaluates ALL conditions and collects them into a conditionsMap keyed by
 * CONDITION constant. The map is then sorted by CONFIG.conditionOrder to
 * produce the `reasons` array shown in the popup, so every problem is
 * visible at once rather than only the last one that fired.
 *
 * `state` is determined by the worst triggered condition:
 *   any red condition  → RED
 *   any yellow + no red → YELLOW
 *   none               → GREEN
 */
function buildRegistrantState({
  accountId, neonAttendeeId, legalName, preferredName,
  ticketTypeName, regStatus, eventId,
  activeBadges, iceContact,
  regHold, artHold, opsHold,
}) {
  const ticketConfig = resolveTicketConfig(ticketTypeName);
  const isDayPass    = ticketTypeName.includes("Day Pass");
  const adultCutoff  = adultCutoffDateString();

  // Collect every triggered condition: key → { text, isRed }
  // Red conditions block check-in; yellow conditions are warnings.
  const conditionsMap = {};

  // ── Ticket-type conditions ──
  if (ticketConfig.ticketLabel === "Unknown") {
    conditionsMap[CONDITION.UNKNOWN_TICKET] = {
      text:  "UNKNOWN TICKET TYPE\nPlease review and see a Sub or Co Head for assistance.",
      isRed: true,
    };
  }

  if (isDayPass && !validateDayPass(ticketTypeName).valid) {
    conditionsMap[CONDITION.INCORRECT_DAY] = {
      text:  "INCORRECT DAY\nDay Pass purchased for a different day than today. Please send attendee to Help Desk.",
      isRed: true,
    };
  }

  if (ticketConfig.requiresAgeCheck && !conditionsMap[CONDITION.INCORRECT_DAY]) {
    conditionsMap[CONDITION.AGE_VERIFICATION] = {
      text:  `AGE VERIFICATION REQUIRED\nVerify ID matches legal name. Attendee must be ${CONFIG.adultMinimumAge} or older (DOB before ${adultCutoff}).`,
      isRed: false,
    };
  }

  // ── Blocking conditions ──
  if (eventId !== CONFIG.event.testEventId && eventId !== CONFIG.event.currentEventId) {
    conditionsMap[CONDITION.WRONG_YEAR] = {
      text:  "WRONG YEAR — This registration is not for this year's CONvergence, or it is for a Dealer/Artist. If Dealer/Artist, send to Help Desk. Otherwise click back and select the attendee's current registration.",
      isRed: true,
    };
  }

  if (regStatus !== REG_STATUS.SUCCEEDED) {
    conditionsMap[CONDITION.NOT_PAID] = {
      text:  "NOT PAID\nThis badge has not been paid for. Please direct attendee to cashier.",
      isRed: true,
    };
  }

  if (activeBadges > 0) {
    conditionsMap[CONDITION.ALREADY_ISSUED] = {
      text:  "ALREADY ISSUED\nThis badge was already issued. Please send attendee to Help Desk.",
      isRed: true,
    };
  }

  if (regHold) {
    conditionsMap[CONDITION.REG_HOLD] = { text: CONFIG.holdMessages[0].title + "\n" + CONFIG.holdMessages[0].body, isRed: true };
  }
  if (artHold) {
    conditionsMap[CONDITION.ART_HOLD] = { text: CONFIG.holdMessages[1].title + "\n" + CONFIG.holdMessages[1].body, isRed: true };
  }
  if (opsHold) {
    conditionsMap[CONDITION.OPS_HOLD] = { text: CONFIG.holdMessages[2].title + "\n" + CONFIG.holdMessages[2].body, isRed: true };
  }

  if (!accountId) {
    conditionsMap[CONDITION.NO_ACCOUNT_ID] = {
      text:  "NO ACCOUNT ID — Please direct attendee to Help Desk.",
      isRed: true,
    };
  }
  if (!neonAttendeeId) {
    conditionsMap[CONDITION.NO_ATTENDEE_ID] = {
      text:  "NO ATTENDEE ID — Please direct attendee to Help Desk.",
      isRed: true,
    };
  }
  if (!legalName) {
    conditionsMap[CONDITION.NO_NAME] = {
      text:  "NO NAME — Please direct attendee to Help Desk.",
      isRed: true,
    };
  }

  // ── Missing ICE — yellow unless a red condition is already present ──
  if (!iceContact) {
    conditionsMap[CONDITION.MISSING_ICE] = {
      text:  "MISSING EMERGENCY CONTACT\nPlease ask the attendee for their emergency contact information.\nYou can fill it in after clicking Check In →",
      isRed: false,
    };
  }

  // ── Determine overall state ──
  const hasRed    = Object.values(conditionsMap).some(c => c.isRed);
  const hasYellow = Object.values(conditionsMap).some(c => !c.isRed);
  const state     = hasRed ? STATE.RED : hasYellow ? STATE.YELLOW : STATE.GREEN;

  // ── Sort by CONFIG.conditionOrder and build reasons array ──
  // Each reason carries whether it can be re-checked on the AttendeeEdit page.
  const reasons = CONFIG.conditionOrder
    .filter(entry => conditionsMap[entry.key])
    .map(entry => ({
      key:     entry.key,
      text:    conditionsMap[entry.key].text,
      isRed:   conditionsMap[entry.key].isRed,
      fixable: entry.fixableOnAttendeePage,
    }));

  // Also include any conditions not listed in conditionOrder (safety net)
  for (const [key, cond] of Object.entries(conditionsMap)) {
    if (!reasons.find(r => r.key === key)) {
      reasons.push({ key, text: cond.text, isRed: cond.isRed, fixable: false });
    }
  }

  const missingIce = !!conditionsMap[CONDITION.MISSING_ICE];
  console.log(`  → state: ${state} | conditions: ${reasons.map(r => r.key).join(", ") || "none"}`);

  return {
    accountId,
    neonAttendeeId,
    attendeeId:            accountId,
    legalName,
    preferredName,
    badgeImage:            ticketConfig.badgeImage,
    ticket:                `${ticketConfig.ticketLabel}${isDayPass ? " Day Pass" : " Weekend"}`,
    activeBadges,
    regStatus,
    state,
    reasons,
    missingRequiredFields: missingIce ? ["In Case Of Emergency (Name and Phone)"] : [],
  };
}

// end js/registrations.js
