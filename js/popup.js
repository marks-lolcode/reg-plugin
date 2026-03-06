// js/popup.js

// Extension popup UI script.
// Renders the appropriate view based on which Neon page is active.
//
// CONFIG, STATE, ACTION, STORAGE_KEY, CONDITION are globals injected via
// popup.html script tags before this file loads.

document.addEventListener("DOMContentLoaded", displayPopup);

// ── OVERRIDE BANNER ────────────────────────────────────────────────────

function buildOverrideBanner() {
  const bar = el("div", { className: "override-bar" });
  bar.textContent = "MANAGER OVERRIDE ACTIVE";
  return bar;
}

// ── ENTRY POINT ────────────────────────────────────────────────────────

async function displayPopup() {
  const activeTab = await getActiveTab();
  const url = activeTab?.url ?? "";

  if (url.includes("attendeeEdit")) {
    const result   = await chrome.storage.local.get(STORAGE_KEY.ATTENDEE);
    const attendee = result[STORAGE_KEY.ATTENDEE];
    attendee
      ? buildAttendeeView(attendee, activeTab)
      : buildNotFoundView(
          "No attendee data found.",
          "Navigate to an attendee page first, then try again."
        );

  } else if (url.includes("eventRegDetails")) {
    const result        = await chrome.storage.local.get(STORAGE_KEY.REGISTRATIONS);
    const registrations = result[STORAGE_KEY.REGISTRATIONS];
    registrations
      ? buildRegistrationsView(registrations, activeTab)
      : buildNotFoundView(
          "No registration data found.",
          "Navigate to a registration page first, then try again."
        );

  } else {
    buildNotFoundView(
      "Wrong page.",
      "To use this tool:\n1. Search for the attendee in Neon\n2. Open their Event Registrations\n3. Click the Attendees tab\n4. Click the dollar amount for this year's event\n5. Click the extension icon"
    );
  }
}

// ── REGISTRATIONS VIEW ─────────────────────────────────────────────────

async function buildRegistrationsView(registrationData, tab) {
  const body = document.body;
  body.innerHTML = "";

  const overrideResult     = await chrome.storage.local.get(STORAGE_KEY.MANAGEMENT_OVERRIDE);
  const managementOverride = overrideResult[STORAGE_KEY.MANAGEMENT_OVERRIDE] ?? false;

  if (managementOverride) body.appendChild(buildOverrideBanner());

  body.appendChild(el("div", {
    className:   "heading",
    textContent: "Select the attendee to check in:",
  }));

  registrationData.data.forEach(reg => {
    const row = el("div", { className: `reg-row reg-row-${reg.state}` });

    const nameText = reg.preferredName
      ? `${reg.legalName} (${reg.preferredName})`
      : reg.legalName;
    row.appendChild(el("div", { className: "reg-name", textContent: nameText }));

    if (reg.state === STATE.RED) {
      if (managementOverride) {
        const overrideBtn = el("button", { className: "btn-override" });
        overrideBtn.textContent = "⚠ Override — Check In →";
        overrideBtn.addEventListener("click", async () => navigateToAttendeeEdit(reg, tab));
        row.appendChild(overrideBtn);
      } else {
        row.appendChild(el("div", { className: "helpdesk-note-inline", textContent: "Send to Help Desk" }));
      }
    } else {
      row.appendChild(el("div", { className: "reg-ticket", textContent: reg.ticket }));
      const btn = el("button", { className: "btn-select" });
      btn.textContent = "Check In →";
      btn.addEventListener("click", async () => navigateToAttendeeEdit(reg, tab));
      row.appendChild(btn);
    }

    body.appendChild(row);
  });
}

async function navigateToAttendeeEdit(reg, tab) {
  await chrome.storage.local.remove([STORAGE_KEY.AGE_VERIFIED]);
  await chrome.storage.local.set({ [STORAGE_KEY.ATTENDEE]: reg });
  const activeTab = await getActiveTab();
  const base = activeTab?.url?.includes(CONFIG.neon.trialDomain)
    ? `https://${CONFIG.neon.trialDomain}`
    : `https://${CONFIG.neon.productionDomain}`;
  await chrome.tabs.update(tab.id, {
    url: `${base}/np/admin/event/attendeeEdit.do?id=${reg.neonAttendeeId}&acct=${reg.accountId}`,
  });
  window.close();
}

// ── ATTENDEE VIEW ──────────────────────────────────────────────────────

async function buildAttendeeView(attendee, tab) {
  const body = document.body;
  body.innerHTML = "";

  const overrideResult     = await chrome.storage.local.get(STORAGE_KEY.MANAGEMENT_OVERRIDE);
  const managementOverride = overrideResult[STORAGE_KEY.MANAGEMENT_OVERRIDE] ?? false;
  const ageVerifiedResult  = await chrome.storage.local.get(STORAGE_KEY.AGE_VERIFIED);
  const ageVerified        = ageVerifiedResult[STORAGE_KEY.AGE_VERIFIED] ?? false;

  const reasons    = attendee.reasons ?? [];
  const redReasons = reasons.filter(r => r.isRed);
  const isBlocked  = attendee.state === STATE.RED;
  const isAdult    = attendee.ticket?.includes("Adult");

  // Age verification must be completed before the badge number is shown,
  // but only when it's the sole yellow condition (no red conditions present).
  const ageReason   = reasons.find(r => r.key === CONDITION.AGE_VERIFICATION);
  const needsAgeStep = isAdult && ageReason && !ageVerified && !isBlocked;

  if (managementOverride) body.appendChild(buildOverrideBanner());

  // ── Status banner: ⛔ STOP heading for red, then all reason blocks ──
  const banner = el("div", { className: `banner banner-${attendee.state}` });

  if (isBlocked) {
    const stop = el("div", { className: "banner-stop" });
    stop.textContent = "⛔ STOP";
    banner.appendChild(stop);
  }

  if (reasons.length > 0) {
    reasons.forEach((reason, index) => {
      // Add a divider between conditions (not before the first one)
      if (index > 0) {
        banner.appendChild(el("hr", { className: "reason-divider" }));
      }

      const block = el("div", { className: "reason-block" });

      // Split on the first \n to separate the title from the detail lines.
      // e.g. "HOLD — Send attendee to Help Desk.\n\nHelp Desk: ..."
      //   → title: "HOLD — Send attendee to Help Desk."
      //   → body:  "Help Desk: ..."
      const newlineIndex = reason.text.indexOf("\n");
      if (newlineIndex !== -1) {
        const title = reason.text.slice(0, newlineIndex).trim();
        const body  = reason.text.slice(newlineIndex).trim();

        const titleEl = el("div", { className: "reason-title" });
        titleEl.textContent = title;
        block.appendChild(titleEl);

        if (body) {
          const bodyEl = el("div", { className: "reason-body" });
          bodyEl.textContent = body;
          block.appendChild(bodyEl);
        }
      } else {
        // No newline — render as title only
        const titleEl = el("div", { className: "reason-title" });
        titleEl.textContent = reason.text;
        block.appendChild(titleEl);
      }

      banner.appendChild(block);
    });
  } else if (attendee.state !== STATE.GREEN && attendee.reason) {
    // Fallback: conditionOrder not yet in CONFIG, show legacy single reason
    const text = el("div", { className: "reason-text" });
    text.textContent = attendee.reason;
    banner.appendChild(text);
  } else {
    // Green / fully OK
    const okDiv = el("div");
    okDiv.textContent = "OK to proceed";
    banner.appendChild(okDiv);
  }

  body.appendChild(banner);

  // ── Info table ──
  const table = el("table");

  function addNameRow(label, value) {
    const row     = el("tr");
    const labelTd = el("td", { className: "label", textContent: label });
    const valueTd = el("td", { className: "legal-name-value", textContent: value });
    row.appendChild(labelTd);
    row.appendChild(valueTd);
    table.appendChild(row);
  }

  if (needsAgeStep) {
    if (attendee.preferredName) addNameRow("Preferred Name", attendee.preferredName);
    addNameRow("Legal Name", attendee.legalName ?? "—");

    const today     = new Date();
    const cutoff    = new Date(today.getFullYear() - CONFIG.adultMinimumAge, today.getMonth(), today.getDate());
    const cutoffStr = cutoff.toLocaleDateString();
    const ageRow     = el("tr");
    const ageLabelTd = el("td", { className: "label", textContent: "ID Required" });
    const ageValueTd = el("td");
    const ageLabel   = el("span", { className: "age-cutoff-label", textContent: "DOB on or before " });
    const ageDate    = el("span", { className: "age-cutoff-date",  textContent: cutoffStr });
    ageValueTd.appendChild(ageLabel);
    ageValueTd.appendChild(ageDate);
    ageRow.appendChild(ageLabelTd);
    ageRow.appendChild(ageValueTd);
    table.appendChild(ageRow);

  } else if (!isBlocked || managementOverride) {
    const badgeRow = el("tr");
    const badgeTd  = el("td", { colSpan: 2, className: "badge-number-cell" });
    badgeTd.appendChild(el("div", { className: "badge-number-label", textContent: "Badge Number" }));
    badgeTd.appendChild(el("div", { className: "badge-number-value", textContent: attendee.attendeeId ?? "—" }));
    badgeTd.appendChild(el("div", { className: "badge-ticket-value", textContent: attendee.ticket ?? "" }));
    badgeRow.appendChild(badgeTd);
    table.appendChild(badgeRow);

    if (attendee.preferredName) addNameRow("Preferred Name", attendee.preferredName);
    addNameRow("Legal Name", attendee.legalName ?? "—");
  }

  body.appendChild(table);

  // ── Re-check buttons for fixable conditions ────────────────────────
  // Any condition with fixable: true gets a Re-check button so staff can
  // resolve it on the Neon form and immediately confirm it was fixed.
  // The ICE condition also gets a "Show me the field" button.
  const fixableReasons = reasons.filter(r => r.fixable);

  if (fixableReasons.length > 0) {
    const recheckSection = el("div", { className: "recheck-section" });

    fixableReasons.forEach(reason => {
      const block = el("div", { className: "recheck-block" });

      // "Show me" button only for ICE field
      if (reason.key === CONDITION.MISSING_ICE) {
        const showBtn = el("button", { className: "btn-show-field" });
        showBtn.textContent = "Show me the field ↓";
        showBtn.addEventListener("click", () => {
          chrome.tabs.sendMessage(tab.id, { action: ACTION.HIGHLIGHT_ICE_FIELD });
          window.close();
        });
        block.appendChild(showBtn);
      }

      const recheckBtn = el("button", { className: "btn-recheck" });
      recheckBtn.textContent = `Re-check ↺`;
      recheckBtn.addEventListener("click", async () => {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs[0]) return;
        // Write current attendee data to storage BEFORE calling GET_ATTENDEE_DATA.
        // getAttendeeInfo() reads storedReasons from storage to carry forward
        // non-attendee-page conditions. Without this, it re-reads the OLD reasons
        // and re-adds conditions that may have already been fixed on the form.
        await chrome.storage.local.set({ [STORAGE_KEY.ATTENDEE]: attendee });
        chrome.tabs.sendMessage(tabs[0].id, { action: ACTION.GET_ATTENDEE_DATA }, async (freshData) => {
          if (freshData) {
            await chrome.storage.local.set({ [STORAGE_KEY.ATTENDEE]: freshData });
            buildAttendeeView(freshData, tab);
          }
        });
      });
      block.appendChild(recheckBtn);
      recheckSection.appendChild(block);
    });

    body.appendChild(recheckSection);
  }

  // ── Action buttons ──
  const hasNoAccountId = reasons.some(r => r.key === CONDITION.NO_ACCOUNT_ID);
  const hasActiveHold  = reasons.some(r =>
    r.key === CONDITION.REG_HOLD ||
    r.key === CONDITION.ART_HOLD ||
    r.key === CONDITION.OPS_HOLD
  );

  if (hasNoAccountId) {
    // Can't proceed at all — no button

  } else if (isBlocked && !managementOverride) {
    body.appendChild(el("div", { className: "helpdesk-note", textContent: "Please send attendee to the Help Desk." }));

  } else if (needsAgeStep) {
    const ageBtn = el("button", { className: "btn-age-verify" });
    ageBtn.textContent = "Age Verified, ID Returned ✓";
    ageBtn.addEventListener("click", async () => {
      await chrome.storage.local.set({ [STORAGE_KEY.AGE_VERIFIED]: true });
      buildAttendeeView(attendee, tab);
    });
    body.appendChild(ageBtn);

  } else if (!isBlocked || managementOverride) {
    // If any hold is active, show a hard block regardless of override.
    // Holds must be resolved (checkbox unchecked) before a badge can be issued.
    if (hasActiveHold) {
      const noIssueBtn = el("button", { className: "btn-no-issue" });
      noIssueBtn.textContent = "⛔ DO NOT ISSUE BADGE";
      noIssueBtn.disabled = true;
      body.appendChild(noIssueBtn);

    } else if (fixableReasons.length === 0 || managementOverride) {
      // Only show check-in button when there are no unresolved fixable conditions,
      // OR when override is active (manager may proceed regardless)
      const btn = el("button", { className: "btn-checkin" });
      btn.textContent = "Badge Delivered";
      btn.addEventListener("click", () => doCheckIn(attendee, tab, btn));
      body.appendChild(btn);
    }
  }
}

// ── NOT FOUND / GUIDANCE VIEW ──────────────────────────────────────────

async function buildNotFoundView(heading, detail) {
  const overrideResult     = await chrome.storage.local.get(STORAGE_KEY.MANAGEMENT_OVERRIDE);
  const managementOverride = overrideResult[STORAGE_KEY.MANAGEMENT_OVERRIDE] ?? false;
  document.body.innerHTML = "";
  if (managementOverride) document.body.appendChild(buildOverrideBanner());
  document.body.appendChild(el("div", { className: "not-found-heading", textContent: heading }));
  document.body.appendChild(el("div", { className: "not-found-detail",  textContent: detail  }));
}

// ── CHECK-IN ACTION ────────────────────────────────────────────────────

async function doCheckIn(attendee, tab, btn) {
  btn.disabled    = true;
  btn.textContent = "Processing…";

  const csvResult = await saveBadgeCSV(attendee);
  if (!csvResult.ok) {
    showError(`Badge CSV could not be downloaded: ${csvResult.error}\n\nDo NOT hand out the badge. Please contact Registration Head.`);
    return;
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true, status: "complete" });
  if (!tabs[0]) {
    showError("Could not find the active Neon tab. Please try again.");
    return;
  }

  chrome.tabs.sendMessage(tabs[0].id, { action: ACTION.INCREMENT_BADGE_COUNT }, (response) => {
    if (chrome.runtime.lastError) {
      showError(`Check-in could not be completed: ${chrome.runtime.lastError.message}\n\nDo NOT hand out the badge. Please contact Registration Head.`);
      return;
    }
    if (!response?.ok) {
      showError(`Check-in could not be completed: ${response?.error ?? "Unknown error"}\n\nDo NOT hand out the badge. Please contact Registration Head.`);
      return;
    }
    chrome.storage.local.remove([STORAGE_KEY.AGE_VERIFIED]);
    showConfirmation(attendee);
  });
}

function showConfirmation(attendee) {
  const body   = document.body;
  body.innerHTML = "";
  const screen = el("div", { className: "confirm-screen" });
  screen.appendChild(el("div", { className: "confirm-icon",   textContent: "✓" }));
  screen.appendChild(el("div", { className: "confirm-title",  textContent: "Check-In Complete" }));
  screen.appendChild(el("div", { className: "confirm-name",   textContent: attendee.preferredName || attendee.legalName }));
  screen.appendChild(el("div", { className: "confirm-badge",  textContent: `Badge: ${attendee.attendeeId}` }));
  screen.appendChild(el("div", { className: "confirm-detail", textContent: "Hand badge to attendee.\nCSV sent to printer queue." }));
  body.appendChild(screen);
  setTimeout(() => window.close(), 3000);
}

function showError(message) {
  const body   = document.body;
  body.innerHTML = "";
  const screen = el("div", { className: "error-screen" });
  screen.appendChild(el("div", { className: "error-icon",    textContent: "✗" }));
  screen.appendChild(el("div", { className: "error-message", textContent: message }));
  body.appendChild(screen);
}

// ── CSV DOWNLOAD ───────────────────────────────────────────────────────

async function saveBadgeCSV(attendee) {
  try {
    const headers = ["Badge Type", "Badge Image", "Account ID", "Print Number"];
    const values  = [attendee.ticket, attendee.badgeImage, attendee.accountId, attendee.activeBadges + 1];
    const csvRow  = v => `"${String(v).replace(/"/g, '""')}"`;
    const csv     = [headers.map(csvRow).join(","), values.map(csvRow).join(",")].join("\n");
    const blob     = new Blob([csv], { type: "text/csv" });
    const filename = `${attendee.accountId} - ${(attendee.preferredName || attendee.legalName).replace(/[^\w\s]/g, "")}.csv`;
    const link     = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename });
    link.click();
    URL.revokeObjectURL(link.href);
    return { ok: true };
  } catch (err) {
    console.error("saveBadgeCSV failed:", err);
    return { ok: false, error: err.message };
  }
}

// ── UTILITIES ──────────────────────────────────────────────────────────

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0];
}

function el(tag, props = {}) {
  return Object.assign(document.createElement(tag), props);
}

// end js/popup.js
