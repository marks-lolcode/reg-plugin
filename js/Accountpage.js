// js/accountPage.js
// ╔══════════════════════════════════════════════════════════════════════╗
// ║ CONvergence Check-In Extension — Account Page Script                 ║
// ║                                                                      ║
// ║ Activates on Neon CRM account detail pages (/admin/accounts/N).      ║
// ║                                                                      ║
// ║ Responsibilities:                                                    ║
// ║  1. Scrapes account notes and account holds                          ║
// ║  2. Writes state to chrome.storage for popup rendering               ║
// ║  3. Handles navigation to event registrations page                   ║
// ║  4. Auto-clicks first SUCCEEDED registration on Attendees tab        ║
// ║                                                                      ║
// ║ To disable: set ACCOUNT_PAGE_FEATURE_ENABLED = false below.          ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// CONFIG, STATE, ACTION, STORAGE_KEY are injected as globals by the manifest.

// Master kill switch for this content script. Flip to false to disable
// all account-page features without having to remove the script from the
// manifest. Useful if Neon makes a change that breaks scraping.
const ACCOUNT_PAGE_FEATURE_ENABLED = true;

// Poll interval (ms) and max attempts when waiting for an element to
// appear. 300 ms × 40 attempts ≈ 12 seconds of patience.
const POLL_MS       = 300;
const POLL_ATTEMPTS = 40;

// ── HELPER: Extract account ID from URL ─────────────────────────────────────

/**
 * Returns the numeric account ID from the current page URL, or null.
 * E.g. "/admin/accounts/45844/about" → "45844".
 */
function getAccountIdFromUrl() {
  const m = window.location.pathname.match(/\/admin\/accounts\/(\d+)/);
  return m ? m[1] : null;
}

// ── HELPER: Wait for an element to appear in the DOM ────────────────────────

/**
 * Polls the DOM every `ms` milliseconds for up to `attempts` tries,
 * resolving with the first element matching `selector`. Rejects with a
 * timeout error if not found before the attempt limit.
 *
 * Used because Neon pages render asynchronously via Vue/JS, so we can't
 * rely on the element being present at content-script execution time.
 */
function waitForElement(selector, attempts, ms) {
  attempts = attempts ?? POLL_ATTEMPTS;
  ms       = ms       ?? POLL_MS;
  return new Promise((resolve, reject) => {
    let n = 0;
    const t = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(t);
        resolve(el);
      } else if (++n >= attempts) {
        clearInterval(t);
        reject(new Error("timeout: " + selector));
      }
    }, ms);
  });
}

// ── SCRAPE: Notes badge count ───────────────────────────────────────────────

/**
 * Reads the count badge shown next to the "Notes" nav item in the
 * account's left sidebar (e.g. "Notes (3)"). Returns 0 if not found.
 *
 * We use this to know whether to look harder for note content — if
 * Neon says there are notes, but we can't find any in the DOM, that's
 * a signal to surface a "click the Notes section to load them" hint.
 */
function getNotesBadgeCount() {
  for (const el of document.querySelectorAll(".titan_account_detail_section_name")) {
    if (el.textContent.trim() === "Notes") {
      const li = el.closest("li");
      if (li) {
        const badge = li.querySelector(".el-badge__content:not(.is-dot)");
        if (badge) {
          const n = parseInt(badge.textContent.trim(), 10);
          return isNaN(n) ? 0 : n;
        }
      }
    }
  }
  return 0;
}

// ── SCRAPE: Notes already rendered in DOM ───────────────────────────────────

/**
 * Walks every visible note element on the page and returns an array of
 * { title, body } objects. Does NOT click the Notes nav item — only
 * picks up notes that have already been rendered.
 */
async function loadAndScrapeNotes() {
  const notes = [];
  for (const contentEl of document.querySelectorAll("[id^='note_content']")) {
    const card = contentEl.closest("[class*='card-grid-cell']") ||
                 contentEl.closest("[class*='diplay-in-row-notes']");
    let title = "";
    if (card) {
      const titleEl = card.querySelector(".notes-header span, .notes-header [class*='tool-tip']");
      if (titleEl) title = titleEl.textContent.trim();
    }
    const bodySpan = contentEl.querySelector("[id^='span-text-']");
    const body     = (bodySpan ?? contentEl).innerText.trim();
    if (title || body) notes.push({ title: title || "(Untitled note)", body });
  }
  return notes;
}

// ── SCRAPE: Account-level holds ─────────────────────────────────────────────

/**
 * Scrapes account-level holds from the Holds section on the About page.
 * The Holds section appears as static text rows (not checkboxes) where
 * the "value" cell reads either "HOLD" or "—".
 *
 * Returns { operationsHold, artShowHold, registrationHold, hasAnyHolds }.
 */
function getAccountHolds() {
  const holds = {
    operationsHold:   false,
    artShowHold:      false,
    registrationHold: false,
  };

  const holdRows = document.querySelectorAll(".neon_nest_grid_row");

  if (holdRows.length === 0) {
    console.log("accountPage.js: no hold rows found");
    holds.hasAnyHolds = false;
    return holds;
  }

  // Each row has a label cell (.about-field-title) and a value cell
  // (.neon_form_value). A hold is "active" only when the value is "HOLD".
  for (const row of holdRows) {
    const titleEl = row.querySelector(".about-field-title");
    const valueEl = row.querySelector(".neon_form_value");

    if (!titleEl || !valueEl) continue;

    const titleText = titleEl.textContent?.trim() ?? "";
    const valueText = valueEl.textContent?.trim() ?? "";

    console.log(`accountPage.js: hold field "${titleText}" = "${valueText}"`);

    if (valueText === "HOLD") {
      if (titleText.includes("Operations Hold")) {
        holds.operationsHold = true;
      } else if (titleText.includes("Art Show Hold")) {
        holds.artShowHold = true;
      } else if (titleText.includes("Registration Hold")) {
        holds.registrationHold = true;
      }
    }
  }

  holds.hasAnyHolds = holds.operationsHold || holds.artShowHold || holds.registrationHold;
  console.log(`accountPage.js: holds = reg:${holds.registrationHold}, art:${holds.artShowHold}, ops:${holds.operationsHold}, any:${holds.hasAnyHolds}`);

  return holds;
}

// ── BUILD: Combined account state for popup rendering ───────────────────────

/**
 * Scrapes the account page and returns a state object for the popup.
 * State priority:
 *   RED    → at least one hold is active
 *   YELLOW → no holds but at least one note present
 *   GREEN  → clean account, ready to navigate to event registration
 *
 * Returns { accountId, accountName, notes, holds, state }.
 */
async function getAccountData() {
  const accountId = getAccountIdFromUrl();

  const nameEl      = document.querySelector(".titan_account_detail_user_name .tool-tip, .titan_account_detail_user_name");
  const accountName = nameEl ? nameEl.textContent.trim().split("\n")[0].trim() : "";

  // Holds first — they outrank notes in determining state color.
  const holds = getAccountHolds();

  // Highlight hold rows on the page if Management Override is on, so the
  // override-using staff member can see WHICH holds are present even
  // though they're allowed to bypass them.
  const overrideResult     = await chrome.storage.local.get(STORAGE_KEY.MANAGEMENT_OVERRIDE);
  const managementOverride = overrideResult[STORAGE_KEY.MANAGEMENT_OVERRIDE] ?? false;

  if (holds.hasAnyHolds) {
    // Tiny delay lets the page settle before we start mutating styles.
    await new Promise(r => setTimeout(r, 100));
    highlightHoldRows(holds, managementOverride);
  }

  // Notes second — only scrape if the badge says there are any. This
  // avoids unnecessary DOM traversal on accounts with no notes at all.
  const noteCount = getNotesBadgeCount();
  let notes = [];

  if (noteCount > 0) {
    try {
      notes = await loadAndScrapeNotes();
    } catch {
      notes = [{
        title: "Note loading failed",
        body:  `This account has ${noteCount} note(s) but they could not be loaded automatically.\nPlease check the Notes section manually before proceeding.`,
      }];
    }
  }

  // Decide overall state. RED > YELLOW > GREEN.
  let state = STATE.GREEN;
  if (holds.hasAnyHolds) {
    state = STATE.RED;
  } else if (notes.length > 0) {
    state = STATE.YELLOW;
  }

  console.log(`accountPage.js: accountId=${accountId} holds=${holds.hasAnyHolds} notes=${notes.length} state=${state}`);

  return { accountId, accountName, notes, holds, state };
}

// ── HIGHLIGHT: Hold rows when override is active ────────────────────────────

/**
 * Adds a red highlight to every active hold row on the Account About
 * page when Management Override is on. Acts as a visual warning that
 * "yes, holds are present — you're choosing to bypass them".
 *
 * No-op when override is off (regular staff get a plain "Send to Help
 * Desk" message instead and never see the highlighting).
 */
function highlightHoldRows(holds, managementOverride) {
  if (!managementOverride || !holds || !holds.hasAnyHolds) {
    console.log("accountPage.js: skipping hold highlighting (override=" + managementOverride + ", holds=" + (holds?.hasAnyHolds || false) + ")");
    return;
  }

  console.log("accountPage.js: highlighting hold rows for management override");

  const holdRows = document.querySelectorAll(".neon_nest_grid_row");

  for (const row of holdRows) {
    const titleEl = row.querySelector(".about-field-title");
    const valueEl = row.querySelector(".neon_form_value");

    if (!titleEl || !valueEl) continue;

    const titleText = titleEl.textContent?.trim() ?? "";
    const valueText = valueEl.textContent?.trim() ?? "";

    // Only highlight if value is "HOLD" AND it matches an active hold.
    if (valueText === "HOLD") {
      let shouldHighlight = false;

      if (titleText.includes("Registration Hold") && holds.registrationHold) {
        shouldHighlight = true;
      } else if (titleText.includes("Art Show Hold") && holds.artShowHold) {
        shouldHighlight = true;
      } else if (titleText.includes("Operations Hold") && holds.operationsHold) {
        shouldHighlight = true;
      }

      if (shouldHighlight) {
        console.log(`accountPage.js: highlighting hold row: ${titleText}`);
        const labelCol = row.querySelector(".neon_nest_grid_label");
        const valueCol = row.querySelector(".neon_nest_grid_value");

        if (labelCol) {
          labelCol.style.background  = "#ffcccc";
          labelCol.style.borderLeft  = "4px solid #dc3545";
          labelCol.style.paddingLeft = "8px";
        }
        if (valueCol) {
          valueCol.style.background = "#ffcccc";
        }
      }
    }
  }
}

// ── AUTO-CLICK: First SUCCEEDED registration on Attendees tab ───────────────

/**
 * Called after the page navigates to the Attendees tab. Waits for the
 * registration table to load, then finds and clicks the first row whose
 * status is SUCCEEDED and whose event name matches either the current
 * config events or the test events.
 *
 * Priority: currentEventNames is checked first; only if no current
 * match is found do we fall back to testEventNames. This protects
 * against accidentally checking someone in to a training event when
 * a real registration also exists.
 */
async function autoClickFirstSucceededRegistration() {
  // Was the auto-nav flag set by popup.js? If not, this is a normal
  // page load and we should not auto-click anything.
  const stored = await new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEY.ACCOUNT_AUTO_NAV, (result) => {
      resolve(result[STORAGE_KEY.ACCOUNT_AUTO_NAV] ?? null);
    });
  });

  if (!stored) {
    console.log("accountPage.js: no auto-nav flag set, skipping auto-click");
    return;
  }

  // Merge current and test event names; we'll check current first when
  // walking the table so they take priority.
  const validEventNames = [
    ...(stored.currentEventNames ?? []),
    ...(stored.testEventNames ?? []),
  ];

  console.log(`accountPage.js: auto-nav active. Valid event names: [${validEventNames.join(", ")}]`);

  if (validEventNames.length === 0) {
    console.warn("accountPage.js: no valid event names configured");
    chrome.storage.local.remove(STORAGE_KEY.ACCOUNT_AUTO_NAV);
    return;
  }

  try {
    await waitForElement("#accountEventAttendeesList .el-table__body", POLL_ATTEMPTS, POLL_MS);

    // Vue needs a tick to populate rows after the table element exists.
    await new Promise(r => setTimeout(r, 500));

    const tableBody = document.querySelector("#accountEventAttendeesList .el-table__body");
    if (!tableBody) {
      console.warn("accountPage.js: could not find table body");
      chrome.storage.local.remove(STORAGE_KEY.ACCOUNT_AUTO_NAV);
      return;
    }

    const rows = tableBody.querySelectorAll("tr");
    console.log(`accountPage.js: found ${rows.length} registration rows in Attendees table`);

    // Walk rows looking for a SUCCEEDED row whose event matches our config.
    // Table columns: [0]=Amount, [1]=Event, [2]=Registered On, [3]=Status, [4]=Actions
    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length < 4) continue;

      const statusCell = cells[3];
      const eventCell  = cells[1];
      const amountCell = cells[0];

      const status    = statusCell?.textContent?.trim() ?? "";
      const eventName = eventCell?.textContent?.trim() ?? "";

      console.log(`accountPage.js: row - event: "${eventName}", status: "${status}"`);

      if (status !== "SUCCEEDED") continue;

      // currentEventNames first (higher priority), then testEventNames.
      let isValidEvent = false;
      let eventSource  = "";

      if (stored.currentEventNames?.some(name => eventName.toLowerCase().includes(name.toLowerCase()))) {
        isValidEvent = true;
        eventSource  = "currentEventNames";
      } else if (stored.testEventNames?.some(name => eventName.toLowerCase().includes(name.toLowerCase()))) {
        isValidEvent = true;
        eventSource  = "testEventNames";
      }

      if (!isValidEvent) {
        console.log(`accountPage.js: skipping "${eventName}" - not in valid event list`);
        continue;
      }

      // Match — click the dollar-amount link to open the registration.
      const amountLink = amountCell.querySelector("a");
      if (amountLink) {
        console.log(`accountPage.js: clicking first SUCCEEDED registration: ${eventName} (from ${eventSource})`);
        amountLink.click();
        chrome.storage.local.remove(STORAGE_KEY.ACCOUNT_AUTO_NAV);
        return;
      }
    }

    console.log("accountPage.js: no valid SUCCEEDED registration found");
    chrome.storage.local.remove(STORAGE_KEY.ACCOUNT_AUTO_NAV);

  } catch (err) {
    console.error("accountPage.js: auto-click failed:", err.message);
    chrome.storage.local.remove(STORAGE_KEY.ACCOUNT_AUTO_NAV);
  }
}

// ── INIT: Scrape and store on page load ─────────────────────────────────────

(async function triggerIconUpdate() {
  if (!ACCOUNT_PAGE_FEATURE_ENABLED) return;

  const path = window.location.pathname;

  // Only run on account root / about page, not sub-pages like
  // /event-registrations or /timeline.
  if (!/^\/admin\/accounts\/\d+\/?($|\/about)/.test(path)) return;

  try {
    await waitForElement(".titan_account_detail_section_name", POLL_ATTEMPTS, POLL_MS);
  } catch {
    return;
  }

  // Wait a touch longer for the section content (hold rows, note count
  // badges) to populate after the nav itself appears.
  await new Promise(r => setTimeout(r, 600));

  const data = await getAccountData();
  await chrome.storage.local.set({ [STORAGE_KEY.ACCOUNT]: data });
  await chrome.storage.local.set({
    [STORAGE_KEY.PENDING_ICON_UPDATE]: { page: "account", ts: Date.now() }
  });
  console.log("accountPage.js: wrote account data and triggered icon update");
})();

// ── INIT: Check for auto-nav flag on Attendees tab ──────────────────────────

(async function checkForAutoNav() {
  if (!ACCOUNT_PAGE_FEATURE_ENABLED) return;

  const path = window.location.pathname;

  // Detect if we're on the event-registrations page with Attendees tab.
  const isEventRegPage  = /^\/admin\/accounts\/\d+\/event-registrations/.test(path);
  const hasAttendeesTab = window.location.search.includes("tab=Attendees");

  if (isEventRegPage && hasAttendeesTab) {
    console.log("accountPage.js: on Attendees tab, checking for auto-nav flag");
    await autoClickFirstSucceededRegistration();
  }
})();

// ── MESSAGE LISTENERS ───────────────────────────────────────────────────────

/**
 * IMPORTANT: any branch that calls an async function MUST `return true`
 * to keep the sendResponse channel open until the promise resolves.
 * Otherwise the caller's callback receives `undefined`.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === ACTION.GET_ACCOUNT_DATA) {
    getAccountData()
      .then(sendResponse)
      .catch(err => {
        console.error("accountPage.js: GET_ACCOUNT_DATA failed:", err);
        sendResponse(null);
      });
    return true; // async response
  }

  if (request.action === ACTION.NAVIGATE_TO_EVENT_REG) {
    const accountId = getAccountIdFromUrl();
    if (accountId) {
      chrome.storage.local.set({
        [STORAGE_KEY.ACCOUNT_AUTO_NAV]: {
          accountId,
          currentEventNames: Array.isArray(CONFIG.event.currentEventNames)
            ? CONFIG.event.currentEventNames
            : [CONFIG.event.currentEventNames],
          testEventNames: Array.isArray(CONFIG.event.testEventNames)
            ? CONFIG.event.testEventNames
            : [CONFIG.event.testEventNames],
          timestamp: Date.now(),
        },
      });
      window.location.href = `/admin/accounts/${accountId}/event-registrations?tab=Attendees`;
    }
    sendResponse({ ok: true });
    return false; // sync response, channel already used
  }
});

// end js/accountPage.js