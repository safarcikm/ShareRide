import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

// The look from spec 15 in a real browser: centred buttons that fit their label, the
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
    title: "Share your ride",
    language: "Change the language to Icelandic",
    findRide: "Find a ride",
    offerRide: "Offer a ride",
    back: "Back",
    emailField: "Email",
    send: "Send code",
  },
  {
    colorScheme: "dark",
    locale: "is-IS",
    focus: "rgb(143, 203, 230)",
    primary: "rgb(124, 196, 158)",
    title: "Verum samferða",
    language: "Skipta yfir í ensku",
    findRide: "Finna far",
    offerRide: "Bjóða far",
    back: "Til baka",
    emailField: "Netfang",
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

/** The horizontal middle of a box. */
const middle = (found: { x: number; width: number }) => found.x + found.width / 2;

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

    test("Find: fitted buttons, focus ring and fonts", async ({ page }, testInfo) => {
      await page.goto("/");
      const title = page.getByRole("heading", { name: scheme.title });
      const language = page.getByRole("button", { name: scheme.language });
      const findRide = page.getByRole("button", { name: scheme.findRide, exact: true });
      const offerRide = page.getByRole("button", { name: scheme.offerRide, exact: true });
      await expect(title).toBeVisible();
      await expectFonts(page);
      await screenshot(page, testInfo.project, "welcome");

      // On phones the language switch sits at the right of the column; wide
      // screens have it in the top bar. On phones the buttons sit in the
      // middle, under the centred title: Offer a ride fits its label, and
      // Find a ride is the main button across the search card, inside the
      // column (spec 16, 3.2). A wide page has Find a ride at the end of the
      // search row and Offer a ride as a text button under the rides (spec
      // 18, 3.5).
      const wide = (page.viewportSize()?.width ?? 0) >= 900;
      const column = await box(title);
      const languageBox = await box(language);
      if (wide) {
        await expect(
          page.getByTestId("top-bar").getByRole("button", { name: scheme.language }),
        ).toBeVisible();
      } else {
        expect(languageBox.x + languageBox.width).toBeCloseTo(column.x + column.width, 0);
      }
      for (const button of [findRide, offerRide]) {
        const found = await box(button);
        expect(found.width).toBeLessThan(column.width);
        if (!wide) expect(middle(found)).toBeCloseTo(middle(column), 0);
      }
      if (wide) {
        const row = await box(page.getByTestId("search-row"));
        const found = await box(findRide);
        expect(found.x + found.width).toBeCloseTo(row.x + row.width, 0);
      }
      await expect(title).toHaveCSS("text-align", "center");

      await tabTo(page, offerRide);
      expect(await outlineOf(offerRide)).toEqual(ring);
    });

    test("sign-in: fitted button, focus ring, field outline and fonts", async ({
      page,
    }, testInfo) => {
      await page.goto("/sign-in");
      const back = page.getByRole("button", { name: scheme.back, exact: true });
      const field = page.getByRole("textbox", { name: scheme.emailField, exact: true });
      const send = page.getByRole("button", { name: scheme.send });
      await expect(field).toBeVisible();
      await expectFonts(page);
      await screenshot(page, testInfo.project, "sign-in");

      const sendBox = await box(send);
      const fieldBox = await box(field);
      expect(sendBox.width).toBeLessThan(fieldBox.width);
      expect(middle(sendBox)).toBeCloseTo(middle(fieldBox), 0);

      await tabTo(page, back);
      expect(await outlineOf(back)).toEqual(ring);
      // A field shows focus with its own outline turning moss, not the ring.
      await tabTo(page, field);
      expect((await outlineOf(field)).style).toBe("none");
      await expect(field).toHaveCSS("border-top-color", scheme.primary);
    });
  });
}
