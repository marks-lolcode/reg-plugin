# Claude.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Constraints
- MUST not use verbose answers
- MUST only provide changes in files
- MUST clearly identify where in the file the new/changed code should go
- MUST update project files (`README.md`, `DEVELOPER.MD`, `ANNUAL_UPDATE_GUIDE.md`, `TROUBLESHOOTING.md`, `SETUP.MD`) as changes are made

## What this is
A Chrome Manifest V3 extension used by CONvergence Registration volunteers to validate and complete attendee check-ins inside Neon CRM. The extension itself has no build step — files are loaded directly by Chrome as-is. A Playwright test harness lives in `tests/`; `package.json`, `playwright.config.ts`, and `tsconfig.json` exist only to support those tests (run `npm test`).

## How to run / reload
- Load unpacked: `chrome://extensions` → Developer mode → Load unpacked → repo root.
- After editing any file: click the refresh icon on the extension card in `chrome://extensions`.
- Inspect the service worker: extension card → Details → "Inspect views: service worker".
- Inspect content scripts: open DevTools on the Neon page itself.
- Test event in Neon has ID 142 ("CONvergence Example For Training Only") — use this, never a real registration.
- Testing manager-override password is `reggie` (its hash lives in `config.js`).

## How to run tests
- `npm install` once to fetch Playwright.
- `npm test` runs the full suite; `npm run test:smoke` runs `green-adult-clean` only; `npm run test:headed` runs with a visible Chrome window.
- Specs live in `tests/specs/`, fixtures in `tests/fixtures/`, helpers in `tests/helpers/`. The harness loads the unpacked extension via Playwright's `--disable-extensions-except` / `--load-extension` Chrome flags — there is no separate build step.

## Architecture

Content scripts are injected by URL pattern (see `manifest.json` → `content_scripts`). They are plain (non-module) scripts loaded in this order:

1. `shared/js/constants-base.js` — framework constants: `STATE`, `EXTENSION_MODE`, `ERROR_MESSAGES`, `dbg()`, and the icon-machinery `STORAGE_KEY` entries (`MANAGEMENT_OVERRIDE`, `PENDING_ICON_UPDATE`, `REGISTRATION_ERROR`, `EXTENSION_MODE`).
2. `config.js` — annual settings, including `CONFIG.debug` and `CONFIG.merch.items`.
3. `js/constants.js` — app-specific globals: `REG_STATUS`, `ACTION`, `CONDITION`, `EVENT_MATCH`. Mutates `STORAGE_KEY` to add app keys (`ATTENDEE`, `ATTENDEE_MERCH`, `REGISTRATIONS`, etc.) without redeclaring it.
4. The per-URL content script(s) listed in the table below.

Do not add `import` / `export`. The `shared/` folder exists to keep framework-level helpers (constants, icon cache, hashing) separate from app-specific code; it is internal organization, not a cross-extension boundary.

### Modes

The extension ships two flows in one install, gated by `STORAGE_KEY.EXTENSION_MODE` (set on the options page; defaults to `EXTENSION_MODE.REG`):

- `EXTENSION_MODE.REG` — badge check-in. `js/popup.js` drives the UI; `js/attendeeContact.js` scrapes and writes the attendee form.
- `EXTENSION_MODE.MERCH` — merchandise pickup. `js/popup-merch.js` drives the UI; `js/merch-attendee.js` scrapes and writes the attendee form.

`js/popup.js`'s `displayPopup()` reads mode first and delegates to `displayMerchPopup()` (defined in `js/popup-merch.js`) when MERCH is active. Content scripts loaded on the same page check mode at the top of their IIFE and the off-mode one returns early so they don't compete for storage.

### Flow (REG mode)

```
Neon page loads
  → background.js (service worker) sees the URL via webNavigation
  → sends ACTION.GET_* message to the matching content script
  → content script scrapes the page, returns a state object
  → background.js writes the result to chrome.storage.local and updates the toolbar icon
  → user clicks toolbar → popup.html → popup.js reads mode (REG) and renders
    • on the registrations view, popup.js gates on STORAGE_KEY.NOTE_ACKNOWLEDGED
      and shows the note screen first if the registration carries a note
      (see buildRegistrationsViewOrNote in js/popup.js)
  → popup.js triggers ACTION.INCREMENT_BADGE_COUNT → attendeeContact.js writes fields and submits form
```

### Flow (MERCH mode)

```
Neon attendee page loads
  → attendeeContact.js IIFE sees MERCH mode, returns early (but its message listener stays registered)
  → merch-attendee.js IIFE scrapes via readFieldValueByLabel (walks .form-group.edit-attendee divs):
    • source field (T-shirt session select OR Souvenir Guide radio.optionId) tested against CONFIG.merch.items[].source matcher
    • pickup field (text input) read for already-picked-up state
  → writes STORAGE_KEY.ATTENDEE_MERCH and fires PENDING_ICON_UPDATE
  → user clicks toolbar → popup.html → popup.js reads mode (MERCH) → displayMerchPopup()
    • popup-merch.js reads STORAGE_KEY.ATTENDEE_MERCH; on miss, falls back to ACTION.GET_ATTENDEE_MERCH (fresh on-demand scrape)
    • renders one checkbox per ordered item; already-picked-up items are checked+disabled
  → click Confirm Pickup → ACTION.WRITE_MERCH_PICKUP → merch-attendee.js writes date/time
    to each named pickup field (MM/DD/YYYY HH:MM, 24-hour), arms ACTION.ARM_POST_CHECKIN_REDIRECT,
    clicks Save. background.js bounces the tab to the dashboard.
```

### URL pattern → content scripts

| URL pattern | Scripts (in manifest load order, after shared+config+constants) |
|---|---|
| `/admin/accounts/*` | `js/accountPage.js` |
| `/np/admin/event/attendeeEdit.do*` | `js/attendeeContact.js`, `js/merch-attendee.js` |
| `/np/admin/event/contactSelect.do*` | `js/attendeeContact.js`, `js/merch-attendee.js` |
| `/np/admin/event/eventRegDetails.do*` | `js/registrations.js` (mode-aware: in MERCH mode it skips reg validation and attaches a per-attendee merch summary using `readField()` + `readCartLineValue()`) |

`js/merch-attendee.js` is loaded AFTER `js/attendeeContact.js` so that helpers defined as content-script globals in attendeeContact.js (`buildCustomFieldLabelMap`, etc.) are in scope.

Other entry points:
- `popup.html` loads `shared/js/constants-base.js`, `config.js`, `js/constants.js`, `js/popup.js`, `js/popup-merch.js` (popup UI dispatcher + reg + merch).
- `extension_options_page.html` is the manifest `options_ui` page; loads `shared/js/constants-base.js`, `shared/js/crypto.js`, `config.js`, `js/constants.js`, `js/options.js` (mode radio + manager-override toggle).
- `js/background.js` is the MV3 service worker. It uses `importScripts("../shared/js/constants-base.js", "../config.js", "constants.js", "../shared/js/background-core.js")` (paths relative to `js/background.js`) — keep that working when moving files. Icon caching, `setIcon`, and `worstStateFromRows` live in `shared/js/background-core.js` and are mode-agnostic.

Icons are rendered as `ImageData` (not paths) because `setIcon({ path })` is unreliable from an MV3 service worker. The toolbar face is **mode-aware**: REG mode uses `assets/wink-{state}-{size}.png`, MERCH mode uses `assets/connie-{state}-{size}.png` (states green/yellow/red at 19/38; plus `{prefix}-black-{16,19,38}.png` for the idle default icon). `setIcon()` and `applyDefaultIconForMode()` in `shared/js/background-core.js` pick the prefix from `STORAGE_KEY.EXTENSION_MODE` (mapping in `ICON_PREFIX_BY_MODE`), falling back to wink if a file is missing. `background.js` re-applies the icon when `EXTENSION_MODE` changes. The "M" badge for Manager Override is drawn over the cached ImageData at runtime.

## Key conventions
- **Every cross-script message MUST use an `ACTION.*` constant** from `js/constants.js`. Never raw strings.
- **Every `chrome.storage.local` key MUST come from `STORAGE_KEY.*`** in `js/constants.js`. If you reference an undefined key, JS silently coerces it to the literal string `"undefined"` — add the key to `STORAGE_KEY` first.
- **Every popup-displayed error MUST use an `ERROR_MESSAGES.*` template** from `js/constants.js`. Unknown keys fall back to `UNKNOWN_ERROR`.
- **Blocking/warning conditions** are keyed by `CONDITION.*` and must appear in `CONFIG.conditionOrder` (in `config.js`) to be rendered.
- **Hold messages order** in `CONFIG.holdMessages` MUST match the hold-index order used in `attendeeContact.js` (`[regHold, artShowHold, opsHold]`).
- **Custom fields are resolved by label substring** (`CONFIG.fieldLabels`), then positional within duplicates — three fields share the label "HOLD", resolved by order. If Neon reorganizes fields, hand-trace the field indexes in DevTools against the live page.
- **Attendee state object** built by `attendeeContact.js` and consumed by `popup.js` — if you change its shape, update both. Documented in `DEVELOPER.MD`.
- **Merch state object** built by `merch-attendee.js` and consumed by `popup-merch.js` — shape `{ accountId, attendeeId, legalName, preferredName, items: [{name, ordered, variant, alreadyPickedUp, pickedUpAt}] }`. Stored under `STORAGE_KEY.ATTENDEE_MERCH`. If you change the shape, update both files.
- **Merch surfaced in REG flow** — `getAttendeeInfo()` (`js/attendeeContact.js`) calls `scrapeAttendeeMerch()` (a content-script global from `js/merch-attendee.js`) and attaches a pruned, names-only list of pending items as `attendee.merch` (filter: ordered AND not yet picked up). `popup.js`'s `buildAttendeeView` renders one "{name} Ordered" line above the action button per entry and switches the button text from `"Badge Issued"` to `"Badge Issued - Send to Merchandise"` when the array is non-empty. Already-picked-up items are filtered out before reaching popup.
- **Mode awareness in content scripts:** any content script that reads/writes for a specific mode must check `STORAGE_KEY.EXTENSION_MODE` at the top of its IIFE and return early if it's not its mode, leaving message listeners registered. Today: `attendeeContact.js` bails in MERCH; `merch-attendee.js` bails in REG; `registrations.js` is mode-aware in its scrape rather than bailing (it serves both modes).
- **Merch field labels match by substring** like the rest of the form-label resolution. `CONFIG.merch.items[].source.label` and `pickupFieldLabel` are substrings of the actual Neon labels — keep them generic enough to survive minor copy edits but specific enough not to collide. Matcher modes: `"anyExcept"` (ordered if value differs from `notOrderedValue`; the value IS the variant) and `"substring"` (ordered if value contains `matchValue`; no variant).
- **Date/time written to merch pickup fields** is `MM/DD/YYYY HH:MM` 24-hour, from `formatMerchDateTime()` in `merch-attendee.js`. Change there if Neon's text-field validation gets fussier.
- **Management password** is only stored as a SHA-256 hex hash in `CONFIG.managementPasswordHash`. The plaintext goes nowhere in the repo. Hashing helper lives in `shared/js/crypto.js`.
- **Debug logging:** use `dbg(...)` (defined in `shared/js/constants-base.js`) for chatty per-page-load traces, gated on `CONFIG.debug`. Keep `console.error` / `console.warn` for messages a developer always needs to see. The merch content script uses plain `console.log` with a `merch-attendee.js:` prefix so volunteers can read it directly when debugging field-label mismatches.

## Annual update surface area
All yearly edits live in `config.js` (search `UPDATE EACH YEAR`) plus `manifest.json` `version`. Specifically:
- `CONFIG.event.currentEventNames` and `testEventNames`
- `CONFIG.ticketTypes[].nameIncludes`
- `CONFIG.managementPasswordHash` (regenerate via `tools/generate-password-hash.html`)
- `CONFIG.merch.items[]` — merch catalog. Each item declares `source.label` (substring of registration field label), `source.matchMode` + `notOrderedValue`/`matchValue`, and `pickupFieldLabel` (substring of the Neon attendee form's pickup field for this item). The two pickup fields must exist on the attendee form in Neon — adding new merch items usually requires adding new pickup fields in Neon first.

The change set is enumerated in `ANNUAL_UPDATE_GUIDE.md` — keep that guide in sync whenever the shape of `CONFIG` changes.
