// js/background.js
// ============================================================================
// CONvergence Check-In Extension — Service Worker
// ============================================================================
//
// This is the Manifest V3 service worker. It runs in the background and is
// responsible for two things:
//
//   1. Updating the extension toolbar icon (green / yellow / red, with an
//      optional "M" badge when Manager Override is active) based on what
//      the content scripts have scraped from the current Neon page.
//
//   2. Receiving error reports from content scripts and storing them in
//      chrome.storage.local so the popup can display them.
//
// importScripts paths are relative to THIS file's location (js/background.js):
//   "../config.js"  → extension root/config.js
//   "constants.js"  → js/constants.js  (same folder as this file)
// ============================================================================

importScripts("../config.js", "constants.js");

// ── ICON SIZE LIST ─────────────────────────────────────────────────────
// Chrome can use a 19px icon for normal displays and a 38px icon for
// high-DPI displays. We generate both for every (state, override) combo.
const ICON_SIZES = [19, 38];

// ── ICON CACHES ────────────────────────────────────────────────────────
//
// normalIconCache["state-size"]   → ImageData for the plain colored icon
// overrideIconCache["state-size"] → ImageData for the icon with "M" badge
//
// Both caches use ImageData so that chrome.action.setIcon always receives
// { imageData } rather than { path }. Path-based setIcon silently fails
// from a MV3 service worker context in some Chrome versions; ImageData
// works reliably in both cases.
const normalIconCache   = {};
const overrideIconCache = {};

// Set to `true` once generateIconCaches() has populated the caches.
// setIcon() checks this flag before trying to read from the caches —
// if it's still false the call is skipped (and logged).
let iconCachesReady = false;

// ── ICON CACHE GENERATION ──────────────────────────────────────────────

/**
 * Loads every colored icon PNG and stores it as ImageData in normalIconCache.
 * Also generates an "M" badge variant for each icon and stores it in
 * overrideIconCache. This runs once at service-worker startup.
 *
 * If individual icon files fail to load, the loop continues so that any
 * remaining icons still get cached and the extension can fall back to
 * showing them where possible.
 */
async function generateIconCaches() {
  for (const state of [STATE.GREEN, STATE.YELLOW, STATE.RED]) {
    for (const size of ICON_SIZES) {
      try {
        const url      = chrome.runtime.getURL(`assets/wink-${state}-${size}.png`);
        const response = await fetch(url);
        const blob     = await response.blob();
        const bitmap   = await createImageBitmap(blob);

        const canvas = new OffscreenCanvas(size, size);
        const ctx    = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0, size, size);

        // ── Plain icon ──
        normalIconCache[`${state}-${size}`] = ctx.getImageData(0, 0, size, size);

        // ── Override icon: draw "M" badge on top ──
        const badgeRadius = Math.max(4, Math.round(size * 0.28));
        const badgeX      = size - badgeRadius - 1;
        const badgeY      = size - badgeRadius - 1;

        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(20, 20, 20, 0.92)";
        ctx.fill();

        const fontSize = Math.max(5, Math.round(badgeRadius * 1.2));
        ctx.font         = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle    = "#ffffff";
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("M", badgeX, badgeY + 1);

        overrideIconCache[`${state}-${size}`] = ctx.getImageData(0, 0, size, size);

        console.log(`background.js: icon cached: ${state}-${size}`);
      } catch (err) {
        console.error(`background.js: failed to cache icon ${state}-${size}:`, err);
      }
    }
  }
  // NOTE: do NOT assign iconCachesReady here. The startup block below
  // sets it to true *after* this async function resolves so that callers
  // can rely on it being a single, well-defined transition.
}

// ── ICON SETTER ────────────────────────────────────────────────────────

/**
 * Sets the extension icon for a given tab using pre-generated ImageData.
 * Always uses imageData (never path strings) to avoid a Chrome MV3 service
 * worker bug where path-based setIcon silently fails.
 *
 * @param {number} tabId
 * @param {string} state - STATE.GREEN | STATE.YELLOW | STATE.RED
 */
async function setIcon(tabId, state) {
  if (!iconCachesReady) {
    console.warn("background.js: icon caches not ready yet, skipping setIcon");
    return;
  }
  const overrideResult     = await chrome.storage.local.get(STORAGE_KEY.MANAGEMENT_OVERRIDE);
  const managementOverride = overrideResult[STORAGE_KEY.MANAGEMENT_OVERRIDE] ?? false;

  const cache     = managementOverride ? overrideIconCache : normalIconCache;
  const imageData = {};

  for (const size of ICON_SIZES) {
    const cached = cache[`${state}-${size}`];
    if (cached) imageData[size] = cached;
  }

  if (Object.keys(imageData).length > 0) {
    await chrome.action.setIcon({ tabId, imageData });
    console.log(`background.js: icon set → tab ${tabId} state=${state} override=${managementOverride}`);
    return;
  }

  console.error(`background.js: icon cache empty for state=${state}, cannot set icon`);
}

// ── STARTUP ────────────────────────────────────────────────────────────
// Trigger the icon cache build at service-worker load. iconCachesReady
// flips to true only after every icon (or its best-effort placeholder)
// has been processed.
generateIconCaches().then(() => {
  iconCachesReady = true;
  console.log("background.js: all icon caches ready");
});

// ── HELPER: COMPUTE WORST STATE FROM REGISTRATION ROWS ─────────────────

/**
 * Given an array of attendee rows (each with a `state` field), returns
 * the "worst" state for icon display:
 *   all red       → RED
 *   any yellow    → YELLOW
 *   otherwise     → GREEN
 *
 * Extracted so the same rule is applied to both the storage-change
 * handler and the webNavigation fallback below.
 */
function worstStateFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return STATE.GREEN;
  if (rows.every(r => r.state === STATE.RED))    return STATE.RED;
  if (rows.some(r => r.state === STATE.YELLOW))  return STATE.YELLOW;
  return STATE.GREEN;
}

// ── STORAGE CHANGE LISTENER ────────────────────────────────────────────

/**
 * Central handler for all storage changes that should trigger an icon update.
 *
 * PENDING_ICON_UPDATE: written by content scripts after committing their data.
 *   chrome.storage.onChanged reliably wakes the SW even if it was terminated,
 *   unlike chrome.runtime.sendMessage which is silently dropped if the SW
 *   isn't yet ready.
 *
 * MANAGEMENT_OVERRIDE: written by options.js when the override is toggled.
 *   Re-reads stored data and refreshes the icon to show/hide the "M" badge.
 */
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;

  // ── Icon update triggered by content script ──
  if (changes[STORAGE_KEY.PENDING_ICON_UPDATE]) {
    const pending = changes[STORAGE_KEY.PENDING_ICON_UPDATE].newValue;
    if (!pending) return;

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab  = tabs[0];
    if (!tab) return;

    const url = tab.url ?? "";

    if (pending.page === "attendee" && url.includes("attendeeEdit")) {
      const result   = await chrome.storage.local.get(STORAGE_KEY.ATTENDEE);
      const attendee = result[STORAGE_KEY.ATTENDEE];
      if (attendee?.state) {
        await setIcon(tab.id, attendee.state);
      }

    } else if (pending.page === "registrations" && url.includes("eventRegDetails")) {
      const result        = await chrome.storage.local.get(STORAGE_KEY.REGISTRATIONS);
      const registrations = result[STORAGE_KEY.REGISTRATIONS];
      if (registrations?.data) {
        await setIcon(tab.id, worstStateFromRows(registrations.data));
      }

    } else if (pending.page === "account" && url.includes("/admin/accounts/")) {
      const result  = await chrome.storage.local.get(STORAGE_KEY.ACCOUNT);
      const account = result[STORAGE_KEY.ACCOUNT];
      if (account?.state) {
        await setIcon(tab.id, account.state);
      }
    }
  }

  // ── Management override toggled — refresh icon for the active tab ──
  if (changes[STORAGE_KEY.MANAGEMENT_OVERRIDE]) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab  = tabs?.[0];
    if (!tab) return;

    const url = tab.url ?? "";

    if (url.includes("attendeeEdit")) {
      const result   = await chrome.storage.local.get(STORAGE_KEY.ATTENDEE);
      const attendee = result[STORAGE_KEY.ATTENDEE];
      if (attendee?.state) await setIcon(tab.id, attendee.state);

    } else if (url.includes("eventRegDetails")) {
      const result        = await chrome.storage.local.get(STORAGE_KEY.REGISTRATIONS);
      const registrations = result[STORAGE_KEY.REGISTRATIONS];
      if (registrations?.data) {
        await setIcon(tab.id, worstStateFromRows(registrations.data));
      }

    } else if (url.includes("/admin/accounts/")) {
      const result  = await chrome.storage.local.get(STORAGE_KEY.ACCOUNT);
      const account = result[STORAGE_KEY.ACCOUNT];
      if (account?.state) await setIcon(tab.id, account.state);

    } else if (url.includes("neoncrm.com")) {
      await setIcon(tab.id, STATE.GREEN);
    }
  }
});

// ── WEB NAVIGATION FALLBACK ────────────────────────────────────────────

/**
 * Fallback for non-content-script Neon pages and as a safety net in case
 * the storage-based trigger didn't fire (e.g. storage write failed).
 *
 * Retries the content-script message up to 5 times with increasing delay
 * so we don't fail just because the page DOM wasn't ready yet.
 */
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;

  const url = details.url ?? "";

  // Non-content-script Neon pages — set green directly to acknowledge
  // that we're "in Neon" even though we have nothing specific to evaluate.
  if (
    url.includes("neoncrm.com") &&
    !url.includes("attendeeEdit") &&
    !url.includes("eventRegDetails") &&
    !url.includes("/admin/accounts/")
  ) {
    await setIcon(details.tabId, STATE.GREEN);
    return;
  }

  // Only the attendeeEdit and eventRegDetails pages support the
  // request/response message API used by this fallback.
  if (!url.includes("attendeeEdit") && !url.includes("eventRegDetails")) return;

  const action = url.includes("attendeeEdit")
    ? ACTION.GET_ATTENDEE_DATA
    : ACTION.GET_REGISTRATIONS;

  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
    try {
      const response = await chrome.tabs.sendMessage(details.tabId, { action });
      if (!response) continue;

      if (action === ACTION.GET_ATTENDEE_DATA) {
        await setIcon(details.tabId, response.state);
      } else {
        await setIcon(details.tabId, worstStateFromRows(response.data ?? []));
      }
      console.log(`background.js: webNav fallback succeeded attempt ${attempt + 1} tab ${details.tabId}`);
      return;
    } catch (err) {
      console.warn(`background.js: webNav fallback attempt ${attempt + 1} failed:`, err.message);
    }
  }
});

// ============================================================================
// ERROR MESSAGE HANDLER
// ============================================================================
// Listens for error messages from content scripts and stores them in
// chrome.storage.local for the popup to display.

/**
 * User-friendly error message templates indexed by error type. The
 * content script sends an `errorType` key; the matching template's
 * title/detail/action are stored alongside the raw debug info.
 *
 * Keeping the table inside background.js (instead of importing it from
 * registrationErrors.js) ensures the service worker has everything it
 * needs without depending on another script's load order.
 */
const ERROR_MESSAGES = {
  NO_VALID_EVENT: {
    title: "No event found",
    detail: "We couldn't locate your current event. Please make sure you're viewing the correct account page.",
    action: "Try refreshing the page and clicking the extension icon again",
  },
  NO_SUCCEEDED_REGISTRATION: {
    title: "No active registrations found",
    detail: "This attendee doesn't have any confirmed registrations for the current event.",
    action: "Verify the attendee is registered for this event in Neon",
  },
  NAVIGATION_FAILED: {
    title: "Navigation error",
    detail: "We couldn't navigate to the registration page automatically.",
    action: "Navigate to the event registrations page manually and try again",
  },
  SCRIPT_INJECTION_FAILED: {
    title: "Unable to read account data",
    detail: "The extension encountered a technical issue reading the page.",
    action: "Refresh the page and try clicking the extension icon again",
  },
  TIMEOUT: {
    title: "Request took too long",
    detail: "The page didn't load quickly enough. This can happen if you're on a slow connection.",
    action: "Wait a moment and try again",
  },
  UNKNOWN_ERROR: {
    title: "Something went wrong",
    detail: "An unexpected error occurred while processing your request.",
    action: "Try refreshing the page and try again. If the problem persists, contact IT",
  },
};

/**
 * Persist an error record in chrome.storage.local under STORAGE_KEY.REGISTRATION_ERROR.
 * popup.js reads this key and renders an alert on the next popup open.
 *
 * @param {string} errorType    — one of the keys in ERROR_MESSAGES
 * @param {*}      originalError — Error object or string from the caller
 * @param {object} context       — optional debug data (accountId, etc.)
 */
async function recordErrorInStorage(errorType, originalError, context = {}) {
  const timestamp = Date.now();

  console.error(
    `[BackgroundScript] Recording error: ${errorType}`,
    { originalError, context }
  );

  const messageTemplate = ERROR_MESSAGES[errorType] || ERROR_MESSAGES.UNKNOWN_ERROR;

  const errorState = {
    type: errorType,
    timestamp,
    title:  messageTemplate.title,
    detail: messageTemplate.detail,
    action: messageTemplate.action,
    debugInfo: {
      originalMessage: String(originalError),
      context,
      timestamp: new Date(timestamp).toISOString(),
    },
  };

  await chrome.storage.local.set({ [STORAGE_KEY.REGISTRATION_ERROR]: errorState });
  console.log("[BackgroundScript] Error stored for popup display:", errorState);
}

/**
 * Message listener for RECORD_REGISTRATION_ERROR messages from content scripts.
 *
 * IMPORTANT: this listener is async — we MUST return true to keep the
 * sendResponse channel open until the storage write completes, otherwise
 * the caller's callback may fire before storage actually updates.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RECORD_REGISTRATION_ERROR") {
    recordErrorInStorage(message.errorType, message.originalError, message.context)
      .then(()  => sendResponse({ success: true }))
      .catch(err => {
        console.error("background.js: recordErrorInStorage failed:", err);
        sendResponse({ success: false, error: err?.message });
      });
    return true; // keep sendResponse alive for async work
  }
});

// end js/background.js