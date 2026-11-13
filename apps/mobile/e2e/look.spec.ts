import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

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
  },
  {
    colorScheme: "dark",
    locale: "is-IS",
    focus: "rgb(143, 203, 230)",
    welcome: { title: "Samferða um allt Ísland", focusTarget: "Skoða ferðir" },
    back: "Til baka",
  },
] as const;

/** Presses Tab until the button called `name` has keyboard focus. */
async function tabTo(page: Page, name: string) {
  const target = page.getByRole("button", { name, exact: true });
  for (let presses = 0; presses < 20; presses += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return target;
  }
  throw new Error(`Tab never reached the button "${name}"`);
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

    const screens = [
      {
        name: "welcome",
        path: "/",
        heading: scheme.welcome.title,
        focusTarget: scheme.welcome.focusTarget,
      },
      { name: "sign-in", path: "/sign-in", heading: null, focusTarget: scheme.back },
    ] as const;

    for (const shown of screens) {
      test(`${shown.name}: focus ring, fonts and a screenshot`, async ({ page }, testInfo) => {
        await page.goto(shown.path);
        if (shown.heading !== null) {
          await expect(page.getByRole("heading", { name: shown.heading })).toBeVisible();
        }
        await expect(
          page.getByRole("button", { name: shown.focusTarget, exact: true }),
        ).toBeVisible();

        expect(await fontLoaded(page, "Fredoka_600SemiBold")).toBe(true);
        expect(await fontLoaded(page, "Nunito_400Regular")).toBe(true);

        const focused = await tabTo(page, shown.focusTarget);
        const outline = await focused.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            style: style.outlineStyle,
            width: style.outlineWidth,
            color: style.outlineColor,
            offset: style.outlineOffset,
          };
        });
        expect(outline).toEqual({
          style: "solid",
          width: "3px",
          color: scheme.focus,
          offset: "2px",
        });

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
