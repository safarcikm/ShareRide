import { defineConfig } from "@playwright/test";

// For the pictures of the looks only (README.md): the web builds are served
// by serve-looks.cjs and the test API runs by itself, both on the usual ports.
const env = process.env as Readonly<Record<string, string | undefined>>;

export default defineConfig({
  testDir: "e2e",
  testMatch: "zz-looks.spec.ts",
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 600_000,
  use: {
    baseURL: "http://localhost:8082",
    trace: "off",
    launchOptions: { executablePath: env["PLAYWRIGHT_CHROMIUM_PATH"] },
  },
});
