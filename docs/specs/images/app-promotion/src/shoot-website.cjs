// Takes pictures 1 to 6 of spec 35, section 5, into the folder above:
// node shoot-website.cjs [address of the API, default http://localhost:3000]
//
// Needs the API serving the website's build with both switches on:
//   1. From apps/mobile: npx expo export --platform web
//   2. Turn both switches on in the local database (the console's Settings >
//      Phone apps, or SQL into setting_changes), then from the repository:
//      WEB_APP_DIR=apps/mobile/dist pnpm --filter @shareride/api dev
//   3. node docs/specs/images/app-promotion/src/shoot-website.cjs
// The settings are cached for a few seconds, so wait a little after step 2.
const path = require("node:path");
const { chromium } = require("playwright");

const api = process.argv[2] ?? "http://localhost:3000";
const out = path.join(__dirname, "..");
const android =
  "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";

async function shot(
  browser,
  name,
  { path: address, phone = true, dark = false, ua, toEnd = false, scrollTo },
) {
  const context = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: dark ? "dark" : "light",
    reducedMotion: "reduce",
    ...(ua ? { userAgent: ua } : {}),
    isMobile: phone,
    hasTouch: phone,
  });
  const page = await context.newPage();
  await page.goto(`${api}${address}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  if (toEnd || scrollTo) {
    // The visible screen's own scroller: to the end, or to a heading.
    await page.evaluate((text) => {
      const scrollers = [...document.querySelectorAll('[data-testid="screen-scroll"]')].filter(
        (element) => element.offsetParent !== null,
      );
      const scroller = scrollers.at(-1);
      if (!scroller) return;
      if (text) {
        const heading = [...scroller.querySelectorAll("*")].find(
          (element) => element.textContent?.trim() === text,
        );
        if (heading) {
          scroller.scrollTop +=
            heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24;
          return;
        }
      }
      scroller.scrollTop = scroller.scrollHeight;
    }, scrollTo ?? null);
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: `${out}/${name}.png` });
  await context.close();
}

async function main() {
  const browser = await chromium.launch();
  await shot(browser, "1-android-strip-phone-en", { path: "/", ua: android });
  await shot(browser, "2-android-strip-phone-is-dark", {
    path: "/?lang=is",
    ua: android,
    dark: true,
  });
  await shot(browser, "3-footer-phone-en", { path: "/about", toEnd: true });
  await shot(browser, "4-footer-laptop-en", { path: "/", phone: false, toEnd: true });
  await shot(browser, "5-about-laptop-en", {
    path: "/about",
    phone: false,
    scrollTo: "The PuffinRide app",
  });
  await shot(browser, "6-about-phone-is-dark", {
    path: "/about?lang=is",
    dark: true,
    scrollTo: "PuffinRide-appið",
  });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
