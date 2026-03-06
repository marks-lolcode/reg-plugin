# CONvergence Check-In Extension — Setup Guide

Follow these steps to install and configure the extension on a new workstation.
You do not need any coding experience to do this.

---

## What You Need

- A laptop or desktop running **Google Chrome**
- Access to the **CONvergence GitHub repository** where this extension lives
- The **Workstation ID** for this computer (ask your Registration Head)
- The **Management Override password** if this is a Help Desk workstation
  (ask your Registration Head — do not look for it in the code)

---

## Step 1 — Download the Extension Files

1. Go to the CONvergence GitHub repository in your browser
2. Click the green **Code** button
3. Click **Download ZIP**
4. Find the downloaded ZIP file (usually in your Downloads folder)
5. Right-click it and choose **Extract All** (Windows) or double-click (Mac)
6. Note where the extracted folder is — you will need it in Step 2

---

## Step 2 — Load the Extension into Chrome

1. Open **Google Chrome**
2. In the address bar, type `chrome://extensions` and press Enter
3. In the top-right corner of that page, turn on **Developer mode**
   (there is a toggle switch)
4. Click the **Load unpacked** button that appears
5. Navigate to the folder you extracted in Step 1 and select it
6. The **CONvergence Check-In** extension should now appear in the list
7. Make sure its toggle is turned **on** (blue)

If you see any errors in red on the extensions page, stop and contact IT.

---

## Step 3 — Pin the Extension Icon

1. Click the **puzzle piece icon** (🧩) in the top-right corner of Chrome
2. Find **CONvergence Check-In** in the list
3. Click the **pin icon** next to it
4. The Connie wink icon will now appear in your Chrome toolbar

---

## Step 4 — Set Your Workstation ID

Every computer at Registration needs a unique Workstation ID so that badge
CSV files can be traced back to the correct station.

1. Click the **Connie wink icon** in the Chrome toolbar
2. Right-click the icon and choose **Options**
   (or go to `chrome://extensions`, find the extension, and click **Details → Extension options**)
3. Type your **Workstation ID** in the box (e.g. `REG-01`, `REG-02`, `HELPDESK`)
   — ask your Registration Head if you are unsure what to use
4. Click **Save Options**
5. You should see "Options saved." confirm the save worked

---

## Step 5 — Enable Management Override (Help Desk Only)

Help Desk workstations need the Management Override enabled so staff can
process badges that would otherwise be blocked (e.g. reissues).

1. Open the Options page (see Step 4)
2. Check the box labelled **Enable Management Override**
3. A password field will appear — enter the Management Override password
   (get this from your Registration Head — it is not written down anywhere
   accessible to volunteers)
4. Click **Save Options**
5. You should see "Options saved." — if you see "Incorrect password" the
   password was wrong; try again or contact your Registration Head

---

## Step 6 — Verify the Extension Is Working

1. Log into Neon CRM in Chrome
2. Navigate to any attendee's Event Registration page
3. Click the dollar amount to open the registration details
4. The Connie wink icon in the toolbar should turn **green**
5. Click the icon — you should see a popup with attendee names listed

If the icon does not change or the popup is empty, see `TROUBLESHOOTING.md`.

---

## Updating the Extension

When a new version is released (typically once a year before con):

1. Download the new ZIP from GitHub (Step 1 above)
2. Extract it, replacing the old folder
3. Go to `chrome://extensions`
4. Find CONvergence Check-In and click the **refresh icon** (circular arrow)
5. The extension will reload with the new version

You do not need to re-enter your Workstation ID after an update — it is saved
separately in Chrome's storage and will still be there.S