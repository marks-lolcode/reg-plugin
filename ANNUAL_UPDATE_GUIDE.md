# CONvergence Check-In Extension — Annual Update Guide

This guide walks through every change needed to prepare the extension for
a new convention year. You will need access to the GitHub repository and
to Neon CRM.

**You do not need to be a programmer to do this.**
Every change is in one file — `config.js` — and each change is clearly marked.

---

## Before You Start

You will need:
- Access to the GitHub repository
- Access to Neon CRM (to look up the event ID)
- The new Management Override password (decided by Registration leadership)
- About 20 minutes

---

## Step 1 — Find This Year's Event ID in Neon

1. Log into Neon CRM
2. Go to **Events** and find this year's CONvergence event
3. Click on the event to open it
4. Look at the URL in your browser's address bar
5. Find the number after `eventId=` — for example:
   `...eventRegDetails.do?id=**312**...`
6. Write this number down — you will need it in Step 2

---

## Step 2 — Update config.js

Open `config.js` in a text editor (Notepad works fine on Windows).

Search for the text `UPDATE EACH YEAR` — there are a small number of places
to update. Here is each one:

---

### 2a. Event ID

Find this section:
```javascript
event: {
  currentEventId: "248",   // ← UPDATE EACH YEAR
  testEventId:    "142",   // ← CONvergence Training Event — do not change
},
```

Replace `"248"` with the event ID you found in Step 1.
Leave `testEventId` alone — it is the training event and never changes.

**Example:** If this year's event ID is 312, change it to:
```javascript
currentEventId: "312",
```

---

### 2b. Management Override Password Hash

The real password is never stored in the code. Instead, you store a
"hash" — a scrambled version that the extension can check against without
ever knowing the real password.

**To generate the hash:**
1. Find the file `tools/generate-password-hash.html` on your computer
   (it should be in the extension folder — do NOT open it from GitHub,
   open it from your local copy)
2. Open it in Chrome by double-clicking it or dragging it into Chrome
3. Type the new Management Override password into the box
4. Click **Generate**
5. Click **Copy Hash**

Now find this line in `config.js`:
```javascript
managementPasswordHash: "REPLACE_THIS_WITH_GENERATED_HASH",  // ← UPDATE EACH YEAR
```

Replace the text between the quote marks with the hash you just copied.

**Important:** Never put the actual password in `config.js`.
Share the real password with Help Desk staff verbally or through a
password manager. Do not send it by email, Slack, or GitHub.

---

### 2c. Confirm Adult Minimum Age

Find this line:
```javascript
adultMinimumAge: 18,  // ← confirm each year (typically stays 18)
```

Confirm this is still the correct minimum age for an Adult badge.
This almost never changes, but it is worth a quick check with Registration
leadership each year.

---

### 2d. Confirm Ticket Type Names

Find the `ticketTypes` section. It looks like this:
```javascript
ticketTypes: [
  { nameIncludes: "Adult", ... },
  { nameIncludes: "Teen",  ... },
  { nameIncludes: "Youth", ... },
  { nameIncludes: "Child", ... },
],
```

Log into Neon, open any attendee on this year's event, and look at the
ticket name in the dropdown. Confirm that each ticket name still contains
the word listed in `nameIncludes`.

**Example:** If Neon now calls the ticket "CONvergence Adult Weekend Pass"
instead of just "Adult Weekend Pass", the word "Adult" is still in the name,
so no change is needed.

If a ticket name no longer contains the matching word, update `nameIncludes`
to match a word that does appear in the new name.

---

## Step 3 — Update the Version Number in manifest.json

Open `manifest.json` in a text editor. Find:
```json
"version": "2026.1"
```
Update the year to the current year.

---

## Step 4 — Commit the Changes to GitHub

1. Save both files (`config.js` and `manifest.json`)
2. Commit the changes to GitHub with a message like:
   `Annual update for CONvergence 2026`
3. Do **not** commit `tools/generate-password-hash.html` — it is excluded
   by `.gitignore` for security reasons

---

## Step 5 — Test Before Con

Before the convention weekend:

1. Load the updated extension on a test computer (see `SETUP.md`)
2. Log into Neon and navigate to an attendee on the **training event**
   (event ID 142)
3. The extension should activate (icon turns green or yellow)
4. Click the icon and verify the popup shows the correct attendee info
5. Do NOT complete a check-in on real attendees during testing

If the extension does not activate or shows errors, see `TROUBLESHOOTING.md`
or contact IT.

---

## If Something Looks Wrong After Updating

The most common problems after an annual update:

| Symptom | Likely cause | What to do |
|---|---|---|
| Extension shows "Wrong Year" for all attendees | Event ID not updated or wrong ID entered | Re-check the event ID in Neon |
| Management Override password not accepted | Hash not updated, or wrong password shared | Regenerate hash with correct password |
| Ticket type shows as "Unknown" | Neon renamed a ticket type | Update `nameIncludes` to match new name |
| Fields not writing at check-in | Neon reorganized custom fields | Contact IT — field indexes need updating |

---

## What NOT to Change

Unless IT has specifically told you to:

- Do not change `testEventId` — this is the permanent training event
- Do not change anything in `fieldIndexes` — these are verified field positions
- Do not change `holdMessages` order — it must match the field index order
- Do not change anything in `js/` files — these are the code files

If you are unsure whether something needs changing, ask IT before touching it.