import { test, expect } from "@playwright/test";
import * as path from "path";
import { launchExtension } from "../helpers/extension";
import { ensureLoggedIn } from "../helpers/login";
import {
  readStorage,
  clearStorage,
  reasonKeys,
  STORAGE_KEY,
  AttendeeState,
} from "../helpers/storage";
import { attendeeFixtures, attendeeEditUrl } from "../helpers/fixtures";

const BASE_URL = process.env.NEON_BASE_URL ?? "https://ce.app.neoncrm.com";
const fixtures = attendeeFixtures().filter((f) => f.accountId !== "SKIP");

test.describe.configure({ mode: "serial" });

if (fixtures.length === 0) {
  test("attendee fixtures present", () => {
    test.skip(
      true,
      "No attendee fixtures filled in. Edit tests/fixtures/attendees.yaml " +
        "and add accountId + attendeeId for each entry, then re-run.",
    );
  });
}

for (const fx of fixtures) {
  test(fx.name, async ({}, testInfo) => {
    const userDataDir = path.join(__dirname, "..", ".userdata", String(testInfo.workerIndex));
    const { context, serviceWorker } = await launchExtension(userDataDir);

    try {
      await ensureLoggedIn(context);
      await clearStorage(serviceWorker, STORAGE_KEY.ATTENDEE);

      const page = await context.newPage();
      await page.goto(attendeeEditUrl(fx, BASE_URL), { waitUntil: "domcontentloaded" });

      // background.js scrapes once content script finishes; poll storage.
      await expect
        .poll(async () => (await readStorage<AttendeeState>(serviceWorker, STORAGE_KEY.ATTENDEE))?.accountId, {
          timeout: 15_000,
          message: "Extension never wrote attendee state for this URL.",
        })
        .toBe(fx.accountId);

      const state = await readStorage<AttendeeState>(serviceWorker, STORAGE_KEY.ATTENDEE);
      expect(state, "attendee state missing in chrome.storage.local").toBeTruthy();

      expect(state!.state, `wrong icon color`).toBe(fx.expect.state);

      if (fx.expect.ticket) {
        expect(state!.ticket ?? "", "wrong ticket label").toContain(fx.expect.ticket);
      }

      expect(reasonKeys(state), "wrong set of conditions").toEqual(
        [...fx.expect.conditions].sort(),
      );
    } finally {
      await context.close();
    }
  });
}
