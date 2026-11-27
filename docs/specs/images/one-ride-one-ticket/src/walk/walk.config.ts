import { defineConfig } from "@playwright/test";

// The review walk of 2026-11-26 (spec 31): it uses the web app as a member
// does and takes a picture of every screen. Not a test, and not part of CI:
// see ../README.md for how to run it. The API and the web build are started
// by hand, as for the web journeys.
const scale = Number(process.env.WALK_SCALE ?? 2);

export default defineConfig({
  testDir: "e2e",
  testMatch: /walk-.*\.spec\.ts/,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 240_000,
  use: {
    baseURL: "http://localhost:8082",
    trace: "off",
    launchOptions:
      process.env.CHROMIUM === undefined ? {} : { executablePath: process.env.CHROMIUM },
  },
  projects: [
    {
      name: "phone",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: scale,
      },
    },
    { name: "laptop", use: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: scale } },
  ],
});
