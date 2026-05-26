// js/attendeeContact.js
// ============================================================================
// CONvergence Check-In Extension — Attendee Edit Page Script
// ============================================================================
//
// Content script for the Neon AttendeeEdit page (/np/admin/event/attendeeEdit.do).
// Handles two responsibilities:
//
//   1. READING: Scrapes the form to build an attendee state object (name,
//      ticket type, holds, ICE contact, active badges, etc.) and validates
//      check-in eligibility. Result is stored in chrome.storage.local for
//      the popup to display.
//
//   2. WRITING: When the popup sends INCREMENT_BADGE_COUNT, writes the
//      pickup date/time, increments the active badge count, writes the
//      non-transferable name, and submits the form.
//
// SUPPORTS TWO EVENT LAYOUTS:
//
//   Standard CONvergence event:
//     - Hold fields at indexes 0, 1, 2 (Reg, Art, Ops) in that order
//     - ICE label: "In Case Of Emergency (Name and Phone)"  (CONFIG.fieldLabels.iceContact)
//     - Preferred name field present
//
//   Dealer Spaces event:
//     - Hold fields at indexes 22, 23, 24 (Art, Ops, Reg) — DIFFERENT ORDER
//     - ICE label: "Badge: Emergency Contact"
//     - No preferred name field; name comes from "Badge: First Name" / "Badge: Last Name"
//
//   buildFieldIndex() handles both layouts by matching holds against their
//   parent form-group label text (e.g., "Registration Hold - Do Not Release")
//   rather than by their position among HOLD-labeled checkboxes. This is
//   robust to any field order in any event.
//
// CONFIG, STATE, ACTION, STORAGE_KEY, CONDITION are injected as globals
// by the manifest. Do not add import statements.
// ============================================================================

// ── TRIGGER ICON UPDATE ON PAGE LOAD ──────────────────────────────────────

(async function triggerIconUpdate() {
  const data = await getAttendeeInfo();
  await chrome.storage.local.set({ [STORAGE_KEY.ATTENDEE]: data });
  await chrome.storage.local.set({ [STORAGE_KEY.PENDING_ICON_UPDATE]: { page: "attendee", ts: Date.now() } });
  console.log("attendeeContact.js: wrote attendee data and triggered icon update");

  // Auto-highlight fields causing red (blocking) conditions
  const redReasons = data.reasons?.filter(r => r.isRed) ?? [];
  if (redReasons.length > 0) {
    console.log("attendeeContact.js: red conditions present, will highlight red fields after delay");
    setTimeout(() => highlightRedConditionFields(data), 1200);
  }

  // Auto-highlight the ICE field if it is empty — no button press needed.
  if (data.missingRequiredFields && data.missingRequiredFields.length > 0) {
    console.log("attendeeContact.js: ICE field missing, will highlight after delay");
    setTimeout(() => highlightICEField(true), 1200);
  }
})();

// ── MESSAGE LISTENER ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === ACTION.GET_ATTENDEE_DATA) {
    getAttendeeInfo().then(sendResponse);
    return true; // async response
  }
  if (request.action === ACTION.INCREMENT_BADGE_COUNT) {
    sendResponse(incrementBadge());
  }
  if (request.action === ACTION.HIGHLIGHT_ICE_FIELD) {
    highlightICEField();
    sendResponse({ ok: true });
  }
});

// ── DYNAMIC FIELD INDEX BUILDER ───────────────────────────────────────────

/**
 * Walks every customDataList input on the page and maps field index → label.
 * Returns a FIELD map used by all subsequent read/write operations.
 *
 * KEY DESIGN: Holds are matched by the text of their parent .form-group label
 * (e.g. "Registration Hold - Do Not Release"), NOT by their position among
 * HOLD-labeled checkboxes. This handles both the standard event (holds at
 * indexes 0/1/2) and the dealer event (holds at indexes 24/22/23 in a
 * different order).
 *
 * ICE contact is matched first by the configured label (CONFIG.fieldLabels.iceContact),
 * then by the dealer fallback ("Badge: Emergency Contact"). Whichever matches
 * first wins.
 *
 * Preferred name is matched by CONFIG.fieldLabels.preferredName. On dealer
 * pages this will not be found; getAttendeeInfo() falls back to "Badge: First
 * Name" in that case.
 */
function buildFieldIndex() {
  const labels = CONFIG.fieldLabels;
  const index  = {};

  // ── Build index → label map by reading each input's parent label ──
  const labelByIndex = {};

  const customInputs = document.querySelectorAll("[name^='attendee.customDataList[']");
  console.log("attendeeContact.js: found", customInputs.length, "customDataList inputs");
  if (customInputs.length === 0) {
    console.warn("attendeeContact.js: no customDataList inputs found");
    console.log("All inputs on page:", document.querySelectorAll("input").length);
    console.log("Sample input names:", Array.from(document.querySelectorAll("input")).slice(0, 5).map(el => el.getAttribute("name")));
  }

  document.querySelectorAll("[name^='attendee.customDataList[']").forEach(el => {
    const m = el.getAttribute("name").match(/\[(\d+)\]/);
    if (!m) return;
    const idx = parseInt(m[1], 10);
    if (idx in labelByIndex) return; // already mapped (multi-option fields appear multiple times)

    let labelTxt = "";

    // Strategy 1: .form-group parent → label.col-xs-4 (the standard Neon layout)
    // This is the most reliable approach and handles the dealer page correctly because
    // the form-group label says "Registration Hold - Do Not Release" even though the
    // checkbox itself is just labeled "HOLD".
    const formGroup = el.closest(".form-group");
    if (formGroup) {
      const groupLabel = formGroup.querySelector("label");
      labelTxt = groupLabel?.textContent?.trim() ?? "";
    }

    // Strategy 2: label[for] attribute
    if (!labelTxt) {
      const fieldId  = el.getAttribute("id");
      if (fieldId) {
        const labelEl = document.querySelector(`label[for="${fieldId}"]`);
        labelTxt = labelEl?.textContent?.trim() ?? "";
      }
    }

    // Strategy 3: Walk up to tr and find label
    if (!labelTxt) {
      const row     = el.closest("tr");
      const labelEl = row?.querySelector("label, [class*='Label'], [class*='label']");
      labelTxt = labelEl?.textContent?.trim() ?? "";
    }

    // Strategy 4: Preceding sibling element text
    if (!labelTxt) {
      const parent    = el.closest("div, td, li, span");
      const prevLabel = parent?.previousElementSibling;
      labelTxt = prevLabel?.textContent?.trim() ?? "";
    }

    // Strategy 5: Parent text (last resort)
    if (!labelTxt) {
      const parent = el.parentElement;
      labelTxt = parent?.textContent?.trim() ?? "";
      if (labelTxt && labelTxt.length > 100) {
        labelTxt = labelTxt.split("\n")[0].trim();
      }
    }

    if (labelTxt) {
      labelByIndex[idx] = labelTxt;
      console.log(`attendeeContact.js: field[${idx}] label: "${labelTxt.substring(0, 80)}"`);
    }
  });

  console.log("attendeeContact.js: field label map:", labelByIndex);

  // ── Match holds by parent label text (NOT by position) ──
  // The parent .form-group label clearly identifies which hold is which,
  // regardless of their index position. This handles both:
  //   Standard: Registration(0), Art(1), Operations(2)
  //   Dealer:   Art(22), Operations(23), Registration(24)
  //
  // holdMessages titles: [0]="Registration Hold", [1]="Art Show Hold", [2]="Operations Hold"
  const REG_TITLE = CONFIG.holdMessages[0].title; // "Registration Hold"
  const ART_TITLE = CONFIG.holdMessages[1].title; // "Art Show Hold"
  const OPS_TITLE = CONFIG.holdMessages[2].title; // "Operations Hold"

  for (const [idxStr, lbl] of Object.entries(labelByIndex)) {
    const idx = parseInt(idxStr, 10);
    if (lbl.includes(REG_TITLE)) {
      index.registrationHold = idx;
      console.log(`attendeeContact.js: registrationHold matched by label at index ${idx}`);
    } else if (lbl.includes(ART_TITLE)) {
      index.artShowHold = idx;
      console.log(`attendeeContact.js: artShowHold matched by label at index ${idx}`);
    } else if (lbl.includes(OPS_TITLE)) {
      index.operationsHold = idx;
      console.log(`attendeeContact.js: operationsHold matched by label at index ${idx}`);
    }
  }

  if (index.registrationHold == null || index.artShowHold == null || index.operationsHold == null) {
    console.warn(`attendeeContact.js: not all holds matched — reg:${index.registrationHold} art:${index.artShowHold} ops:${index.operationsHold}`);
  }

  // ── Match ICE contact ──
  // Try the configured label first (standard event), then the dealer fallback.
  const iceStandard = Object.entries(labelByIndex).find(([, lbl]) => lbl.includes(labels.iceContact));
  const iceDealer   = Object.entries(labelByIndex).find(([, lbl]) => lbl.includes("Badge: Emergency Contact"));
  const iceMatch    = iceStandard ?? iceDealer;

  if (iceMatch) {
    index.iceContact = parseInt(iceMatch[0], 10);
    console.log(`attendeeContact.js: iceContact matched at index ${index.iceContact} (label: "${iceMatch[1]}")`);
  } else {
    console.warn(`attendeeContact.js: iceContact field not found (tried "${labels.iceContact}" and "Badge: Emergency Contact")`);
  }

  // ── Match all remaining named fields from CONFIG.fieldLabels ──
  const SKIP = new Set([
    "registrationHold", "artShowHold", "operationsHold",
    "iceContact",       // handled above
    "pickupDateLabel", "pickupTimeLabel", // handled below
  ]);

  for (const [role, searchText] of Object.entries(labels)) {
    if (SKIP.has(role)) continue;
    const found = Object.entries(labelByIndex).find(([, lbl]) => lbl.includes(searchText));
    if (found) {
      index[role] = parseInt(found[0], 10);
      console.log(`attendeeContact.js: matched role "${role}" (search="${searchText}") → index ${index[role]}`);
    } else {
      console.warn(`attendeeContact.js: field not found for role "${role}" (searching for "${searchText}")`);
    }
  }

  // ── Build pickup slot pairs ──
  const dateLabel = labels.pickupDateLabel ?? "Pickup Date";
  const timeLabel = labels.pickupTimeLabel ?? "Pickup Time";

  const dateEntries = Object.entries(labelByIndex)
    .filter(([, lbl]) => lbl.includes(dateLabel))
    .sort(([a], [b]) => parseInt(a) - parseInt(b));

  const timeEntries = Object.entries(labelByIndex)
    .filter(([, lbl]) => lbl.includes(timeLabel))
    .sort(([a], [b]) => parseInt(a) - parseInt(b));

  if (dateEntries.length === 0 && timeEntries.length > 0) {
    console.warn("attendeeContact.js: pickup date labels not found, inferring date index as timeIndex - 1");
    index.pickupSlots = timeEntries.map(([timeIdx]) => [parseInt(timeIdx) - 1, parseInt(timeIdx)]);
  } else {
    index.pickupSlots = dateEntries.map(([dateIdx], i) => {
      const timeIdx = timeEntries[i] ? parseInt(timeEntries[i][0], 10) : null;
      return [parseInt(dateIdx, 10), timeIdx];
    }).filter(([, t]) => t !== null);
  }

  console.log("attendeeContact.js: resolved field indexes:", index);
  return index;
}

// Build field index once on page load and cache it for this session.
const FIELD = buildFieldIndex();

// ── FIELD ACCESS HELPERS ───────────────────────────────────────────────────

/**
 * Returns the input/textarea element for a customDataList .value field by index.
 */
function customField(index) {
  return document.querySelector(`[name="attendee.customDataList[${index}].value"]`);
}

/**
 * Returns the input element for a named field role (e.g. "iceContact").
 */
function customFieldByRole(role) {
  const idx = FIELD[role];
  if (idx == null) return null;
  return customField(idx);
}

/**
 * Returns the trimmed string value of a named field, or "" if not found.
 */
function customFieldValue(role) {
  return customFieldByRole(role)?.value?.trim() ?? "";
}

/**
 * Returns the checkbox element for a hold field (uses .optionIds not .value).
 */
function customCheckboxByRole(role) {
  const idx = FIELD[role];
  if (idx == null) return null;
  return document.querySelector(`[name="attendee.customDataList[${idx}].optionIds"]`);
}

/**
 * Reads a label element's adjacent sibling text. Used for reading
 * registration status and attendee ID from the form header area.
 */
function readLabelSiblingText(labelText) {
  const label = Array.from(document.querySelectorAll("label"))
    .find(l => l.textContent.trim().startsWith(labelText));
  const sibling = label?.nextElementSibling;
  return (sibling?.querySelector("label") ?? sibling)?.textContent?.trim() ?? "";
}

// ── DATE / TIME HELPERS ───────────────────────────────────────────────────

/**
 * Returns the adult age-cutoff date as a localised string.
 */
function adultCutoffDateString() {
  const today  = new Date();
  const cutoff = new Date(today.getFullYear() - CONFIG.adultMinimumAge, today.getMonth(), today.getDate());
  return cutoff.toLocaleDateString();
}

/**
 * Formats a Date as MM/DD/YYYY for writing into Neon's date fields.
 */
function formattedDate(date) {
  return [
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    date.getFullYear(),
  ].join("/");
}

// ── DEALER-SPECIFIC FIELD HELPERS ─────────────────────────────────────────

/**
 * Reads the badge display name for dealer attendees.
 * On the dealer attendee edit page, the badge name is stored in two separate
 * fields ("Badge: First Name" and "Badge: Last Name") rather than a single
 * "Preferred Name" field. This function reads both and combines them.
 *
 * Returns "" if neither field is found (non-dealer page).
 */
function readDealerBadgeName() {
  const first = Object.entries(FIELD).find(([role]) => role === "dealerBadgeFirst");
  const last  = Object.entries(FIELD).find(([role]) => role === "dealerBadgeLast");

  // We don't store these in FIELD by default — read by label scan instead
  let firstName = "";
  let lastName  = "";

  document.querySelectorAll("[name^='attendee.customDataList[']").forEach(el => {
    const m = el.getAttribute("name").match(/\[(\d+)\]/);
    if (!m) return;
    const formGroup = el.closest(".form-group");
    const lbl = formGroup?.querySelector("label")?.textContent?.trim() ?? "";
    if (lbl === "Badge: First Name")  firstName = el.value?.trim() ?? "";
    if (lbl === "Badge: Last Name")   lastName  = el.value?.trim() ?? "";
  });

  if (firstName || lastName) {
    return `${firstName} ${lastName}`.trim();
  }
  return "";
}

// ── SCRAPE ATTENDEE DATA ───────────────────────────────────────────────────

/**
 * Main scraper. Reads the current Neon AttendeeEdit form and returns a
 * full attendee state object for the popup to render.
 *
 * Merges conditions from the registration page (stored by registrations.js)
 * with fresh conditions scraped from this form. This allows conditions like
 * WRONG_EVENT (detected on the registration page) to carry forward to the
 * attendee view without being lost.
 */
async function getAttendeeInfo() {
  console.log("getAttendeeInfo: scraping attendee page");

  // ── Read stored data from registrations page ──
  const stored        = await chrome.storage.local.get(STORAGE_KEY.ATTENDEE);
  const storedAttendee = stored[STORAGE_KEY.ATTENDEE] ?? {};
  const storedReasons  = storedAttendee.reasons ?? [];

  // ── Read management override status ──
  const overrideResult     = await chrome.storage.local.get(STORAGE_KEY.MANAGEMENT_OVERRIDE);
  const managementOverride = overrideResult[STORAGE_KEY.MANAGEMENT_OVERRIDE] ?? false;

  // ── Scrape this page ──
  const accountId      = new URL(window.location.href).searchParams.get("acct");
  const neonAttendeeId = readLabelSiblingText("Attendee ID");
  const regStatus      = readLabelSiblingText("Registration Status");

  const firstName = document.getElementsByName("attendee.firstName")[0]?.value?.trim() ?? "";
  const lastName  = document.getElementsByName("attendee.lastName")[0]?.value?.trim()  ?? "";
  const registrantName = `${firstName} ${lastName}`.trim();

  // Resolve ticket type first — needed to determine dealer vs standard name logic.
  const ticketSelect   = document.getElementById("ticketPackageId");
  const ticketTypeName = ticketSelect?.options[ticketSelect.selectedIndex]?.text ?? "";
  // Two-pass: specific nameIncludes first, then empty-string catch-all (Dealer).
  const ticketConfig = CONFIG.ticketTypes.find(t => t.nameIncludes !== "" && ticketTypeName.includes(t.nameIncludes))
    ?? CONFIG.ticketTypes.find(t => t.nameIncludes === "")
    ?? { ticketLabel: "Unknown", badgeImage: "NONE.tif", requiresAgeCheck: false };
  console.log(`getAttendeeInfo: ticket select text="${ticketTypeName}" → label="${ticketConfig.ticketLabel}"`);

  // For dealer attendees, firstName/lastName on the form are the business owner's name.
  // The actual badge holder is identified by "Badge: First Name" / "Badge: Last Name".
  // Use badge name as legalName for dealers; fall back to registrant name for all others.
  const dealerBadge = readDealerBadgeName();
  const legalName   = (ticketConfig.ticketLabel === "Dealer" && dealerBadge)
    ? dealerBadge
    : registrantName;
  console.log(`getAttendeeInfo: legalName="${legalName}" (registrantName="${registrantName}", dealerBadge="${dealerBadge || "none"}")`);

  // Preferred name: configured field → dealer badge first name → registrant first name.
  const preferredName = customFieldValue("preferredName")
    || (ticketConfig.ticketLabel === "Dealer" ? dealerBadge.split(" ")[0] : "")
    || firstName;

  const activeBadgesRaw = customFieldValue("activeBadgeCount");
  const activeBadges    = activeBadgesRaw === "" ? 0 : parseInt(activeBadgesRaw, 10);
  const isDayPass    = ticketTypeName.includes("Day Pass");
  const adultCutoff  = adultCutoffDateString();

  const iceContact = customFieldValue("iceContact");
  console.log(`getAttendeeInfo: iceContact field index=${FIELD.iceContact}, value="${iceContact ? "present" : "MISSING"}"`);

  // Hold checkboxes — checked when the checkbox is ticked
  const regHold = customCheckboxByRole("registrationHold")?.checked === true;
  const artHold = customCheckboxByRole("artShowHold")?.checked === true;
  const opsHold = customCheckboxByRole("operationsHold")?.checked === true;
  console.log(`getAttendeeInfo: holds — reg:${regHold} art:${artHold} ops:${opsHold}`);

  // ── Conditions that can only be detected fresh on this page ──
  // These override or add to anything stored from the registration page.
  const attendeePageKeys = new Set([
    CONDITION.NO_ACCOUNT_ID,
    CONDITION.NAME_MISMATCH,
    CONDITION.ALREADY_ISSUED,
    CONDITION.AGE_VERIFICATION,
    CONDITION.MISSING_ICE,
    CONDITION.REG_HOLD,
    CONDITION.ART_HOLD,
    CONDITION.OPS_HOLD,
    CONDITION.NOT_PAID,
  ]);

  const freshConditions = {};

  if (!accountId) {
    freshConditions[CONDITION.NO_ACCOUNT_ID] = {
      text:  CONFIG.attendeeMessages.noAccountId,
      isRed: true,
    };
  }

  if (regStatus !== REG_STATUS.SUCCEEDED) {
    freshConditions[CONDITION.NOT_PAID] = {
      text:  "NOT PAID\nThis badge has not been paid for. Please direct attendee to cashier.",
      isRed: true,
    };
  }

  if (regHold) {
    freshConditions[CONDITION.REG_HOLD] = {
      text:  CONFIG.holdMessages[0].title + "\n" + CONFIG.holdMessages[0].body,
      isRed: true,
    };
  }

  if (artHold) {
    freshConditions[CONDITION.ART_HOLD] = {
      text:  CONFIG.holdMessages[1].title + "\n" + CONFIG.holdMessages[1].body,
      isRed: true,
    };
  }

  if (opsHold) {
    freshConditions[CONDITION.OPS_HOLD] = {
      text:  CONFIG.holdMessages[2].title + "\n" + CONFIG.holdMessages[2].body,
      isRed: true,
    };
  }

  const nonTransferableName = customFieldValue("nonTransferableName");
  if (nonTransferableName && nonTransferableName.toLowerCase() !== legalName.toLowerCase()) {
    freshConditions[CONDITION.NAME_MISMATCH] = {
      text:  CONFIG.attendeeMessages.nameMismatch
        .replace("{issued}",  nonTransferableName)
        .replace("{current}", legalName),
      isRed: true,
    };
  }

  if (activeBadges > 0) {
    freshConditions[CONDITION.ALREADY_ISSUED] = {
      text:  CONFIG.attendeeMessages.alreadyIssued,
      isRed: true,
    };
  }

  if (ticketConfig.requiresAgeCheck) {
    freshConditions[CONDITION.AGE_VERIFICATION] = {
      text: CONFIG.attendeeMessages.ageVerification
        .replace("{age}",    CONFIG.adultMinimumAge)
        .replace("{cutoff}", adultCutoff),
      isRed: false,
    };
  }

  if (!iceContact) {
    freshConditions[CONDITION.MISSING_ICE] = {
      text:  CONFIG.attendeeMessages.missingIce,
      isRed: false,
    };
  }

  // ── Merge: carry forward registration-page conditions not owned by this page ──
  const mergedConditionsMap = {};
  for (const r of storedReasons) {
    if (!attendeePageKeys.has(r.key)) {
      mergedConditionsMap[r.key] = { text: r.text, isRed: r.isRed };
    }
  }
  for (const [key, cond] of Object.entries(freshConditions)) {
    mergedConditionsMap[key] = cond;
  }

  // ── Sort by CONFIG.conditionOrder ──
  const reasons = (CONFIG.conditionOrder ?? [])
    .filter(entry => mergedConditionsMap[entry.key])
    .map(entry => ({
      key:     entry.key,
      text:    mergedConditionsMap[entry.key].text,
      isRed:   mergedConditionsMap[entry.key].isRed,
      fixable: entry.fixableOnAttendeePage,
    }));

  // Safety net: include any conditions not yet in conditionOrder
  for (const [key, cond] of Object.entries(mergedConditionsMap)) {
    if (!reasons.find(r => r.key === key)) {
      reasons.push({ key, text: cond.text, isRed: cond.isRed, fixable: false });
    }
  }

  const hasRed    = reasons.some(r => r.isRed);
  const hasYellow = reasons.some(r => !r.isRed);
  const state     = hasRed ? STATE.RED : hasYellow ? STATE.YELLOW : STATE.GREEN;

  const missingIce = !!freshConditions[CONDITION.MISSING_ICE];

  console.log(`getAttendeeInfo: accountId=${accountId} name="${legalName}" ticket="${ticketTypeName}" state=${state} conditions=${reasons.map(r => r.key).join(", ") || "none"}`);

  return {
    accountId,
    neonAttendeeId,
    attendeeId: accountId,
    legalName,
    preferredName,
    badgeImage:            ticketConfig.badgeImage,
    ticket:                `${ticketConfig.ticketLabel}${isDayPass ? " Day Pass" : " Weekend"}`,
    activeBadges,
    regStatus,
    state,
    reasons,
    missingRequiredFields: missingIce ? [CONFIG.fieldLabels.iceContact] : [],
  };
}

// ── HIGHLIGHT MISSING ICE FIELD ───────────────────────────────────────────

/**
 * Scrolls to and highlights the ICE contact field in yellow.
 * If persistent=true (auto-triggered on load), the highlight stays until
 * the user types. If persistent=false (button-triggered), fades after 5s.
 */
function highlightICEField(persistent) {
  const field = customFieldByRole("iceContact");
  console.log("highlightICEField: field lookup result:", field, "FIELD.iceContact index:", FIELD.iceContact);
  if (!field) {
    console.warn("highlightICEField: field not found, FIELD map is:", FIELD);
    return;
  }
  console.log("highlightICEField: found field, applying styles");
  field.scrollIntoView({ behavior: "smooth", block: "center" });
  field.style.background = "#fff3cd";
  field.focus();

  if (!persistent) {
    setTimeout(() => { field.style.background = ""; }, 5000);
  } else {
    field.addEventListener("input", () => { field.style.background = ""; }, { once: true });
  }
}

// ── HIGHLIGHT RED CONDITION FIELDS ────────────────────────────────────────

/**
 * Highlights all fields that are causing red (blocking) conditions.
 * Called automatically on page load when red conditions are present.
 */
function highlightRedConditionFields(attendeeData) {
  if (!attendeeData || !attendeeData.reasons) return;

  const conditionToField = {
    [CONDITION.REG_HOLD]:       "registrationHold",
    [CONDITION.ART_HOLD]:       "artShowHold",
    [CONDITION.OPS_HOLD]:       "operationsHold",
    [CONDITION.NAME_MISMATCH]:  "nonTransferableName",
    [CONDITION.MISSING_ICE]:    "iceContact",
    [CONDITION.ALREADY_ISSUED]: "activeBadgeCount",
  };

  const redConditions = attendeeData.reasons.filter(r => r.isRed);
  console.log("highlightRedConditionFields: red conditions:", redConditions.map(r => r.key));

  for (const condition of redConditions) {
    const fieldRole = conditionToField[condition.key];
    if (!fieldRole) {
      console.log(`highlightRedConditionFields: no field mapping for condition "${condition.key}"`);
      continue;
    }

    // Checkboxes (holds) — highlight the checkbox and its container
    if (fieldRole === "registrationHold" || fieldRole === "artShowHold" || fieldRole === "operationsHold") {
      const checkboxInput = customCheckboxByRole(fieldRole);
      if (checkboxInput) {
        console.log(`highlightRedConditionFields: highlighting checkbox "${fieldRole}" (index ${FIELD[fieldRole]})`);
        checkboxInput.style.accentColor = "#dc3545";
        const parent = checkboxInput.closest("div, td, label");
        if (parent) parent.style.background = "#ffcccc";
      }
      continue;
    }

    // Regular text fields
    const field = customFieldByRole(fieldRole);
    if (field) {
      console.log(`highlightRedConditionFields: highlighting field "${fieldRole}" (index ${FIELD[fieldRole]})`);
      field.style.background = "#ffcccc";
    } else {
      console.warn(`highlightRedConditionFields: field "${fieldRole}" not found in FIELD map`);
    }
  }
}

// ── HIGHLIGHT ACCOUNT HOLDS (Management Override) ─────────────────────────

/**
 * When management override is active and account has holds, highlights the
 * hold checkboxes on this form in red to draw attention.
 */
function highlightAccountHolds(holds) {
  if (!holds || !holds.hasAnyHolds) {
    console.log("attendeeContact.js: no holds to highlight");
    return;
  }
  console.log("attendeeContact.js: highlighting account holds for management override");

  const holdRoles = [
    { role: "registrationHold", active: holds.registrationHold, label: "Registration Hold" },
    { role: "artShowHold",      active: holds.artShowHold,      label: "Art Show Hold" },
    { role: "operationsHold",   active: holds.operationsHold,   label: "Operations Hold" },
  ];

  for (const { role, active, label } of holdRoles) {
    if (!active) continue;
    const checkbox = customCheckboxByRole(role);
    if (checkbox) {
      console.log(`attendeeContact.js: highlighting ${label} checkbox`);
      checkbox.style.accentColor = "#dc3545";
      const parent = checkbox.closest("div, td, label, li");
      if (parent) {
        parent.style.background  = "#fff3cd";
        parent.style.borderLeft  = "4px solid #dc3545";
        parent.style.paddingLeft = "8px";
      }
    }
  }
}

// ── WRITE FIELDS AND SUBMIT ───────────────────────────────────────────────

/**
 * Performs the actual check-in write operations:
 *   1. Increments the active badge count
 *   2. Writes the non-transferable name (legal first + last)
 *   3. Writes the pickup date and time to the next empty slot
 *   4. Clicks the save button
 *
 * Returns { ok: true } on success or { ok: false, error: string } on failure.
 * Called by the popup via INCREMENT_BADGE_COUNT message.
 */
function incrementBadge() {
  console.log("incrementBadge: validating fields before writing");

  const activeBadgesEl    = customFieldByRole("activeBadgeCount");
  const nonTransferableEl = customFieldByRole("nonTransferableName");
  const saveButton        = document.getElementsByName("save")[0];

  if (!activeBadgesEl) {
    const msg = "Cannot complete check-in: Active Badge Count field not found on this form. Please contact Registration Head.";
    console.error(msg);
    return { ok: false, error: msg };
  }
  if (!nonTransferableEl) {
    const msg = "Cannot complete check-in: Non-Transferable Name field not found on this form. Please contact Registration Head.";
    console.error(msg);
    return { ok: false, error: msg };
  }
  if (!saveButton) {
    const msg = "Cannot complete check-in: Save button not found. Please contact Registration Head.";
    console.error(msg);
    return { ok: false, error: msg };
  }

  const availableSlot = (FIELD.pickupSlots ?? [])
    .find(([, timeIdx]) => customField(timeIdx)?.value?.trim() === "");
  if (!availableSlot) {
    const msg = "Cannot complete check-in: All pickup time slots are already filled. Please contact Registration Head.";
    console.error(msg);
    return { ok: false, error: msg };
  }

  console.log("incrementBadge: pre-flight passed, writing fields");

  const currentCount   = activeBadgesEl.value === "" ? 0 : parseInt(activeBadgesEl.value, 10);
  activeBadgesEl.value = currentCount + 1;

  // For the non-transferable name, use the visible first-name input (acInput)
  // which works for both standard and dealer attendees (it holds the legal first name).
  const firstName         = document.getElementById("acInput")?.value?.trim() ?? "";
  const lastName          = document.getElementsByName("attendee.lastName")[0]?.value?.trim() ?? "";
  nonTransferableEl.value = `${firstName} ${lastName}`.trim();

  const now                = new Date();
  const [dateIdx, timeIdx] = availableSlot;
  customField(dateIdx).value = formattedDate(now);
  customField(timeIdx).value = now.toLocaleTimeString();
  console.log(`Pickup timestamp written to slot date[${dateIdx}] / time[${timeIdx}]`);

  saveButton.click();
  return { ok: true };
}

// end js/attendeeContact.js