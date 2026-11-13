import { defineConfig, devices } from "@playwright/test";

// Browser tests of the web build. Build first with `pnpm export:web`; the
// server below serves the dist folder.
const port = 8082;
// Expo types process.env loosely; read it as plain strings.
const env = process.env as Readonly<Record<string, string | undefined>>;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(env["CI"]),
  retries: 0,
  reporter: env["CI"] ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${String(port)}`,
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
  webServer: {
    command: `expo serve --port ${String(port)}`,
    url: `http://localhost:${String(port)}`,
    reuseExistingServer: !env["CI"],
    timeout: 60_000,
  },
});
