import { test, expect } from "@playwright/test";
import * as path from "path";
import { launchExtension } from "../helpers/extension";
import { ensureLoggedIn } from "../helpers/login";
import { readStorage, clearStorage, STORAGE_KEY } from "../helpers/storage";
import { registrationsFixtures, eventRegDetailsUrl } from "../helpers/fixtures";

const BASE_URL = process.env.NEON_BASE_URL ?? "https://ce.app.neoncrm.com";
const fixtures = registrationsFixtures();

interface RegistrationRow {
  state: "green" | "yellow" | "red";
  name?: string;
  ticket?: string;
}

test.describe.configure({ mode: "serial" });

if (fixtures.length === 0) {
  test("registrations fixtures present", () => {
    test.skip(
      true,
      "No registrations fixtures filled in. Set registrationId on the " +
        "registrations-multi entry in tests/fixtures/attendees.yaml.",
    );
  });
}

for (const fx of fixtures) {
  test(fx.name, async ({}, testInfo) => {
    const userDataDir = path.join(__dirname, "..", ".userdata", String(testInfo.workerIndex));
    const { context, serviceWorker } = await launchExtension(userDataDir);

    try {
      await ensureLoggedIn(context);
      await clearStorage(serviceWorker, STORAGE_KEY.REGISTRATIONS);

      const page = await context.newPage();
      await page.goto(eventRegDetailsUrl(fx, BASE_URL), { waitUntil: "domcontentloaded" });

      await expect
        .poll(
          async () => {
            const data = await readStorage<RegistrationRow[]>(
              serviceWorker,
              STORAGE_KEY.REGISTRATIONS,
            );
            return Array.isArray(data) ? data.length : 0;
          },
          {
            timeout: 15_000,
            message: "Extension never wrote registrations data for this URL.",
          },
        )
        .toBeGreaterThanOrEqual(fx.expect.rowCount);

      const rows = await readStorage<RegistrationRow[]>(serviceWorker, STORAGE_KEY.REGISTRATIONS);
      expect(rows, "registrations payload missing").toBeTruthy();
      expect(rows!.length, "row count").toBe(fx.expect.rowCount);

      const states = rows!.map((r) => r.state).sort();
      expect(states, "row state mix").toEqual([...fx.expect.states].sort());
    } finally {
      await context.close();
    }
  });
}
