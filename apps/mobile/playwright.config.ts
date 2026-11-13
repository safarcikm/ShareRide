import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Browser tests of the web build against a real API with a test database.
// Playwright builds the web app pointing at the test API (port 3001), serves
// it on port 8082 (scripts/serve-web.ts), and starts the API from
// apps/api/src/e2e-server.ts, which writes text messages to a file instead of
// sending them.
const webPort = 8082;
const apiPort = 3001;
// Expo types process.env loosely; read it as plain strings.
const env = process.env as Readonly<Record<string, string | undefined>>;
export const smsOutbox = join(tmpdir(), "shareride-e2e-sms.jsonl");

export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(env["CI"]),
  retries: 0,
  reporter: env["CI"] ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${String(webPort)}`,
    trace: "off",
    launchOptions: {
      // Lets a machine with a preinstalled Chromium use it; CI installs its own.
      executablePath: env["PLAYWRIGHT_CHROMIUM_PATH"],
    },
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      // Needs TEST_DATABASE_URL (from .env locally); it empties that database.
      command: "pnpm --filter @shareride/api e2e:serve",
      url: `http://localhost:${String(apiPort)}/v1/health`,
      env: {
        PORT: String(apiPort),
        E2E_SMS_OUTBOX: smsOutbox,
        E2E_WEB_ORIGIN: `http://localhost:${String(webPort)}`,
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `expo export --platform web && node scripts/serve-web.ts ${String(webPort)}`,
      url: `http://127.0.0.1:${String(webPort)}`,
      env: { EXPO_PUBLIC_API_URL: `http://localhost:${String(apiPort)}` },
      reuseExistingServer: !env["CI"],
      timeout: 300_000,
    },
  ],
});
