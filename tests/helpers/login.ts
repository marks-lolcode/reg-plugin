import { BrowserContext, Page } from "@playwright/test";
import { saveAuthState } from "./extension";

const LOGIN_PATH_FRAGMENTS = ["/np/admin/login", "/admin/login", "/login.do"];
const MANUAL_LOGIN_TIMEOUT_MS = 120_000;

function isLoginUrl(url: string): boolean {
  return LOGIN_PATH_FRAGMENTS.some((frag) => url.includes(frag));
}

/**
 * Navigates to baseURL and confirms we're logged in. If redirected to login,
 * either fills credentials from env (if both NEON_USERNAME and NEON_PASSWORD
 * are set) or pauses for manual login. On success, persists storageState so
 * subsequent runs skip the login flow.
 */
export async function ensureLoggedIn(context: BrowserContext): Promise<void> {
  const baseURL = process.env.NEON_BASE_URL ?? "https://ce.app.neoncrm.com";
  const probe = await context.newPage();

  try {
    await probe.goto(`${baseURL}/np/admin/`, { waitUntil: "domcontentloaded" });
    await probe.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    if (!isLoginUrl(probe.url())) {
      return;
    }

    const user = process.env.NEON_USERNAME?.trim();
    const pass = process.env.NEON_PASSWORD?.trim();

    if (user && pass) {
      await fillNeonLogin(probe, user, pass);
    } else {
      console.log(
        `\n[login] Manual login required. Log into Neon in the open browser window` +
        ` within ${MANUAL_LOGIN_TIMEOUT_MS / 1000}s. Session will be saved for reuse.\n`,
      );
      await probe.waitForURL((url) => !isLoginUrl(url.toString()), {
        timeout: MANUAL_LOGIN_TIMEOUT_MS,
      });
    }

    await saveAuthState(context);
  } finally {
    await probe.close();
  }
}

async function fillNeonLogin(page: Page, user: string, pass: string): Promise<void> {
  const userInput = page.locator('input[name="username"], input[name="userId"], input[type="text"]').first();
  const passInput = page.locator('input[name="password"], input[type="password"]').first();
  const submit = page.locator('button[type="submit"], input[type="submit"]').first();

  await userInput.fill(user);
  await passInput.fill(pass);
  await Promise.all([
    page.waitForURL((url) => !isLoginUrl(url.toString()), { timeout: 30_000 }),
    submit.click(),
  ]);
}
