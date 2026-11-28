import { mkdirSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { english, signUp } from "./support/account";
import { askForSeat } from "./support/cancelling";
import { postTripToSelfoss } from "./support/trips";

// Pictures of the same screens in each look (README.md): the builds lie in
// LOOKS_HOME as web-<look>, and `current` links the one being served.
const env = process.env as Readonly<Record<string, string | undefined>>;
const home = env["LOOKS_HOME"] ?? "/tmp/looks";
const out = env["LOOKS_OUT"] ?? join(home, "pictures");
const looks = (env["LOOKS"] ?? "before,mix,soft,slab").split(",");

function serve(look: string) {
  const link = join(home, "current");
  try {
    unlinkSync(link);
  } catch {
    // Not there yet.
  }
  symlinkSync(join(home, `web-${look}`), link);
}

// An iPhone 15's screen, and a laptop's.
const phone = { width: 393, height: 852 };
const laptop = { width: 1280, height: 800 };

async function person(browser: Browser, wide: boolean): Promise<[BrowserContext, Page]> {
  const context = await browser.newContext({
    viewport: wide ? laptop : phone,
    deviceScaleFactor: wide ? 2 : 3,
    isMobile: !wide,
    hasTouch: !wide,
    locale: "en-GB",
  });
  return [context, await context.newPage()];
}

/** Makes the window as tall as the open screen, to draw all of it. */
async function whole(page: Page, width: number) {
  const scroll = page.getByTestId("screen-scroll").filter({ visible: true });
  const height = await scroll.evaluate((element) => {
    const { top, bottom } = element.getBoundingClientRect();
    return top + element.scrollHeight + (window.innerHeight - bottom);
  });
  await page.setViewportSize({ width, height: Math.max(Math.ceil(height), 720) });
}

/**
 * Takes `name` in every look: the first screen, and on a phone the whole of
 * it too. `ready` waits for the screen after each reload.
 */
async function shoot(page: Page, name: string, ready: () => Promise<void>) {
  const size = page.viewportSize() ?? phone;
  for (const look of looks) {
    serve(look);
    await page.reload();
    await ready();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(700);
    const folder = join(out, look);
    mkdirSync(folder, { recursive: true });
    await page.screenshot({ path: join(folder, `${name}.png`) });
    if (size.width < 900) {
      await whole(page, size.width);
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(folder, `${name}-whole.png`) });
      await page.setViewportSize(size);
    }
  }
  serve(looks[0] ?? "before");
}

test("the looks", async ({ browser }) => {
  serve(looks[0] ?? "before");
  const visible = { visible: true };
  // Bára offers a ride; Dóra signs up and looks at a part of it.
  const [baraContext, bara] = await person(browser, false);
  await signUp(bara, english, "Bára");
  const tripId = await postTripToSelfoss(bara, "09:00");
  const [doraContext, dora] = await person(browser, false);
  await signUp(dora, english, "Dóra");

  const ride = async () => {
    await expect(
      dora.getByRole("heading", { name: "Your part of the ride" }).filter(visible),
    ).toBeVisible();
  };
  await dora.goto(`/trips/${tripId}?from=1&to=3`);
  await ride();
  await shoot(dora, "ride-phone-light", ride);
  const find = (who: Page, name: string, also: string) => async () => {
    await expect(who.getByRole("heading", { name: `Hi ${name}` })).toBeVisible();
    await expect(who.getByText(also, { exact: true }).filter(visible).first()).toBeVisible();
  };
  // Dóra asks for a seat: Bára's Find has something that needs her.
  await askForSeat(dora, tripId);
  await dora.goto("/");
  await shoot(dora, "find-phone-light", find(dora, "Dóra", "Leaving soon"));
  await bara.goto("/");
  await shoot(bara, "find-driver-phone-light", find(bara, "Bára", "Dóra asks for 1 seat"));
  const profile = async () => {
    await expect(dora.getByRole("heading", { name: "My profile" })).toBeVisible();
  };
  await dora.goto("/profile");
  await profile();
  await shoot(dora, "profile-phone-light", profile);
  const myRides = async () => {
    await expect(bara.getByRole("heading", { name: "My rides" }).filter(visible)).toBeVisible();
    await expect(bara.getByTestId("card").filter(visible).first()).toBeVisible();
  };
  await bara.goto("/my-rides");
  await myRides();
  await shoot(bara, "my-rides-phone-light", myRides);

  // At night.
  await dora.emulateMedia({ colorScheme: "dark" });
  await bara.emulateMedia({ colorScheme: "dark" });
  await dora.goto(`/trips/${tripId}?from=1&to=3`);
  await ride();
  await shoot(dora, "ride-phone-dark", ride);
  await dora.goto("/");
  await shoot(dora, "find-phone-dark", find(dora, "Dóra", "Leaving soon"));
  await bara.goto("/");
  await shoot(bara, "find-driver-phone-dark", find(bara, "Bára", "Dóra asks for 1 seat"));

  // On a laptop, Dóra signed in again.
  const [wideContext, wide] = await person(browser, true);
  await signUp(wide, english, "Edda");
  await wide.goto("/");
  await shoot(wide, "find-laptop-light", find(wide, "Edda", "Leaving soon"));
  await wide.goto(`/trips/${tripId}?from=1&to=3`);
  const wideRide = async () => {
    await expect(
      wide.getByRole("heading", { name: "Your part of the ride" }).filter(visible),
    ).toBeVisible();
  };
  await wideRide();
  await shoot(wide, "ride-laptop-light", wideRide);
  await wide.emulateMedia({ colorScheme: "dark" });
  await wide.goto("/");
  await shoot(wide, "find-laptop-dark", find(wide, "Edda", "Leaving soon"));
  await Promise.all([baraContext.close(), doraContext.close(), wideContext.close()]);
});
