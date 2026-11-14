import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

// The look from spec 15 in a real browser: buttons that fit their label, the
// keyboard focus ring, the moss outline of a field you type in, the loaded
// fonts, and screenshots of the first screens for review (phone and desktop,
// light in English and dark in Icelandic). Screenshots are taken before any
// key is pressed, so they show the screens as a tap or click leaves them.

const schemes = [
  {
    colorScheme: "light",
    locale: "en-GB",
    focus: "rgb(31, 95, 139)",
    primary: "rgb(47, 107, 79)",
    title: "Share the ride across Iceland",
    language: "Change the language to Icelandic",
    continuePhone: "Continue with phone",
    browseTrips: "Browse trips",
    back: "Back",
    phoneField: "Mobile number",
    send: "Send code",
  },
  {
    colorScheme: "dark",
    locale: "is-IS",
    focus: "rgb(143, 203, 230)",
    primary: "rgb(124, 196, 158)",
    title: "Samferða um allt Ísland",
    language: "Skipta yfir í ensku",
    continuePhone: "Halda áfram með síma",
    browseTrips: "Skoða ferðir",
    back: "Til baka",
    phoneField: "Farsímanúmer",
    send: "Senda kóða",
  },
] as const;

/** Presses Tab until `target` has keyboard focus. */
async function tabTo(page: Page, target: Locator) {
  for (let presses = 0; presses < 20; presses += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Tab never reached ${target.toString()}`);
}

/** The focus ring as the browser draws it. */
function outlineOf(target: Locator) {
  return target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      style: style.outlineStyle,
      width: style.outlineWidth,
      color: style.outlineColor,
      offset: style.outlineOffset,
    };
  });
}

/** Where a part sits on the page; it must be visible. */
async function box(target: Locator) {
  const found = await target.boundingBox();
  if (found === null) throw new Error(`${target.toString()} is not visible`);
  return found;
}

/** True when the face is in the page's font list and has finished loading. */
async function fontLoaded(page: Page, family: string) {
  return page.evaluate(async (wanted) => {
    await document.fonts.ready;
    return [...document.fonts].some(
      (face) => face.family.replaceAll('"', "") === wanted && face.status === "loaded",
    );
  }, family);
}

/** Both fonts loaded, with a system font behind them on the web. */
async function expectFonts(page: Page) {
  expect(await fontLoaded(page, "Fredoka_600SemiBold")).toBe(true);
  expect(await fontLoaded(page, "Nunito_400Regular")).toBe(true);
  await expect(page.getByRole("heading").first()).toHaveCSS(
    "font-family",
    "Fredoka_600SemiBold, system-ui, sans-serif",
  );
}

for (const scheme of schemes) {
  test.describe(`the look, ${scheme.colorScheme}`, () => {
    test.use({ colorScheme: scheme.colorScheme, locale: scheme.locale });

    const ring = { style: "solid", width: "3px", color: scheme.focus, offset: "2px" };
    const screenshot = (page: Page, project: { outputDir: string; name: string }, name: string) =>
      page.screenshot({
        path: join(project.outputDir, "look", `${name}-${project.name}-${scheme.colorScheme}.png`),
        fullPage: true,
      });

    test("welcome: fitted buttons, focus ring and fonts", async ({ page }, testInfo) => {
      await page.goto("/");
      const title = page.getByRole("heading", { name: scheme.title });
      const language = page.getByRole("button", { name: scheme.language });
      const continuePhone = page.getByRole("button", { name: scheme.continuePhone });
      const browseTrips = page.getByRole("button", { name: scheme.browseTrips, exact: true });
      await expect(title).toBeVisible();
      await expectFonts(page);
      await screenshot(page, testInfo.project, "welcome");

      // The language switch sits at the right; the buttons fit their labels.
      const column = await box(title);
      const languageBox = await box(language);
      expect(languageBox.x + languageBox.width).toBeCloseTo(column.x + column.width, 0);
      expect((await box(continuePhone)).width).toBeLessThan(column.width);
      expect((await box(browseTrips)).width).toBeLessThan(column.width);

      await tabTo(page, browseTrips);
      expect(await outlineOf(browseTrips)).toEqual(ring);
    });

    test("sign-in: fitted button, focus ring, field outline and fonts", async ({
      page,
    }, testInfo) => {
      await page.goto("/sign-in");
      const back = page.getByRole("button", { name: scheme.back, exact: true });
      const field = page.getByRole("textbox", { name: scheme.phoneField });
      const send = page.getByRole("button", { name: scheme.send });
      await expect(field).toBeVisible();
      await expectFonts(page);
      await screenshot(page, testInfo.project, "sign-in");

      expect((await box(send)).width).toBeLessThan((await box(field)).width);

      await tabTo(page, back);
      expect(await outlineOf(back)).toEqual(ring);
      // A field shows focus with its own outline turning moss, not the ring.
      await tabTo(page, field);
      expect((await outlineOf(field)).style).toBe("none");
      await expect(field).toHaveCSS("border-top-color", scheme.primary);
    });
  });
}
