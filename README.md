# CONvergence Registration Check-In Extension

A Chrome browser extension used by the CONvergence Registration department
to check in attendees at the convention.

## What It Does

The extension runs inside Chrome while staff are logged into the CONvergence
Neon CRM account. It reads information from the Neon pages, validates whether
an attendee is eligible to receive their badge, and — when the volunteer
confirms check-in — writes the check-in data back to Neon automatically.

**Without the extension**, a volunteer would have to manually read every field
on the page, mentally check all the rules, and type the pickup date, time, and
name into Neon by hand. The extension does all of that automatically and
reduces errors.

## What It Checks

Before allowing check-in, the extension verifies:

- The registration is for **this year's CONvergence** (not a past year or dealer event)
- The registration status is **SUCCEEDED** (fully paid)
- The badge has **not already been issued**
- There are **no holds** on the badge (Art Show, Operations, or Registration)
- For non-transferable badges, the **name on the badge matches** the person presenting
- The attendee's **emergency contact information** is filled in
- For Adult and Teen tickets, the volunteer is reminded to **verify age**
- For Day Pass tickets, the pass is being used on the **correct day**

## What It Does at Check-In

When a volunteer confirms check-in, the extension automatically:

1. Downloads a CSV file for the badge printer
2. Increments the "Number of Active Badges" counter in Neon
3. Writes the attendee's name to the Non-Transferable Name field
4. Records the pickup date and time in the next available pickup slot
5. Submits the Neon form

## File Structure/
├── config.js                        ← ANNUAL UPDATE FILE — edit this each year
├── manifest.json                    ← Chrome extension configuration
├── popup.html                       ← Extension popup window
├── extension_options_page.html      ← Options page (workstation ID, override)
├── assets/                          ← Extension icons
├── _locales/en/                     ← Localisation strings
├── installation/                    ← Page shown on first install
├── js/
│   ├── constants.js                 ← Shared string constants
│   ├── background.js                ← Service worker (page load listeners)
│   ├── popup.js                     ← Popup UI logic
│   ├── options.js                   ← Options page logic
│   ├── attendeeContact.js           ← AttendeeEdit page logic (main check-in)
│   └── registrations.js             ← EventRegDetails page logic
└── tools/
├── generate-password-hash.html  ← Run locally to hash the annual password
└── find-field-indexes.html      ← Run locally if Neon fields stop working

## Key People

| Role | Responsibility |
|---|---|
| Annual updater | Edit `config.js` each year — see `ANNUAL_UPDATE_GUIDE.md` |
| IT volunteer | Maintain code, handle breaks — see `DEVELOPER.md` |
| Registration head | Set workstation IDs, share override password with Help Desk |

## Documentation Index

| Document | Who Should Read It |
|---|---|
| `ANNUAL_UPDATE_GUIDE.md` | Anyone doing the yearly update |
| `SETUP.md` | Anyone setting up a new workstation |
| `TROUBLESHOOTING.md` | Anyone dealing with a problem at con |
| `DEVELOPER.md` | IT volunteers maintaining the code |