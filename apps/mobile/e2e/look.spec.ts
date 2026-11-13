import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

// The look from spec 15 in a real browser: the keyboard focus ring, the
// loaded fonts, and screenshots of the first screens for review (phone and
// desktop, light in English and dark in Icelandic).

const schemes = [
  {
    colorScheme: "light",
    locale: "en-GB",
    focus: "rgb(31, 95, 139)",
    welcome: { title: "Share the ride across Iceland", focusTarget: "Browse trips" },
    back: "Back",
    phoneField: "Mobile number",
  },
  {
    colorScheme: "dark",
    locale: "is-IS",
    focus: "rgb(143, 203, 230)",
    welcome: { title: "Samferða um allt Ísland", focusTarget: "Skoða ferðir" },
    back: "Til baka",
    phoneField: "Farsímanúmer",
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

/** True when the face is in the page's font list and has finished loading. */
async function fontLoaded(page: Page, family: string) {
  return page.evaluate(async (wanted) => {
    await document.fonts.ready;
    return [...document.fonts].some(
      (face) => face.family.replaceAll('"', "") === wanted && face.status === "loaded",
    );
  }, family);
}

for (const scheme of schemes) {
  test.describe(`the look, ${scheme.colorScheme}`, () => {
    test.use({ colorScheme: scheme.colorScheme, locale: scheme.locale });

    // The parts to reach with Tab, in page order: a button on each screen,
    // and the phone number field on sign-in.
    const screens = [
      {
        name: "welcome",
        path: "/",
        targets: (page: Page) => [
          page.getByRole("button", { name: scheme.welcome.focusTarget, exact: true }),
        ],
      },
      {
        name: "sign-in",
        path: "/sign-in",
        targets: (page: Page) => [
          page.getByRole("button", { name: scheme.back, exact: true }),
          page.getByRole("textbox", { name: scheme.phoneField }),
        ],
      },
    ] as const;

    for (const shown of screens) {
      test(`${shown.name}: focus ring, fonts and a screenshot`, async ({ page }, testInfo) => {
        await page.goto(shown.path);
        const targets = shown.targets(page);
        for (const target of targets) await expect(target).toBeVisible();

        expect(await fontLoaded(page, "Fredoka_600SemiBold")).toBe(true);
        expect(await fontLoaded(page, "Nunito_400Regular")).toBe(true);
        // If a face fails to load, the browser falls back to a system font.
        await expect(page.getByRole("heading").first()).toHaveCSS(
          "font-family",
          "Fredoka_600SemiBold, system-ui, sans-serif",
        );

        for (const target of targets) {
          await tabTo(page, target);
          expect(await outlineOf(target)).toEqual({
            style: "solid",
            width: "3px",
            color: scheme.focus,
            offset: "2px",
          });
        }

        await page.screenshot({
          path: join(
            testInfo.project.outputDir,
            "look",
            `${shown.name}-${testInfo.project.name}-${scheme.colorScheme}.png`,
          ),
          fullPage: true,
        });
      });
    }
  });
}
