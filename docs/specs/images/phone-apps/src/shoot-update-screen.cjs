// Takes the two pictures of "Update PuffinRide" (spec 32, section 5) in the
// folder above: node shoot-update-screen.cjs <web build dir> <out dir>.
//
// The screen shows only in the phone apps, so the pictures come from a web
// build made for them, never committed: in
// apps/mobile/src/app-version/update-screen.tsx, `useNeedsUpdate` returns
// `isOlderThan("1.0.0", oldestAppVersion)` on the web too, and
// `UpdateScreen` takes Android when the address has `?android`. Then, from
// apps/mobile: EXPO_PUBLIC_API_URL=http://localhost:3999 npx expo export
// --platform web --output-dir <web build dir>, and undo the change. The
// build and the API are answered here (oldest version 9.0.0, signed out),
// so nothing has to run.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const dist = process.argv[2];
const out = process.argv[3];
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

const config = {
  beta: true,
  paused: [],
  maxSeats: 8,
  freeCancellationMinutes: 15,
  maxMoveMinutes: 120,
  reliabilityMonths: 12,
  signInProviders: [],
  emailSignIn: true,
  passkeySignIn: false,
  payInPerson: false,
  analytics: null,
  oldestAppVersion: "9.0.0",
};

async function shoot(browser, name, { locale, colorScheme, query }) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale,
    colorScheme,
  });
  const page = await context.newPage();
  await page.route("http://localhost:3999/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/v1/config") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(config),
      });
    }
    return route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "unauthorized", message: "No." } }),
    });
  });
  await page.route("http://localhost:8099/**", (route) => {
    const url = new URL(route.request().url());
    let file = path.join(dist, decodeURIComponent(url.pathname));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory())
      file = path.join(dist, "index.html");
    return route.fulfill({
      status: 200,
      contentType: types[path.extname(file)] ?? "application/octet-stream",
      body: fs.readFileSync(file),
    });
  });
  await page.goto(`http://localhost:8099/${query}`);
  await page
    .getByText(locale.startsWith("is") ? "Uppfærðu PuffinRide" : "Update PuffinRide")
    .first()
    .waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, name) });
  await context.close();
}

(async () => {
  const browser = await chromium.launch();
  await shoot(browser, "update-puffinride-iphone-en.png", {
    locale: "en-GB",
    colorScheme: "light",
    query: "",
  });
  await shoot(browser, "update-puffinride-android-is-dark.png", {
    locale: "is-IS",
    colorScheme: "dark",
    query: "?android",
  });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
