// js/attendeeContact.js
// Content script for the Neon AttendeeEdit page.
// Handles the actual form writing and submission at check-in (Steps 16-17),
// and provides the highlight function for missing ICE fields.
//
// IMPORTANT: This page does not have enough information to re-derive all
// blocking conditions (holds, wrong year, not paid, etc.). Those were
// determined on the EventRegDetails page and stored in STORAGE_KEY.ATTENDEE
// by popup.js navigateToAttendeeEdit() before navigating here.
//
// getAttendeeInfo() therefore:
// 1. Reads the stored attendee data (which has the full reasons array)
// 2. Re-scrapes only the fields visible on THIS page (activeBadges, iceContact)
// 3. Rebuilds the conditions map by keeping all non-attendee-page reasons
//    from storage and updating the attendee-page-only reasons fresh from DOM
// 4. Returns the merged result
//
// This means Re-check always shows an accurate up-to-date picture without
// losing reasons that can only be seen on the registrations page.
//
// CONFIG, STATE, ACTION, STORAGE_KEY, CONDITION are injected as globals
// by the manifest. Do not add import statements.
//
// Injected by manifest on: /np/admin/event/attendeeEdit.do

// ── TRIGGER ICON UPDATE ON PAGE LOAD ──────────────────────────────────
(async function triggerIconUpdate() {
  const data = await getAttendeeInfo();
  await chrome.storage.local.set({ [STORAGE_KEY.ATTENDEE]: data });
  await chrome.storage.local.set({ [STORAGE_KEY.PENDING_ICON_UPDATE]: { page: "attendee", ts: Date.now() } });
  console.log("attendeeContact.js: wrote attendee data and triggered icon update");
})();

// ── MESSAGE LISTENER ───────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === ACTION.GET_ATTENDEE_DATA) {
    getAttendeeInfo().then(sendResponse);
    return true; // async response
  }
  if (request.action === ACTION.INCREMENT_BADGE_COUNT) sendResponse(incrementBadge());
  if (request.action === ACTION.HIGHLIGHT_ICE_FIELD) {
    highlightICEField();
    sendResponse({ ok: true });
  }
});

// ── FIELD ACCESS HELPERS ───────────────────────────────────────────────
function customField(index) {
  return document.querySelector(`[name="attendee.customDataList[${index}].value"]`);
}

function customFieldValue(index) {
  return customField(index)?.value?.trim() ?? "";
}

function readLabelSiblingText(labelText) {
  const label = Array.from(document.querySelectorAll("label"))
    .find(l => l.textContent.trim().startsWith(labelText));
  const sibling = label?.nextElementSibling;
  return (sibling?.querySelector("label") ?? sibling)?.textContent?.trim() ?? "";
}

// ── DATE / TIME HELPERS ────────────────────────────────────────────────
function adultCutoffDateString() {
  const today = new Date();
  const cutoff = new Date(today.getFullYear() - CONFIG.adultMinimumAge, today.getMonth(), today.getDate());
  return cutoff.toLocaleDateString();
}

function formattedDate(date) {
  return [
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    date.getFullYear(),
  ].join("/");
}

// ── SCRAPE ATTENDEE DATA ───────────────────────────────────────────────
/**
 * Returns a fully merged attendee state object.
 *
 * Reads the stored attendee record (populated from the registrations page)
 * to recover reasons that cannot be re-derived here (holds, wrong year,
 * not paid, etc.), then re-evaluates only the conditions that ARE visible
 * on this page: alreadyIssued, ageVerification, missingIce, noAccountId.
 *
 * The result is a fresh reasons array that reflects both the registrations-
 * page conditions and the current state of the attendee form.
 *
 * @returns {Promise<object>}
 */
async function getAttendeeInfo() {
  console.log("getAttendeeInfo: scraping attendee page");

  // ── Read stored data from registrations page ──
  const stored = await chrome.storage.local.get(STORAGE_KEY.ATTENDEE);
  const storedAttendee = stored[STORAGE_KEY.ATTENDEE] ?? {};
  const storedReasons = storedAttendee.reasons ?? [];

  // ── Scrape this page ──
  const accountId = new URL(window.location.href).searchParams.get("acct");
  const neonAttendeeId = readLabelSiblingText("Attendee ID");
  const regStatus = readLabelSiblingText("Registration Status");
  const firstName = document.getElementsByName("attendee.firstName")[0]?.value?.trim() ?? "";
  const lastName  = document.getElementsByName("attendee.lastName")[0]?.value?.trim() ?? "";
  const legalName = `${firstName} ${lastName}`.trim();
  const preferredName    = customFieldValue(CONFIG.fieldIndexes.preferredName);
  const activeBadgesRaw  = customFieldValue(CONFIG.fieldIndexes.activeBadgeCount);
  const activeBadges     = activeBadgesRaw === "" ? 0 : parseInt(activeBadgesRaw, 10);
  const ticketSelect     = document.getElementById("ticketPackageId");
  const ticketTypeName   = ticketSelect?.options[ticketSelect.selectedIndex]?.text ?? "";
  const ticketConfig     = CONFIG.ticketTypes.find(t => ticketTypeName.includes(t.nameIncludes))
                        ?? { ticketLabel: "Unknown", badgeImage: "NONE.tif", requiresAgeCheck: false };
  const isDayPass        = ticketTypeName.includes("Day Pass");
  const adultCutoff      = adultCutoffDateString();
  const iceContact       = customFieldValue(CONFIG.fieldIndexes.iceContact);

  // Read hold checkboxes — Neon stores these as customDataList inputs whose
  // value is "true" when checked. Hold checkboxes use .optionIds as their
  // name attribute (e.g. attendee.customDataList[0].optionIds).
  function isHoldChecked(index) {
    const el = document.querySelector(`[name="attendee.customDataList[${index}].optionIds"]`);
    return el?.checked === true;
  }

  const regHold = isHoldChecked(CONFIG.fieldIndexes.registrationHold);
  const artHold = isHoldChecked(CONFIG.fieldIndexes.artShowHold);
  const opsHold = isHoldChecked(CONFIG.fieldIndexes.operationsHold);

  // ── Build conditions map ──
  // Start with the ATTENDEE-PAGE-ONLY condition keys we can re-check here.
  // All other reasons are carried forward from storedReasons unchanged.
  const attendeePageKeys = new Set([
    CONDITION.NO_ACCOUNT_ID,
    CONDITION.NAME_MISMATCH,
    CONDITION.ALREADY_ISSUED,
    CONDITION.AGE_VERIFICATION,
    CONDITION.MISSING_ICE,
    // Holds are re-evaluated from checkboxes on this page so Re-check can clear them
    CONDITION.REG_HOLD,
    CONDITION.ART_HOLD,
    CONDITION.OPS_HOLD,
  ]);

  // Fresh evaluation of attendee-page conditions
  const freshConditions = {};

  if (!accountId) {
    freshConditions[CONDITION.NO_ACCOUNT_ID] = {
      text: "NO ACCOUNT ID\nPlease direct attendee to Help Desk.",
      isRed: true,
    };
  }

  // Hold checkboxes — re-evaluated fresh from the DOM so Re-check can clear them
  if (regHold) {
    freshConditions[CONDITION.REG_HOLD] = {
      text: CONFIG.holdMessages[0].title + "\n" + CONFIG.holdMessages[0].body,
      isRed: true,
    };
  }
  if (artHold) {
    freshConditions[CONDITION.ART_HOLD] = {
      text: CONFIG.holdMessages[1].title + "\n" + CONFIG.holdMessages[1].body,
      isRed: true,
    };
  }
  if (opsHold) {
    freshConditions[CONDITION.OPS_HOLD] = {
      text: CONFIG.holdMessages[2].title + "\n" + CONFIG.holdMessages[2].body,
      isRed: true,
    };
  }

  // Non-transferable name mismatch: this field is blank on a fresh registration
  // and gets written with the attendee's name when they check in.
  // If it contains a name that differs from the current attendee, either:
  //   a) A different person previously checked in on this registration, or
  //   b) The attendee's name was changed after check-in.
  // Show this alongside ALREADY_ISSUED if both apply — they are separate facts.
  const nonTransferableName = customFieldValue(CONFIG.fieldIndexes.nonTransferableName);
  if (nonTransferableName && nonTransferableName.toLowerCase() !== legalName.toLowerCase()) {
    freshConditions[CONDITION.NAME_MISMATCH] = {
      text: `NAME MISMATCH\nBadge was issued to: ${nonTransferableName}\nCurrent attendee: ${legalName}\nPlease send attendee to Help Desk.`,
      isRed: true,
    };
  }

  if (activeBadges > 0) {
    freshConditions[CONDITION.ALREADY_ISSUED] = {
      text: "ALREADY ISSUED\nThis badge was already issued. Please send attendee to Help Desk.",
      isRed: true,
    };
  }

  // Only show age verification if no badge has been issued yet.
  // If already issued, that stop reason is sufficient — age verification
  // is moot because check-in cannot proceed regardless.
  if (ticketConfig.requiresAgeCheck && activeBadges === 0) {
    freshConditions[CONDITION.AGE_VERIFICATION] = {
      text: `AGE VERIFICATION REQUIRED\nVerify ID matches legal name. Attendee must be ${CONFIG.adultMinimumAge} or older (DOB before ${adultCutoff}).`,
      isRed: false,
    };
  }

  if (!iceContact) {
    freshConditions[CONDITION.MISSING_ICE] = {
      text: "MISSING EMERGENCY CONTACT\nPlease ask the attendee for their emergency contact information.\nFill it in below, then click Re-check.",
      isRed: false,
    };
  }

  // Build a merged conditions map:
  // - Keep all stored reasons that are NOT attendee-page-only (holds, wrong year, etc.)
  // - Replace attendee-page-only reasons with fresh values from the DOM
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

  // Safety net for any conditions not listed in conditionOrder
  for (const [key, cond] of Object.entries(mergedConditionsMap)) {
    if (!reasons.find(r => r.key === key)) {
      reasons.push({ key, text: cond.text, isRed: cond.isRed, fixable: false });
    }
  }

  // ── Determine overall state ──
  const hasRed    = reasons.some(r => r.isRed);
  const hasYellow = reasons.some(r => !r.isRed);
  const state     = hasRed ? STATE.RED : hasYellow ? STATE.YELLOW : STATE.GREEN;

  const missingIce = !!freshConditions[CONDITION.MISSING_ICE];

  console.log(`Attendee: ${legalName} | Account: ${accountId} | Badges: ${activeBadges} | ICE: ${iceContact ? "set" : "missing"} | State: ${state} | Conditions: ${reasons.map(r => r.key).join(", ") || "none"}`);

  return {
    accountId,
    neonAttendeeId,
    attendeeId: accountId,
    legalName,
    preferredName,
    badgeImage: ticketConfig.badgeImage,
    ticket: `${ticketConfig.ticketLabel}${isDayPass ? " Day Pass" : " Weekend"}`,
    activeBadges,
    regStatus,
    state,
    reasons,
    missingRequiredFields: missingIce ? ["In Case Of Emergency (Name and Phone)"] : [],
  };
}

// ── HIGHLIGHT MISSING ICE FIELD ────────────────────────────────────────
function highlightICEField() {
  const field = customField(CONFIG.fieldIndexes.iceContact);
  if (!field) return;
  field.scrollIntoView({ behavior: "smooth", block: "center" });
  field.style.outline   = "3px solid #dc3545";
  field.style.background = "#fff3cd";
  field.focus();
  setTimeout(() => {
    field.style.outline    = "";
    field.style.background = "";
  }, 5000);
}

// ── WRITE FIELDS AND SUBMIT ────────────────────────────────────────────
function incrementBadge() {
  console.log("incrementBadge: validating fields before writing");

  const activeBadgesEl    = customField(CONFIG.fieldIndexes.activeBadgeCount);
  const nonTransferableEl = customField(CONFIG.fieldIndexes.nonTransferableName);
  const saveButton        = document.getElementsByName("save")[0];

  if (!activeBadgesEl) {
    const msg = "Cannot complete check-in: Active Badge Count field not found. Please contact Registration Head.";
    console.error(msg);
    return { ok: false, error: msg };
  }
  if (!nonTransferableEl) {
    const msg = "Cannot complete check-in: Non-Transferable Name field not found. Please contact Registration Head.";
    console.error(msg);
    return { ok: false, error: msg };
  }
  if (!saveButton) {
    const msg = "Cannot complete check-in: Save button not found. Please contact Registration Head.";
    console.error(msg);
    return { ok: false, error: msg };
  }

  const availableSlot = CONFIG.fieldIndexes.pickupSlots
    .find(([, timeIdx]) => customField(timeIdx)?.value?.trim() === "");
  if (!availableSlot) {
    const msg = "Cannot complete check-in: All pickup time slots are already filled. Please contact Registration Head.";
    console.error(msg);
    return { ok: false, error: msg };
  }

  console.log("incrementBadge: pre-flight passed, writing fields");

  const currentCount = activeBadgesEl.value === "" ? 0 : parseInt(activeBadgesEl.value, 10);
  activeBadgesEl.value = currentCount + 1;

  const firstName = document.getElementById("acInput")?.value?.trim() ?? "";
  const lastName  = document.getElementsByName("attendee.lastName")[0]?.value?.trim() ?? "";
  nonTransferableEl.value = `${firstName} ${lastName}`.trim();

  const now = new Date();
  const [dateIdx, timeIdx] = availableSlot;
  customField(timeIdx).value = now.toLocaleTimeString();
  customField(dateIdx).value = formattedDate(now);
  console.log(`Pickup timestamp written to slot date[${dateIdx}] / time[${timeIdx}]`);

  saveButton.click();
  return { ok: true };
}

// end js/attendeeContact.js