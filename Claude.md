# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Constraints
- MUST not use verbose answers
- MUST only provide changes in files
- MUST clearly identify where in the file the new/changed code should go
- MUST update project files (README.MD, DEVELOPER.MD, ANNUAL_UPDATE_GUIDE.md, TROUBLESHOOTING.md) as changes are made

## What this is
A Chrome Manifest V3 extension used by CONvergence Registration volunteers to validate and complete attendee check-ins inside Neon CRM. There is no build step, no package manager, no test framework — files are loaded directly by Chrome as-is.

## How to run / reload
- Load unpacked: `chrome://extensions` → Developer mode → Load unpacked → repo root.
- After editing any file: click the refresh icon on the extension card in `chrome://extensions`.
- Inspect the service worker: extension card → Details → "Inspect views: service worker".
- Inspect content scripts: open DevTools on the Neon page itself.
- Test event in Neon has ID 142 ("CONvergence Example For Training Only") — use this, never a real registration.
- Testing manager-override password is `reggie` (its hash lives in `config.js`).

## Architecture

Content scripts are injected by URL pattern (see `manifest.json` → `content_scripts`). They are plain (non-module) scripts. `config.js` and `js/constants.js` are injected first so `CONFIG`, `STATE`, `ACTION`, `STORAGE_KEY`, `CONDITION`, `EVENT_MATCH`, `REG_STATUS` are available as globals — do not add `import`/`export`.

Flow:
```
Neon page loads
  → background.js (service worker) sees the URL via webNavigation
  → sends ACTION.GET_* message to the matching content script
  → content script scrapes the page, returns a state object
  → background.js writes the result to chrome.storage.local and updates the toolbar icon
  → user clicks toolbar → popup.html → popup.js reads storage and renders
  → popup.js triggers ACTION.INCREMENT_BADGE_COUNT → attendeeContact.js writes fields and submits form
```

| URL pattern | Script |
|---|---|
| `/admin/accounts/*` | `js/Accountpage.js` |
| `/np/admin/event/attendeeEdit.do*` | `js/attendeeContact.js` |
| `/np/admin/event/contactSelect.do*` | `js/attendeeContact.js` |
| `/np/admin/event/eventRegDetails.do*` | `js/registrations.js` |

The service worker uses `importScripts("../config.js", "constants.js")` (paths relative to `js/background.js`) — keep that working when moving files.

Icons are rendered as `ImageData` (not paths) from `assets/wink-{state}-{size}.png` because `setIcon({ path })` is unreliable from an MV3 service worker. The "M" badge for Manager Override is drawn over the cached ImageData at runtime.

## Key conventions
- **Every cross-script message MUST use an `ACTION.*` constant** from `js/constants.js`. Never raw strings.
- **Every `chrome.storage.local` key MUST come from `STORAGE_KEY.*`** in `js/constants.js`.
- **Blocking/warning conditions** are keyed by `CONDITION.*` and must appear in `CONFIG.conditionOrder` (in `config.js`) to be rendered.
- **Hold messages order** in `CONFIG.holdMessages` MUST match the hold-index order used in `attendeeContact.js` (`[regHold, artShowHold, opsHold]`).
- **Custom fields are resolved by label substring** (`CONFIG.fieldLabels`), then positional within duplicates — three fields share the label "HOLD", resolved by order. If Neon reorganizes fields, run `tools/find-field-indexes.html`.
- **Attendee state object** built by `attendeeContact.js` and consumed by `popup.js` — if you change its shape, update both. Documented in `DEVELOPER.MD`.
- **Management password** is only stored as a SHA-256 hex hash in `CONFIG.managementPasswordHash`. The plaintext goes nowhere in the repo. `tools/generate-password-hash.html` is `.gitignore`d — do not commit it.

## Annual update surface area
All yearly edits live in `config.js` (search `UPDATE EACH YEAR`) plus `manifest.json` `version`. The change set is enumerated in `ANNUAL_UPDATE_GUIDE.md` — keep that guide in sync whenever the shape of `CONFIG` changes.
