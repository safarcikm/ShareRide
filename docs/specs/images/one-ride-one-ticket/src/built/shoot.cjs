// Takes pictures of a screen of the web build, on a phone and a laptop, in
// light and dark: node shoot.cjs <path> <name> <out dir>. The web build is
// served on port 8082; the app's start-up calls are answered here, signed
// out, so no API has to run. See ../README.md.
const { chromium } = require("playwright");

const [path, name, out] = process.argv.slice(2);
const web = "http://localhost:8082";
const config = {
  beta: false,
  paused: [],
  maxSeats: 8,
  freeCancellationMinutes: 15,
  maxMoveMinutes: 120,
  reliabilityMonths: 12,
  signInProviders: [],
  emailSignIn: true,
  passkeySignIn: false,
};
const cors = {
  "access-control-allow-origin": web,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
};
const json = (status, body) => ({
  status,
  headers: cors,
  contentType: "application/json",
  body: JSON.stringify(body),
});

(async () => {
  const browser = await chromium.launch();
  for (const [size, width, scale] of [
    ["phone", 390, 2],
    ["laptop", 1280, 1],
  ]) {
    for (const scheme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height: 4000 },
        colorScheme: scheme,
        deviceScaleFactor: scale,
        locale: "en-GB",
      });
      const page = await context.newPage();
      await page.route("http://localhost:3001/**", (route) => {
        const request = route.request();
        if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        if (request.url().endsWith("/v1/config")) return route.fulfill(json(200, config));
        return route.fulfill(json(401, { error: { code: "unauthenticated", message: "" } }));
      });
      await page.goto(web + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      // As tall as what the screen shows, with the page's padding under it:
      // the lowest part that holds no other, as the page itself fills the window.
      const bottom = await page.evaluate(() =>
        Math.max(
          ...[...document.querySelectorAll('[data-testid="screen-scroll"] *')]
            .filter((part) => part.children.length === 0)
            .map((part) => part.getBoundingClientRect().bottom),
        ),
      );
      await page.screenshot({
        path: `${out}/${name}-${size}-${scheme}.png`,
        clip: { x: 0, y: 0, width, height: Math.ceil(bottom) + 32 },
      });
      await context.close();
    }
  }
  await browser.close();
})();
