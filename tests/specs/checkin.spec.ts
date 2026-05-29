import { test, expect } from "@playwright/test";
import * as path from "path";
import { launchExtension } from "../helpers/extension";
import { ensureLoggedIn } from "../helpers/login";
import {
  readStorage,
  clearStorage,
  ACTION,
  STORAGE_KEY,
  AttendeeState,
} from "../helpers/storage";
import { attendeeFixtures, attendeeEditUrl } from "../helpers/fixtures";

const BASE_URL = process.env.NEON_BASE_URL ?? "https://ce.app.neoncrm.com";
const green = attendeeFixtures().find((f) => f.name === "green-adult-clean");

test.describe("check-in submit (mutates training event)", () => {
  test.describe.configure({ mode: "serial" });

  test("increments active badge count for green-adult-clean", async ({}, testInfo) => {
    test.skip(
      !green,
      "green-adult-clean fixture not filled in; cannot exercise check-in submit.",
    );

    const userDataDir = path.join(__dirname, "..", ".userdata", String(testInfo.workerIndex));
    const { context, serviceWorker } = await launchExtension(userDataDir);

    try {
      await ensureLoggedIn(context);
      await clearStorage(serviceWorker, STORAGE_KEY.ATTENDEE);

      const page = await context.newPage();
      await page.goto(attendeeEditUrl(green!, BASE_URL), { waitUntil: "domcontentloaded" });

      await expect
        .poll(
          async () =>
            (await readStorage<AttendeeState>(serviceWorker, STORAGE_KEY.ATTENDEE))?.state,
          { timeout: 15_000 },
        )
        .toBe("green");

      const before = await readStorage<AttendeeState>(serviceWorker, STORAGE_KEY.ATTENDEE);
      const beforeCount = before?.activeBadges ?? 0;

      // Send the same message popup.js sends when staff clicks "Complete Check-In".
      // attendeeContact.js arms the post-check-in redirect, writes form fields,
      // and clicks the save button. Neon's form POST navigates to eventRegDetails,
      // which background.js then bounces to /np/admin/content/contentList.do.
      await serviceWorker.evaluate(async (action) => {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id;
        if (tabId === undefined) throw new Error("no active tab");
        await chrome.tabs.sendMessage(tabId, { action });
      }, ACTION.INCREMENT_BADGE_COUNT);

      // First sign the check-in actually went through: the tab should land on
      // the account-search page after the post-check-in redirect.
      await page.waitForURL(
        (url) => url.toString().includes("/np/admin/content/contentList.do"),
        { timeout: 30_000 },
      );

      // Now re-visit the attendee so the content script re-scrapes the saved
      // state. The check-in should have incremented the badge count and
      // flipped the attendee to red/alreadyIssued.
      await clearStorage(serviceWorker, STORAGE_KEY.ATTENDEE);
      await page.goto(attendeeEditUrl(green!, BASE_URL), { waitUntil: "domcontentloaded" });

      await expect
        .poll(
          async () =>
            (await readStorage<AttendeeState>(serviceWorker, STORAGE_KEY.ATTENDEE))?.activeBadges,
          { timeout: 15_000, message: "active badge count never updated after check-in" },
        )
        .toBeGreaterThan(beforeCount);

      const after = await readStorage<AttendeeState>(serviceWorker, STORAGE_KEY.ATTENDEE);
      expect(after!.state, "after check-in, state should now block re-issue").toBe("red");
      expect(after!.reasons?.map((r) => r.key)).toContain("alreadyIssued");
    } finally {
      await context.close();
    }
  });
});
