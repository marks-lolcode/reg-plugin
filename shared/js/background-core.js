// shared/js/background-core.js
//
// ============================================================================
// Generic MV3 service-worker helpers: icon caching, icon setter, and the
// state-aggregation rule used by extensions whose toolbar icon reflects
// the worst of several per-row states.
// ============================================================================
//
// Assumes the following globals are already in scope (load order in the
// caller's importScripts):
//   - STATE                          (from shared/js/constants-base.js)
//   - STORAGE_KEY.MANAGEMENT_OVERRIDE (from shared/js/constants-base.js)
//
// Assumes the extension exposes colored icons at:
//   assets/wink-{green|yellow|red}-{19|38}.png
//
// Side-effects on load: kicks off generateIconCaches() and resolves
// iconCachesReadyPromise when every icon has been processed. Callers may
// await iconCachesReadyPromise before calling setIcon() if they need a
// guarantee, but setIcon() also no-ops safely while the cache is warming.
// ============================================================================

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
        const ctx    = canvas.getContext("2d", { willReadFrequently: true });
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

        console.log(`background-core.js: icon cached: ${state}-${size}`);
      } catch (err) {
        console.error(`background-core.js: failed to cache icon ${state}-${size}:`, err);
      }
    }
  }
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
    console.warn("background-core.js: icon caches not ready yet, skipping setIcon");
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
    console.log(`background-core.js: icon set → tab ${tabId} state=${state} override=${managementOverride}`);
    return;
  }

  console.error(`background-core.js: icon cache empty for state=${state}, cannot set icon`);
}

// ── STARTUP ────────────────────────────────────────────────────────────
// Trigger the icon cache build at service-worker load. iconCachesReady
// flips to true only after every icon has been processed.
const iconCachesReadyPromise = generateIconCaches().then(() => {
  iconCachesReady = true;
  console.log("background-core.js: all icon caches ready");
});

// ── STATE AGGREGATION HELPER ───────────────────────────────────────────

/**
 * Given an array of rows (each with a `state` field), returns the "worst"
 * state for icon display:
 *   all red       → RED
 *   any yellow    → YELLOW
 *   otherwise     → GREEN
 */
function worstStateFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return STATE.GREEN;
  if (rows.every(r => r.state === STATE.RED))    return STATE.RED;
  if (rows.some(r => r.state === STATE.YELLOW))  return STATE.YELLOW;
  return STATE.GREEN;
}

// end shared/js/background-core.js
