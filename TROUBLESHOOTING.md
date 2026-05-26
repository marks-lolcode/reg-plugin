# CONvergence Check-In Extension — Troubleshooting

Quick fixes for problems you may hit on the check-in workstation. If
something here doesn't help, contact IT before the badge line backs up.

---

## Yellow banner at the top of the Neon page: "No active CONvergence registration found"

This appears when you click the extension icon on an account page and the
extension navigates to the Attendees tab, but can't auto-open a
registration. It is a **safe fallback**, not a check-in blocker.

What to do:

1. Look at the Attendees table on the Neon page.
2. If the attendee has a CONvergence registration with status `SUCCEEDED`,
   click that row manually to open it.
3. From there the rest of the check-in flow works as normal.

The banner also shows up in two other cases:

- **"Could not find the Attendees table — refresh and try again."** —
  the page took too long to load the registrations table. Reload the Neon
  tab and try the extension icon again.
- **"Could not read the Attendees table layout. Click the registration
  manually."** — Neon may have changed the table structure. The extension
  will still let you check people in manually; tell IT so the lookup can
  be updated.

---

## Extension popup is blank (no buttons, no info)

Almost always a JavaScript parse error in `js/popup.js`. To confirm:

1. Right-click the extension icon → **Inspect popup**. This opens DevTools
   attached to the popup. (Plain left-clicks close the popup; right-click
   keeps it alive.)
2. Look in the Console for a red `SyntaxError`. The line number points
   straight at the broken code.
3. Tell IT. The popup will stay blank until the file is fixed and the
   extension is reloaded.

---

## Popup opens but doesn't react to my click

The content script on the underlying Neon page may have failed to load.

1. With the Neon tab focused, press **F12** to open DevTools.
2. In the **Settings** ⚙ panel, check **Preserve log**.
3. Reload the Neon page. In the Console you should see lines starting
   with `accountPage.js`, `attendeeContact.js`, or `registrations.js`
   depending on the URL.
4. If there are none, the content script didn't inject. Try toggling the
   extension off and on in `chrome://extensions`.

---

## Wrong attendee data showing

The popup reads cached data from `chrome.storage.local`. If the page was
loaded before the extension was installed (or before the latest reload),
the cache may be stale.

1. Reload the Neon page (Ctrl+R / Cmd+R) — this re-scrapes.
2. If still wrong, clear the cache via `chrome://extensions` → Details →
   **Inspect views: service worker** → Application tab → Storage → Local
   Storage → clear all the keys.

---

## Icon stays grey

The extension only colors the icon when it recognizes the page. Greys
mean "I don't know how to read this page."

- Make sure you're on one of: an account page (`/admin/accounts/N`),
  the Attendees tab on event-registrations, an `attendeeEdit.do` page,
  or an `eventRegDetails.do` page.
- If you ARE on one of those and the icon is still grey, reload the page
  once.

---

## Badge Delivered button is missing

When the attendee has unresolved blocking conditions (red banner), the
Badge Delivered button is intentionally hidden — clear the issues first.
If there are no red banners and no missing required fields and the
button still isn't there, see "Extension popup is blank" above.

---

## Debugging recipes (for IT)

- **Content-script logs across navigations** — DevTools on the Neon tab,
  Console → ⚙ → check "Preserve log". Filter by `accountPage`,
  `attendeeContact`, or `registrations`.
- **Service worker logs** — `chrome://extensions` → extension card →
  Details → **Inspect views: service worker**.
- **Popup logs** — right-click the extension icon → **Inspect popup**.
  The popup will still close when it calls `window.close()`, but
  breakpoints fire before that.
- **Storage inspection** — service worker DevTools → Application →
  Storage → Local Storage → `chrome-extension://<id>`.
