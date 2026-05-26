import { chromium, BrowserContext, Worker } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const EXT_PATH = path.resolve(__dirname, "..", "..");
const AUTH_PATH = path.resolve(__dirname, "..", ".auth", "state.json");

export interface LaunchedExtension {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
}

export async function launchExtension(userDataDir: string): Promise<LaunchedExtension> {
  fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: "chromium",
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  if (fs.existsSync(AUTH_PATH)) {
    try {
      const state = JSON.parse(fs.readFileSync(AUTH_PATH, "utf8"));
      if (Array.isArray(state.cookies) && state.cookies.length > 0) {
        await context.addCookies(state.cookies);
      }
    } catch {
      // Corrupt state file — login helper will re-prompt and overwrite it.
    }
  }

  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 15_000 });
  }
  const extensionId = serviceWorker.url().split("/")[2];

  return { context, extensionId, serviceWorker };
}

export async function saveAuthState(context: BrowserContext): Promise<void> {
  fs.mkdirSync(path.dirname(AUTH_PATH), { recursive: true });
  await context.storageState({ path: AUTH_PATH });
}

export function authStatePath(): string {
  return AUTH_PATH;
}
