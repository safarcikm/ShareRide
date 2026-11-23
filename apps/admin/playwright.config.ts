import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// Browser journeys of the console against a real API with a test database.
// Playwright builds the console and starts the API from
// apps/api/src/e2e-server.ts, which serves the build at /admin, binds
// passkeys to this origin and writes a new operator's setup link to a file.
// The browser saves passkeys in a virtual authenticator (e2e/passkeys.ts).
const port = 3002;
export const origin = `http://localhost:${String(port)}`;
const env = process.env;
export const operatorLink = join(tmpdir(), "shareride-e2e-operator-link.txt");
/** The operator's made-up, verified number, for getting back in with a text code (spec 22). */
export const operatorPhone = "+3548999990";
/** The test API writes each text message here, for a journey that signs a person in. */
export const smsOutbox = join(tmpdir(), "shareride-e2e-admin-sms.jsonl");
/** And each email, such as the sign-in code that comes before the text (spec 26). */
export const emailOutbox = join(tmpdir(), "shareride-e2e-admin-email.jsonl");

export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(env["CI"]),
  retries: 0,
  // One operator account: the journeys run in order.
  workers: 1,
  reporter: env["CI"] ? [["github"], ["list"]] : "list",
  use: {
    baseURL: origin,
    trace: "off",
    screenshot: "only-on-failure",
    launchOptions: {
      // Lets a machine with a preinstalled Chromium use it; CI installs its own.
      executablePath: env["PLAYWRIGHT_CHROMIUM_PATH"],
    },
  },
  // Passkeys in a virtual authenticator need Chromium's DevTools protocol.
  // The setup link works once, so one browser; the journey narrows it to a
  // phone's width itself.
  projects: [{ name: "laptop", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Needs TEST_DATABASE_URL (from .env locally); it empties that database.
    command: "vite build && pnpm --filter @shareride/api e2e:serve",
    url: `${origin}/v1/health`,
    env: {
      PORT: String(port),
      E2E_SMS_OUTBOX: smsOutbox,
      E2E_EMAIL_OUTBOX: emailOutbox,
      E2E_WEB_ORIGIN: origin,
      E2E_ADMIN_ORIGIN: origin,
      E2E_ADMIN_APP_DIR: fileURLToPath(new URL("dist", import.meta.url)),
      E2E_OPERATOR_LINK: operatorLink,
      E2E_OPERATOR_PHONE: operatorPhone,
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
