// js/background.js

// Service worker for the CONvergence Check-In extension.
// Handles icon updates based on page context and management override state.
//
// importScripts paths are relative to THIS file's location (js/background.js):
//   "../config.js"  → extension root/config.js
//   "constants.js"  → js/constants.js  (same folder as this file)

importScripts("../config.js", "constants.js");

// ── ICON SIZES ─────────────────────────────────────────────────────────

const ICON_SIZES = [19, 38];

// ── ICON CACHES ────────────────────────────────────────────────────────

/**
 * normalIconCache["state-size"]   → ImageData for the plain colored icon
 * overrideIconCache["state-size"] → ImageData for the icon with "M" badge
 *
 * Both caches use ImageData so that chrome.action.setIcon always receives
 * { imageData } rather than { path }. Path-based setIcon silently fails
 * from a MV3 service worker context in some Chrome versions; ImageData works
 * reliably in both cases.
 */
const normalIconCache   = {};
const overrideIconCache = {};

/**
 * Loads every colored icon PNG and stores it as ImageData in normalIconCache.
 * Also generates an "M" badge variant and stores it in overrideIconCache.
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

        // ── Normal icon ──
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

        console.log(`Icon cached: ${state}-${size}`);
      } catch (err) {
        console.error(`Failed to cache icon ${state}-${size}:`, err);
      }
    }
  }
}

// ── ICON SETTER ────────────────────────────────────────────────────────

/**
 * Sets the extension icon for a given tab using pre-generated ImageData.
 * Always uses imageData (never path strings) to avoid a Chrome MV3 service
 * worker bug where path-based setIcon silently fails.
 * @param {number} tabId
 * @param {string} state - STATE.GREEN | STATE.YELLOW | STATE.RED
 */
async function setIcon(tabId, state) {
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

generateIconCaches().then(() => {
  console.log("background.js: all icon caches ready");
});

// ── STORAGE CHANGE LISTENER ────────────────────────────────────────────

/**
 * Central handler for all storage changes that should trigger an icon update.
 *
 * PENDING_ICON_UPDATE: written by content scripts after committing their data.
 *   chrome.storage.onChanged reliably wakes the SW even if it was terminated,
 *   unlike chrome.runtime.sendMessage which is silently dropped if the SW isn't
 *   yet ready.
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
        const rows       = registrations.data;
        const worstState = rows.every(r => r.state === STATE.RED)
          ? STATE.RED
          : rows.some(r => r.state === STATE.YELLOW)
            ? STATE.YELLOW
            : STATE.GREEN;
        await setIcon(tab.id, worstState);
      }
    }
  }

  // ── Management override toggled ──
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
        const rows       = registrations.data;
        const worstState = rows.every(r => r.state === STATE.RED)
          ? STATE.RED
          : rows.some(r => r.state === STATE.YELLOW)
            ? STATE.YELLOW
            : STATE.GREEN;
        await setIcon(tab.id, worstState);
      }
    } else if (url.includes("neoncrm.com")) {
      await setIcon(tab.id, STATE.GREEN);
    }
  }
});

// ── WEBNAV LISTENER (fallback) ─────────────────────────────────────────

/**
 * Fallback for non-content-script Neon pages and as a safety net in case
 * the storage-based trigger didn't fire (e.g. storage write failed).
 */
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;

  const url = details.url ?? "";

  // Non-content-script Neon pages — set green directly
  if (url.includes("neoncrm.com") && !url.includes("attendeeEdit") && !url.includes("eventRegDetails")) {
    await setIcon(details.tabId, STATE.GREEN);
    return;
  }

  if (!url.includes("attendeeEdit") && !url.includes("eventRegDetails")) return;

  // Poll with retries as a fallback — the storage.onChanged path will usually win first
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
        const rows       = response.data ?? [];
        const worstState = rows.every(r => r.state === STATE.RED)
          ? STATE.RED
          : rows.some(r => r.state === STATE.YELLOW)
            ? STATE.YELLOW
            : STATE.GREEN;
        await setIcon(details.tabId, worstState);
      }
      console.log(`background.js: webNav fallback succeeded attempt ${attempt + 1} tab ${details.tabId}`);
      return;
    } catch (err) {
      console.warn(`background.js: webNav fallback attempt ${attempt + 1} failed:`, err.message);
    }
  }
});

// end js/background.js
