import { expect, test, type Page } from "@playwright/test";

// The front page's car arrives on the website (spec 33, 3.2; ADR 0052):
// the first time Find shows, it drives in from the left and stops, its
// body bobbing on the road and dipping its nose as it brakes, and then
// the passenger hops, then the driver. Then it stands still. Every other
// journey runs with reduce motion on (playwright.config.ts), so their car
// stands still; these turn it off.

const visible = { visible: true } as const;
const car = '[data-testid="puffins-in-car"]';
const arriving = '[data-motion="arrive"]';
const moment = '[data-motion="moment"]';

/**
 * The arriving car's drive: the names of its animations, and where the
 * drawing's left edge is at the drive's start and at its end (on a phone
 * the car's box is as wide as the screen, the drawing in its middle). Its
 * animations stop where they are asked to, and go on to their end after.
 */
function drive(page: Page) {
  return page.locator(arriving).evaluate((element) => {
    const own = element.getAnimations();
    const parts = (part: string) =>
      [...element.querySelectorAll(`[data-motion="${part}"]`)].map(
        (marked) => getComputedStyle(marked).animationName,
      );
    const drawing = element.querySelector("svg") ?? element;
    for (const animation of own) animation.pause();
    const leftAt = (time: number) => {
      for (const animation of own) animation.currentTime = time;
      return drawing.getBoundingClientRect().left;
    };
    const start = leftAt(0);
    const end = leftAt(10_000);
    for (const animation of own) animation.finish();
    return {
      names: own.map((animation) => ("animationName" in animation ? animation.animationName : "")),
      start,
      end,
      width: drawing.getBoundingClientRect().width,
      body: parts("car-body"),
      you: parts("puffin-you"),
      driver: parts("puffin-driver"),
    };
  });
}

/** How many animations the car and its parts still have. */
function stillMoving(page: Page) {
  return page.locator(car).evaluate((element) => element.getAnimations({ subtree: true }).length);
}

test.describe("the car arrives on the front page (spec 33, 3.2)", () => {
  test.use({ locale: "en-GB", reducedMotion: "no-preference" });

  test("drives in from the left, bobs, the puffins hop, then all stands still", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await expect(page.locator(arriving)).toHaveCount(1);
    const seen = await drive(page);
    // Its body bobs and dips, and each puffin hops.
    expect(seen.body).toEqual(["pr-settle"]);
    expect(seen.you).toEqual(["pr-hop"]);
    expect(seen.driver).toEqual(["pr-hop"]);
    if (testInfo.project.name === "phone") {
      // From beyond the screen's left edge, to its place.
      expect(seen.names).toEqual(["pr-arrive"]);
      expect(seen.start + seen.width).toBeLessThanOrEqual(0);
    } else {
      // On a laptop, out of its own room beside the title, fading in: it
      // rolls in over the car's own length and a little more.
      expect(seen.names).toEqual(["pr-arrive-fade"]);
      expect(seen.end - seen.start).toBeCloseTo(170 + 24, 0);
    }

    // Then nothing of it moves, and it stays where the drive ended.
    await expect(page.locator(arriving)).toHaveCount(0, { timeout: 5000 });
    expect(await stillMoving(page)).toBe(0);
    const still = await page.locator(`${car} svg`).first().boundingBox();
    expect(still?.x).toBeCloseTo(seen.end, 0);
  });

  test("never passes under the title's words on a laptop", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "phone", "the laptop's layout");
    await page.goto("/");
    await expect(page.locator(arriving)).toHaveCount(1);
    const room = await page.getByTestId("car-room").boundingBox();
    const words = await page.getByRole("heading", { name: "Share your ride" }).boundingBox();
    const what = await page.getByText(/^Carpool across Iceland: /).boundingBox();
    if (room === null || words === null || what === null) throw new Error("not on the page");
    expect(room.x + 0.5).toBeGreaterThanOrEqual(words.x + words.width);
    expect(room.x + 0.5).toBeGreaterThanOrEqual(what.x + what.width);
    // What of the car is still outside its room is hidden, its edge soft.
    await expect(page.getByTestId("car-room")).toHaveCSS("overflow", "hidden");
    await expect(page.getByTestId("car-room")).toHaveCSS("mask-image", /linear-gradient/);
    // Once it is there, the room hides nothing.
    await expect(page.locator(arriving)).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByTestId("car-room")).toHaveCSS("overflow", "visible");
  });

  test("leaves the search to be used while it drives", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(arriving)).toHaveCount(1);
    await page.getByRole("button", { name: /^From: / }).click();
    await expect(page.getByLabel("From", { exact: true })).toBeFocused();
  });

  test("waits for the page to show the arrival, however late it starts", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(arriving)).toHaveCount(1);
    // As in a tab behind another, or after a slow first frame: nothing has
    // moved yet, and the arrival is not over however long that takes.
    await page.locator(car).evaluate((element) => {
      for (const animation of element.getAnimations({ subtree: true })) animation.pause();
    });
    await page.waitForTimeout(2500);
    await expect(page.locator(arriving)).toHaveCount(1);
    await page.locator(car).evaluate((element) => {
      for (const animation of element.getAnimations({ subtree: true })) animation.play();
    });
    await expect(page.locator(arriving)).toHaveCount(0, { timeout: 5000 });
    expect(await stillMoving(page)).toBe(0);
  });

  test("arrives once a visit: not again back on Find, nor from the logo", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Share your ride" })).toBeVisible();
    await expect(page.locator(arriving)).toHaveCount(1);

    // Leaving Find while the car still drives.
    await page.getByRole("link", { name: "Profile" }).filter(visible).click();
    await expect(page).toHaveURL(/\/profile$/);
    if (testInfo.project.name === "phone") {
      await page
        .getByRole("navigation", { name: "Main menu" })
        .getByRole("link", { name: "Find", exact: true })
        .click();
    } else {
      await page.getByRole("link", { name: "PuffinRide, to the front page" }).click();
    }
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(car).filter(visible)).toBeVisible();
    await expect(page.locator(arriving)).toHaveCount(0, { timeout: 5000 });
    expect(await stillMoving(page)).toBe(0);
    // Nor does the day's or season's moment play again (spec 36, 3.6).
    await expect(page.locator(moment)).toHaveCount(0);
    if (testInfo.project.name === "phone") {
      // The phone's logo loads Find again, and the car stays still.
      await page.getByRole("button", { name: "PuffinRide, update the front page" }).click();
      await expect(page.getByText("Updated", { exact: true })).toBeVisible();
      await expect(page.locator(arriving)).toHaveCount(0);
      expect(await stillMoving(page)).toBe(0);
    }
  });
});

/**
 * What moves with the arriving car and in the scene's moment: the names of
 * their animations, and when the last of them ends, in milliseconds from
 * the start.
 */
function playing(page: Page) {
  return page.evaluate(
    ([carPart, scenePart]) => {
      const parts = document.getAnimations().filter((animation) => {
        const target =
          animation.effect !== null && "target" in animation.effect
            ? (animation.effect as KeyframeEffect).target
            : null;
        return target instanceof Element && target.closest(`${carPart},${scenePart}`) !== null;
      });
      return {
        names: [
          ...new Set(
            parts.map((animation) =>
              "animationName" in animation ? String(animation.animationName) : "",
            ),
          ),
        ],
        end: Math.max(
          ...parts.map((animation) => Number(animation.effect?.getComputedTiming().endTime ?? 0)),
        ),
      };
    },
    [arriving, moment],
  );
}

test.describe("the day's or season's moment plays with the car (spec 36, 3.6)", () => {
  test.use({ locale: "en-GB", reducedMotion: "no-preference" });

  test("New Year's fireworks go up and burst, all over within 3.5 s, and then stand", async ({
    page,
  }) => {
    await page.goto("/?day=2027-12-31");
    await expect(page.locator(moment)).toHaveCount(1);
    const seen = await playing(page);
    expect(seen.names).toEqual(expect.arrayContaining(["pr-trail", "pr-burst", "pr-hop"]));
    expect(seen.end).toBeLessThanOrEqual(3500);
    // Then nothing of it moves: the trails are gone, the bursts stay.
    await expect(page.locator(moment)).toHaveCount(0, { timeout: 6000 });
    await expect(page.locator(arriving)).toHaveCount(0);
    await expect(page.getByTestId("trail")).toHaveCount(0);
    await expect(page.getByTestId("firework")).toHaveCount(3);
  });

  test("on Christmas Eve Kertasníkir pops up, and the giant cat swishes his tail and blinks, within 3.5 s (3.11)", async ({
    page,
  }) => {
    await page.goto("/?day=2027-12-24");
    await expect(page.locator(moment)).toHaveCount(1);
    await expect(page.getByTestId("lad-item-kertasnikir")).toHaveCount(1);
    await expect(page.getByTestId("yule-cat")).toHaveCount(1);
    const seen = await playing(page);
    expect(seen.names).toEqual(expect.arrayContaining(["pr-lad", "pr-cat-tail", "pr-cat-eyes"]));
    expect(seen.end).toBeLessThanOrEqual(3500);
    await expect(page.locator(moment)).toHaveCount(0, { timeout: 6000 });
    await expect(page.getByTestId("yule-lad")).toHaveCount(1);
  });

  test("snow falls in winter, and is gone once it has fallen", async ({ page }) => {
    await page.goto("/?day=2027-01-15");
    await expect(page.locator(moment)).toHaveCount(1);
    expect(await page.locator('[data-motion="flake"]').count()).toBeGreaterThan(10);
    expect((await playing(page)).names).toContain("pr-flake");
    await expect(page.locator(moment)).toHaveCount(0, { timeout: 6000 });
    await expect(page.locator('[data-motion="flake"]')).toHaveCount(0);
  });
});

test.describe("with reduce motion on (spec 33, 3.9)", () => {
  test.use({ locale: "en-GB", reducedMotion: "reduce" });

  test("the car stands in its place from the start", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page.locator(car).filter(visible)).toBeVisible();
    // Nothing to wait for: the arrival is over at once.
    await expect(page.locator(arriving)).toHaveCount(0);
    expect(await stillMoving(page)).toBe(0);
    if (testInfo.project.name !== "phone") {
      await expect(page.getByTestId("car-room")).toHaveCSS("overflow", "visible");
    }
  });

  test("the day's look stands still from the start: the tree lit, no snow (spec 36, 3.6)", async ({
    page,
  }) => {
    await page.goto("/?day=2027-12-24");
    await expect(page.getByTestId("tree").filter(visible)).toBeVisible();
    const bulbs = page.locator('[data-motion="bulb"]');
    await expect(bulbs).toHaveCount(10);
    for (const bulb of await bulbs.all()) await expect(bulb).toHaveCSS("opacity", "1");
    await expect(page.locator(moment)).toHaveCount(0);
    await expect(page.locator('[data-motion="flake"]')).toHaveCount(0);
    expect(await stillMoving(page)).toBe(0);
  });

  test("after Christmas Eve the cat stands alone over the farmhouse, the Lads gone (3.11)", async ({
    page,
  }) => {
    await page.goto("/?day=2027-12-27");
    await expect(page.getByTestId("yule-cat").filter(visible)).toBeVisible();
    await expect(page.getByTestId("yule-lad")).toHaveCount(0);
    await expect(page.getByTestId("lad-in-town")).toHaveCount(0);
    expect(await stillMoving(page)).toBe(0);
  });
});
