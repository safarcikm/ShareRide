import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { apiUrl } from "../playwright.config";
import { english, signUp } from "./support/account";
import { confirmedBooking, requestSeat, secondPage } from "./support/cancelling";
import { passengerRow } from "./support/driver-ride";
import { twiceAsLarge } from "./support/layout";
import { aPerson, personId, showPerson } from "./support/person";
import { addPhotoBeforePublishing } from "./support/photo";
import { chooseTime, openTrip, postTripToSelfoss, tomorrow } from "./support/trips";

// Pictures of screens for the specs (docs/specs/images), kept in git with
// the script that makes them. Not a check: skipped unless PICTURES_DIR names
// the folder to write to, as in
//   PICTURES_DIR=../../docs/specs/images npx playwright test e2e/pictures.spec.ts

const env = process.env as Readonly<Record<string, string | undefined>>;
const root = env["PICTURES_DIR"];

async function choose(page: Page, end: string, typed: string, name: RegExp) {
  await page.getByRole("button", { name: new RegExp(`^${end}: `) }).click();
  await page.getByLabel(end, { exact: true }).fill(typed);
  await page.getByRole("button", { name }).click();
}

/** Makes the window as tall as the open screen, which scrolls inside the page, to draw all of it. */
async function showWhole(page: Page, width: number) {
  const scroll = page.getByTestId("screen-scroll").filter({ visible: true });
  // The screen's top too: on a laptop the page's header is above it. And
  // what stands under the screen, as a phone's menu does.
  const height = await scroll.evaluate((element) => {
    const { top, bottom } = element.getBoundingClientRect();
    return top + element.scrollHeight + (window.innerHeight - bottom);
  });
  await page.setViewportSize({ width, height: Math.max(Math.ceil(height), 720) });
  await page.waitForTimeout(500);
}

/**
 * Draws the whole of the open screen into `folder`, as
 * `<name>-phone-light.png` on a phone and `<name>-laptop-light.png` on a
 * laptop, and gives the window its size back.
 */
function shooter(
  page: Page,
  folder: string,
  window: { readonly width: number; readonly height: number },
  wide: boolean,
) {
  return async (name: string, scheme: "light" | "dark") => {
    await showWhole(page, window.width);
    // Away from the rows: one under the pointer would show as hovered.
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: join(folder, `${name}-${wide ? "laptop" : "phone"}-${scheme}.png`),
      scale: wide ? "css" : "device",
    });
    await page.setViewportSize(window);
  };
}

/**
 * The top of the driver's ride, down to the foot of its ticket, which has
 * the share icon in its corner (spec 28, 3.1; spec 31, 3.12).
 */
async function shootTopOfRide(page: Page, path: string, width: number) {
  await expect(page.getByRole("button", { name: "Share this ride" })).toBeVisible();
  await page.waitForTimeout(500);
  const ticket = await page
    .getByTestId("card-with-corner")
    .filter({ visible: true })
    .first()
    .boundingBox();
  if (ticket === null) throw new Error("The ride has no ticket");
  await page.screenshot({
    path,
    clip: { x: 0, y: 0, width, height: Math.ceil(ticket.y + ticket.height) + 16 },
  });
}

test.describe("pictures", () => {
  test.skip(root === undefined, "PICTURES_DIR is not set");
  test.use({
    locale: "en-GB",
    permissions: ["clipboard-read", "clipboard-write"],
    deviceScaleFactor: 2,
  });

  test("share a ride (spec 28)", async ({ page }, info) => {
    const folder = join(root ?? "", "share-a-ride");
    mkdirSync(folder, { recursive: true });
    const kind = info.project.name;
    const wide = kind === "desktop";
    if (wide) await page.setViewportSize({ width: 1280, height: 720 });

    // The front page's rides leaving soon, each with the icon in its corner.
    await page.goto("/");
    await page.getByRole("heading", { name: "Leaving soon" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    if (wide) await page.screenshot({ path: join(folder, "front-page-laptop.png") });

    // A search result, then its link copied.
    await page.goto("/search");
    await choose(page, "From", "borgarn", /^N1 Borgarnes,/);
    await choose(page, "To", "blondu", /^Olís Blönduós,/);
    await page.getByRole("button", { name: "Find a ride", exact: true }).click();
    const icon = page.getByRole("button", { name: /^Share the ride / }).first();
    await icon.waitFor();
    await page.waitForTimeout(500);
    const card = page.getByTestId("card-with-corner").filter({ visible: true }).first();
    if (!wide) {
      await card.screenshot({ path: join(folder, "result-card-phone.png") });
    }
    await icon.hover();
    await icon.click();
    await expect(page.getByTestId("share-copied")).toBeVisible();
    if (wide) await page.screenshot({ path: join(folder, "link-copied-laptop.png") });
  });

  test("share this ride (spec 28)", async ({ page }, info) => {
    test.setTimeout(120_000);
    const folder = join(root ?? "", "share-a-ride");
    mkdirSync(folder, { recursive: true });
    const wide = info.project.name === "desktop";
    if (wide) await page.setViewportSize({ width: 1280, height: 720 });
    await signUp(page, english, "Bára");
    const tripId = await postTripToSelfoss(page, "09:00");

    // After publishing, on a phone, in English. The screen scrolls inside
    // the page, so a window as tall as the screen shows all of it.
    if (!wide) {
      await expect(page.getByRole("heading", { name: "Share this ride" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Story on Instagram" })).toBeVisible();
      await expect(page.locator('[style*="blob:"]')).toBeVisible();
      await showWhole(page, 412);
      await page.screenshot({ path: join(folder, "published-phone.png") });
      // The story section: from its heading to Copy link.
      const top = await page.getByRole("heading", { name: "Story on Instagram" }).boundingBox();
      const end = await page.getByRole("button", { name: "Copy link" }).boundingBox();
      if (top === null || end === null) throw new Error("The story section is not there");
      await page.screenshot({
        path: join(folder, "story-section-phone.png"),
        clip: { x: 0, y: top.y - 16, width: 412, height: end.y + end.height - top.y + 32 },
      });
      // The icon in the corner of the ticket on the driver's ride (spec 31, 3.12).
      await page.setViewportSize({ width: 412, height: 839 });
      await page.goto(`/drive/trips/${tripId}`);
      await shootTopOfRide(page, join(folder, "trip-page-head-phone.png"), 412);
      return;
    }
    // The driver's ride on a laptop: the icon in the corner of the ticket beside the page.
    await page.goto(`/drive/trips/${tripId}`);
    await shootTopOfRide(page, join(folder, "trip-page-head-laptop.png"), 1280);
    // Its own screen on a laptop, in Icelandic: the post's text in it too.
    await page.goto(`/drive/trips/${tripId}/share`);
    await page.getByRole("button", { name: "Change the language to Icelandic" }).click();
    await expect(page.getByRole("heading", { name: "Deildu þessari ferð" })).toBeVisible();
    await expect(page.getByText(/^Býð far: /u)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Story á Instagram" })).toBeVisible();
    await expect(page.locator('[style*="blob:"]')).toBeVisible();
    await showWhole(page, 1280);
    await page.screenshot({ path: join(folder, "share-screen-laptop-is.png") });
  });

  // Find and the search results as built (spec 31, 3.5, 3.6 and 3.16): on a
  // phone in English by day and in Icelandic at night, and on a laptop. They
  // are kept as .webp (docs/specs/images/one-ride-one-ticket/src/README.md).
  test("Find and the results (spec 31)", async ({ page, browser }, info) => {
    test.setTimeout(180_000);
    const folder = join(root ?? "", "one-ride-one-ticket", "built");
    mkdirSync(folder, { recursive: true });
    const wide = info.project.name === "desktop";
    const window = wide ? { width: 1280, height: 720 } : (page.viewportSize() ?? null);
    if (window === null) throw new Error("The page has no size");

    // Bára offers a ride and Dóra asks for a seat on it, so Find has
    // something that needs Bára, and Dóra a next ride.
    await page.setViewportSize(window);
    await signUp(page, english, "Bára");
    const tripId = await postTripToSelfoss(page, "09:00");
    // Dóra's browser, like Bára's: the same window, at twice its size on a phone.
    const { userAgent, isMobile, hasTouch, baseURL } = info.project.use;
    const other = await browser.newContext({
      viewport: window,
      deviceScaleFactor: 2,
      userAgent,
      isMobile,
      hasTouch,
      baseURL,
      locale: "en-GB",
    });
    const dora = await other.newPage();
    await requestSeat(dora, "Dóra", tripId);

    const shoot = async (of: Page, name: string, scheme: "light" | "dark") => {
      await showWhole(of, window.width);
      const kind = wide ? "laptop" : "phone";
      // A laptop's picture is as large as its window; a phone's twice that.
      await of.screenshot({
        path: join(folder, `${name}-${kind}-${scheme}.png`),
        scale: wide ? "css" : "device",
      });
      await of.setViewportSize(window);
    };
    const find = async (greeting: string, needs: string) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: greeting })).toBeVisible();
      await expect(page.getByText(needs, { exact: true })).toBeVisible();
      await expect(page.getByTestId("trip-result").first()).toBeVisible();
    };
    // What Dóra finds from Mjódd to Hveragerði, a part of both drivers' rides.
    // The points by their whole names: a search made before is a button
    // on this screen too, and starts with the same word.
    const results = async (from: string, to: string, mjodd: RegExp, findRide: string) => {
      await dora.goto("/search");
      await choose(dora, from, "mjód", mjodd);
      await choose(dora, to, "hverag", /^N1 Hveragerði,/);
      await dora.getByRole("button", { name: findRide, exact: true }).click();
      await expect(dora.getByTestId("results-end").filter({ visible: true })).toBeVisible();
    };

    await find("Hi Bára", "Dóra asks for 1 seat");
    await shoot(page, "find", "light");
    await results("From", "To", /^Mjódd bus terminal,/, "Find a ride");
    await shoot(dora, "results", "light");

    if (!wide) {
      for (const person of [page, dora]) {
        await person.emulateMedia({ colorScheme: "dark" });
        await person.goto("/");
        await person.getByRole("button", { name: "Change the language to Icelandic" }).click();
        await expect(person.getByRole("button", { name: "Skipta yfir í ensku" })).toBeVisible();
      }
      await find("Hæ Bára", "Dóra biður um 1 sæti");
      await shoot(page, "find", "dark");
      await results("Frá", "Til", /^Mjódd,/, "Finna far");
      await shoot(dora, "results", "dark");
    }
    await other.close();
  });

  test("a ride's details and booking a seat (spec 31)", async ({ page, browser }, info) => {
    test.setTimeout(180_000);
    const folder = join(root ?? "", "one-ride-one-ticket", "built");
    mkdirSync(folder, { recursive: true });
    const wide = info.project.name === "desktop";
    const window = wide ? { width: 1280, height: 720 } : (page.viewportSize() ?? null);
    if (window === null) throw new Error("The page has no size");

    // Bára offers a ride, and Dóra opens a part of it, signed in.
    await page.setViewportSize(window);
    await signUp(page, english, "Bára");
    const tripId = await postTripToSelfoss(page, "09:00");
    const { userAgent, isMobile, hasTouch, baseURL } = info.project.use;
    const other = await browser.newContext({
      viewport: window,
      deviceScaleFactor: 2,
      userAgent,
      isMobile,
      hasTouch,
      baseURL,
      locale: "en-GB",
    });
    const dora = await other.newPage();
    await signUp(dora, english, "Dóra");

    const shoot = async (name: string, scheme: "light" | "dark") => {
      await showWhole(dora, window.width);
      const kind = wide ? "laptop" : "phone";
      await dora.screenshot({
        path: join(folder, `${name}-${kind}-${scheme}.png`),
        scale: wide ? "css" : "device",
      });
      await dora.setViewportSize(window);
    };
    const visible = { visible: true };
    // From the second stop to the last: both ends can change, and the part
    // leaves the capital area, so the weather and the roads have a row.
    const ride = async (yourPart: string) => {
      await dora.goto(`/trips/${tripId}?from=1&to=3`);
      await expect(dora.getByRole("heading", { name: yourPart }).filter(visible)).toBeVisible();
      await expect(dora.getByTestId("where-you-sit").filter(visible)).toBeVisible();
    };
    const book = async (sendRequest: string, title: string) => {
      await dora.getByRole("button", { name: sendRequest, exact: true }).click();
      await expect(dora.getByRole("heading", { name: title }).filter(visible)).toBeVisible();
    };

    if (!wide) {
      // Dark and in Icelandic first, while the seat is not asked for yet.
      await dora.emulateMedia({ colorScheme: "dark" });
      await dora.goto("/");
      await dora.getByRole("button", { name: "Change the language to Icelandic" }).click();
      await expect(dora.getByRole("button", { name: "Skipta yfir í ensku" })).toBeVisible();
      await ride("Þinn hluti ferðarinnar");
      await shoot("ride", "dark");
      await book("Senda beiðni", "Óska eftir sæti í þessari ferð");
      await shoot("book", "dark");
      await dora.emulateMedia({ colorScheme: "light" });
      await dora.goto("/");
      await dora.getByRole("button", { name: "Skipta yfir í ensku" }).click();
      await expect(
        dora.getByRole("button", { name: "Change the language to Icelandic" }),
      ).toBeVisible();
    }
    await ride("Your part of the ride");
    await shoot("ride", "light");
    await book("Send request", "Request this ride");
    await shoot("book", "light");
    await dora.getByRole("button", { name: "Send request", exact: true }).click();
    await expect(dora.getByRole("heading", { name: "Request sent" }).filter(visible)).toBeVisible();
    await shoot("booked", "light");
    await other.close();
  });

  // A booked seat and its trip day as built (spec 31, 3.8, 3.9 and 3.16).
  test("a booked seat and the trip day (spec 31)", async ({ page, browser }, info) => {
    test.setTimeout(240_000);
    const folder = join(root ?? "", "one-ride-one-ticket", "built");
    mkdirSync(folder, { recursive: true });
    const wide = info.project.name === "desktop";
    const window = wide ? { width: 1280, height: 720 } : (page.viewportSize() ?? null);
    if (window === null) throw new Error("The page has no size");

    // Bára offers a ride for tomorrow; Dóra asks, Bára says yes and Dóra pays.
    await page.setViewportSize(window);
    const { userAgent, isMobile, hasTouch, baseURL } = info.project.use;
    const other = await browser.newContext({
      viewport: window,
      deviceScaleFactor: 2,
      userAgent,
      isMobile,
      hasTouch,
      baseURL,
      locale: "en-GB",
    });
    const dora = await other.newPage();
    // The whole ride, to N1 Selfoss, which leaves the capital area.
    const { tripId, booking } = await confirmedBooking(page, dora, [], 3);

    const visible = { visible: true };
    const shoot = async (name: string, scheme: "light" | "dark") => {
      await showWhole(dora, window.width);
      const kind = wide ? "laptop" : "phone";
      await dora.screenshot({
        path: join(folder, `${name}-${kind}-${scheme}.png`),
        scale: wide ? "css" : "device",
      });
      await dora.setViewportSize(window);
    };
    const speak = async (to: "Icelandic" | "English") => {
      await dora.emulateMedia({ colorScheme: to === "Icelandic" ? "dark" : "light" });
      await dora.goto("/");
      const [press, then] =
        to === "Icelandic"
          ? ["Change the language to Icelandic", "Skipta yfir í ensku"]
          : ["Skipta yfir í ensku", "Change the language to Icelandic"];
      await dora.getByRole("button", { name: press }).click();
      await expect(dora.getByRole("button", { name: then })).toBeVisible();
    };
    const open = async (title: string | RegExp) => {
      await dora.goto(booking);
      await expect(dora.getByRole("heading", { name: title }).filter(visible)).toBeVisible();
      await expect(dora.getByTestId("where-to-stand").filter(visible)).toBeVisible();
    };

    await open("Your seat is confirmed");
    await shoot("booking", "light");
    if (!wide) {
      await speak("Icelandic");
      await open("Sætið þitt er staðfest");
      await shoot("booking", "dark");
      await speak("English");
    }

    // The ride now leaves in 20 minutes: the trip day, with "I'm here" open.
    const moved = await page.request.post(`${apiUrl}/e2e/trips/${tripId}/move`, {
      data: { minutes: 20 },
    });
    expect(moved.status()).toBe(204);
    await open(/^Leaves in \d+ minutes$/);
    await expect(dora.getByRole("button", { name: "I'm here", exact: true })).toBeVisible();
    await shoot("trip-day", "light");
    if (!wide) {
      await speak("Icelandic");
      await open(/^Brottför eftir \d+ mínútur$/);
      await shoot("trip-day", "dark");
    }
    await other.close();
  });

  // The screens around a booking as built (spec 31, 3.19): cancelling on a
  // phone and a laptop; reporting, blocking, "The driver didn't come" and
  // rating on a phone.
  test("the screens around a booking (spec 31)", async ({ page, browser }, info) => {
    test.setTimeout(300_000);
    const folder = join(root ?? "", "one-ride-one-ticket", "built");
    mkdirSync(folder, { recursive: true });
    const wide = info.project.name === "desktop";
    const window = wide ? { width: 1280, height: 720 } : (page.viewportSize() ?? null);
    if (window === null) throw new Error("The page has no size");

    await page.setViewportSize(window);
    const { userAgent, isMobile, hasTouch, baseURL } = info.project.use;
    const other = await browser.newContext({
      viewport: window,
      deviceScaleFactor: 2,
      userAgent,
      isMobile,
      hasTouch,
      baseURL,
      locale: "en-GB",
    });
    const dora = await other.newPage();
    const { tripId, booking } = await confirmedBooking(page, dora, [], 3);
    const bookingId = booking.split("/").at(-1) ?? "";

    const visible = { visible: true };
    const shoot = async (name: string, scheme: "light" | "dark") => {
      await showWhole(dora, window.width);
      const kind = wide ? "laptop" : "phone";
      await dora.screenshot({
        path: join(folder, `${name}-${kind}-${scheme}.png`),
        scale: wide ? "css" : "device",
      });
      await dora.setViewportSize(window);
    };
    const open = async (path: string, title: string) => {
      await dora.goto(path);
      await expect(dora.getByRole("heading", { name: title }).filter(visible)).toBeVisible();
    };
    const move = async (minutes: number) => {
      const moved = await page.request.post(`${apiUrl}/e2e/trips/${tripId}/move`, {
        data: { minutes },
      });
      expect(moved.status()).toBe(204);
    };

    // Cancelling, with a reason chosen so all it says shows.
    await open(`${booking}/cancel`, "Cancel your booking");
    await dora.getByRole("radio", { name: "Plans changed" }).click();
    await shoot("cancel", "light");
    if (wide) {
      await other.close();
      return;
    }
    await dora.emulateMedia({ colorScheme: "dark" });
    await dora.goto("/");
    await dora.getByRole("button", { name: "Change the language to Icelandic" }).click();
    await expect(dora.getByRole("button", { name: "Skipta yfir í ensku" })).toBeVisible();
    await open(`${booking}/cancel`, "Afbóka bókunina");
    await dora.getByRole("radio", { name: "Breyttar áætlanir" }).click();
    await shoot("cancel", "dark");
    await dora.emulateMedia({ colorScheme: "light" });
    await dora.goto("/");
    await dora.getByRole("button", { name: "Skipta yfir í ensku" }).click();
    await expect(
      dora.getByRole("button", { name: "Change the language to Icelandic" }),
    ).toBeVisible();

    // Reporting a problem with the ride, and blocking the driver.
    await open(`/report?kind=booking&id=${bookingId}`, "Report a problem with this ride");
    await dora.getByRole("radio", { name: "The ride wasn't as listed" }).click();
    await shoot("report", "light");
    await open(`${booking}/block`, "Block Bára?");
    await shoot("block", "light");

    // A quarter of an hour after the time to get in: the driver didn't come.
    await move(-15);
    await open(`${booking}/driver-absent`, "The driver didn't come");
    await shoot("driver-absent", "light");

    // A day and a half later the ride is done: rating the driver.
    await move(-36 * 60);
    await open(`${booking}/rate`, "How was your ride?");
    await dora.getByRole("radio", { name: "5 stars" }).click();
    await shoot("rate", "light");
    await other.close();
  });

  // The driver's ride as built (spec 31, 3.12 and 3.16): a request to
  // answer, a passenger, the seats and the ride's rows; then, on a phone, a
  // passenger's row unfolded and the trip day with "I'm here" in the bar.
  test("the driver's ride (spec 31)", async ({ page, browser }, info) => {
    test.setTimeout(300_000);
    const folder = join(root ?? "", "one-ride-one-ticket", "built");
    mkdirSync(folder, { recursive: true });
    const wide = info.project.name === "desktop";
    const window = wide ? { width: 1280, height: 720 } : (page.viewportSize() ?? null);
    if (window === null) throw new Error("The page has no size");

    // Bára offers a ride for tomorrow. Dóra rides the whole way, and Einar
    // asks for a seat on its first stretch.
    await page.setViewportSize(window);
    const dora = await secondPage(browser, info);
    const einar = await secondPage(browser, info);
    const { tripId } = await confirmedBooking(page, dora.page, [], 3);
    await requestSeat(einar.page, "Einar", tripId);

    const visible = { visible: true };
    const kind = wide ? "laptop" : "phone";
    const shoot = async (name: string, scheme: "light" | "dark") => {
      await showWhole(page, window.width);
      await page.screenshot({
        path: join(folder, `${name}-${kind}-${scheme}.png`),
        scale: wide ? "css" : "device",
      });
      await page.setViewportSize(window);
    };
    const speak = async (to: "Icelandic" | "English") => {
      await page.emulateMedia({ colorScheme: to === "Icelandic" ? "dark" : "light" });
      await page.goto("/");
      const [press, then] =
        to === "Icelandic"
          ? ["Change the language to Icelandic", "Skipta yfir í ensku"]
          : ["Skipta yfir í ensku", "Change the language to Icelandic"];
      await page.getByRole("button", { name: press }).click();
      await expect(page.getByRole("button", { name: then })).toBeVisible();
    };
    const open = async (title: string | RegExp) => {
      await page.goto(`/drive/trips/${tripId}`);
      await expect(page.getByRole("heading", { name: title }).filter(visible)).toBeVisible();
      await expect(page.getByTestId("seats-card").filter(visible)).toBeVisible();
      await expect(page.getByTestId("passenger-row").filter(visible).first()).toBeVisible();
    };

    await open("Your ride to N1 Selfoss");
    await expect(page.getByTestId("request").filter(visible)).toBeVisible();
    await shoot("driver-ride", "light");
    if (wide) {
      await dora.close();
      await einar.close();
      return;
    }
    await speak("Icelandic");
    await open(/^Ferðin þín: .+ → N1 Selfossi$/);
    await shoot("driver-ride", "dark");
    await speak("English");

    // A passenger's row unfolded: their part, their profile, reporting
    // them, and cancelling their booking, red and last.
    await open("Your ride to N1 Selfoss");
    await passengerRow(page, "Dóra", "Confirmed").click();
    const passengers = page.getByTestId("passengers").filter(visible);
    await expect(passengers.getByRole("link", { name: "Cancel booking: Dóra" })).toBeVisible();
    await passengers.scrollIntoViewIfNeeded();
    // As a finger leaves it: no pointer stays over the row.
    await page.mouse.move(0, 0);
    await passengers.screenshot({ path: join(folder, "driver-ride-passenger-phone-light.png") });

    // Bára says yes to Einar, and he pays: two passengers get in at the first stop.
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(passengerRow(page, "Einar", "Waiting for payment")).toBeVisible();
    await einar.page.reload();
    await einar.page.getByRole("button", { name: /^Pay [\d,]+ ISK$/ }).click();
    await einar.page.getByRole("button", { name: /^Pay [\d,]+ ISK$/ }).click();
    await expect(
      einar.page.getByText("Your seat is confirmed", { exact: true }).filter(visible),
    ).toBeVisible();

    // The ride now leaves in 20 minutes: the trip day, with "I'm here" in the bar.
    const moved = await page.request.post(`${apiUrl}/e2e/trips/${tripId}/move`, {
      data: { minutes: 20 },
    });
    expect(moved.status()).toBe(204);
    await open("Your ride to N1 Selfoss");
    await expect(
      page.getByTestId("driver-im-here").getByRole("button", { name: /^I'm here at / }),
    ).toBeVisible();
    await shoot("driver-trip-day", "light");
    await dora.close();
    await einar.close();
  });

  // What the driver's ride opens, as built (spec 31, 3.19): Edit the ride
  // as rows with what is set now; then, on a phone, cancelling the ride and
  // sharing it, each with its title at the left over the ride's ticket.
  test("editing, cancelling and sharing a ride I drive (spec 31)", async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(300_000);
    const folder = join(root ?? "", "one-ride-one-ticket", "built");
    mkdirSync(folder, { recursive: true });
    const wide = info.project.name === "desktop";
    const window = wide ? { width: 1280, height: 720 } : (page.viewportSize() ?? null);
    if (window === null) throw new Error("The page has no size");

    // Bára offers a ride for tomorrow, and Dóra has a seat on it.
    await page.setViewportSize(window);
    const dora = await secondPage(browser, info);
    const { tripId } = await confirmedBooking(page, dora.page, [], 3);

    const visible = { visible: true };
    const kind = wide ? "laptop" : "phone";
    const shoot = async (name: string, scheme: "light" | "dark") => {
      await showWhole(page, window.width);
      await page.screenshot({
        path: join(folder, `${name}-${kind}-${scheme}.png`),
        scale: wide ? "css" : "device",
      });
      await page.setViewportSize(window);
    };
    const open = async (screen: string, title: string) => {
      await page.goto(`/drive/trips/${tripId}/${screen}`);
      await expect(page.getByRole("heading", { name: title }).filter(visible)).toBeVisible();
    };

    await open("edit", "Edit the ride");
    await expect(page.getByRole("link", { name: /^Time, / }).filter(visible)).toBeVisible();
    await shoot("edit-ride", "light");
    if (wide) {
      await dora.close();
      return;
    }
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.getByRole("button", { name: "Change the language to Icelandic" }).click();
    await expect(page.getByRole("button", { name: "Skipta yfir í ensku" })).toBeVisible();
    await open("edit", "Breyta ferð");
    await expect(page.getByRole("link", { name: /^Tími, / }).filter(visible)).toBeVisible();
    await shoot("edit-ride", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.getByRole("button", { name: "Skipta yfir í ensku" }).click();
    await expect(
      page.getByRole("button", { name: "Change the language to Icelandic" }),
    ).toBeVisible();

    // Cancelling it: a reason chosen, who is told, and the red button in the bar.
    await open("cancel", "Cancel your ride");
    await expect(page.getByTestId("driver-ride-ticket").filter(visible)).toBeVisible();
    await page.getByRole("radio", { name: "Car problem" }).click();
    await shoot("cancel-ride", "light");

    await open("share", "Share this ride");
    await expect(page.getByTestId("driver-ride-ticket").filter(visible)).toBeVisible();
    await expect(page.getByLabel("Text for your post").filter(visible)).toBeVisible();
    await shoot("share-ride", "light");
    await dora.close();
  });

  // My rides as built (spec 31, 3.10), and the drafts on Offer (3.11, item
  // 6). Bára drove Dóra the day before yesterday, offers two rides for
  // tomorrow, one of which Einar asks a seat on, and has started two more
  // without publishing them.
  test("My rides and the drafts on Offer (spec 31)", async ({ page, browser }, info) => {
    test.setTimeout(300_000);
    const folder = join(root ?? "", "one-ride-one-ticket", "built");
    mkdirSync(folder, { recursive: true });
    const wide = info.project.name === "desktop";
    const window = wide ? { width: 1280, height: 720 } : (page.viewportSize() ?? null);
    if (window === null) throw new Error("The page has no size");
    await page.setViewportSize(window);
    const dora = await secondPage(browser, info);
    const einar = await secondPage(browser, info);

    // The ride that is done: each can still rate the other.
    const done = await confirmedBooking(page, dora.page);
    const moved = await page.request.post(`${apiUrl}/e2e/trips/${done.tripId}/move`, {
      data: { minutes: -36 * 60 },
    });
    expect(moved.status()).toBe(204);
    // Tomorrow's two: Einar asks for a seat on the first.
    const asked = await postTripToSelfoss(page, "17:45", [], true);
    await postTripToSelfoss(page, "20:15", [], true);
    await requestSeat(einar.page, "Einar", asked);

    const visible = { visible: true };
    const kind = wide ? "laptop" : "phone";
    const shoot = async (name: string, scheme: "light" | "dark") => {
      await showWhole(page, window.width);
      await page.screenshot({
        path: join(folder, `${name}-${kind}-${scheme}.png`),
        scale: wide ? "css" : "device",
      });
      await page.setViewportSize(window);
    };
    const tickets = (start: string) =>
      page.getByRole("button", { name: new RegExp(`^${start}, `) }).filter(visible);

    await page.goto("/my-rides");
    await expect(page.getByRole("heading", { name: "Needs you" }).filter(visible)).toBeVisible();
    await expect(tickets("You drive")).toHaveCount(2);
    await shoot("my-rides", "light");
    if (wide) {
      await dora.close();
      await einar.close();
      return;
    }

    // Under Past, the ride that is done says whose rating is still to give.
    await page.goto("/my-rides?when=past");
    await expect(
      page.getByText("Rate your passenger", { exact: true }).filter(visible),
    ).toBeVisible();
    await shoot("my-rides-past", "light");

    // In Icelandic, at night.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.getByRole("button", { name: "Change the language to Icelandic" }).click();
    await expect(page.getByRole("button", { name: "Skipta yfir í ensku" })).toBeVisible();
    await page.goto("/my-rides");
    await expect(tickets("Þú ekur")).toHaveCount(2);
    await shoot("my-rides", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.getByRole("button", { name: "Skipta yfir í ensku" }).click();
    await expect(
      page.getByRole("button", { name: "Change the language to Icelandic" }),
    ).toBeVisible();

    // Four rides started and left, the one changed last first: three
    // show, one of them with its day and time, and "Show all drafts"
    // brings the fourth.
    type Point = readonly [typed: string, card: RegExp];
    const mjodd: Point = ["mjódd", /^Mjódd bus terminal,/];
    const start = async (from: Point, to: Point) => {
      await page.goto("/offer");
      const choose = async (end: "From" | "To", [typed, name]: Point) => {
        await page.getByRole("button", { name: new RegExp(`^${end}: `) }).click();
        await page.getByLabel(end, { exact: true }).fill(typed);
        await page.getByRole("button", { name }).click();
      };
      await choose("From", from);
      await choose("To", to);
      await page.getByRole("button", { name: "Choose date and time" }).click();
      await expect(page.getByRole("heading", { name: "When are you leaving?" })).toBeVisible();
    };
    await start(["selfo", /^N1 Selfoss,/], ["hella", /^N1 Hella,/]);
    await start(["bs", /^BSÍ bus terminal,/], ["borgar", /^N1 Borgarnes,/]);
    await start(mjodd, ["hverag", /^N1 Hveragerði,/]);
    const day = tomorrow("en");
    if (day.nextMonth) await page.getByRole("button", { name: "Next month" }).click();
    await page.getByRole("radio", { name: day.name }).click();
    await chooseTime(page, "Leaving Mjódd bus terminal at", "08:30");
    await page.getByRole("button", { name: "Choose seats" }).click();
    await expect(page.getByRole("button", { name: "Set your price" })).toBeVisible();
    await start(mjodd, ["selfo", /^N1 Selfoss,/]);
    await page.goto("/offer");
    const drafts = page.getByTestId("draft-rows").filter(visible);
    await expect(drafts.getByRole("link")).toHaveCount(3);
    await expect(drafts.getByRole("button", { name: "Show all drafts" })).toBeVisible();
    await page.waitForTimeout(500);
    const rows = await drafts.boundingBox();
    if (rows === null) throw new Error("Offer has no drafts");
    // The top of Offer: the drafts, and the form's first fields under them.
    await page.screenshot({
      path: join(folder, "offer-drafts-phone-light.png"),
      clip: { x: 0, y: 0, width: window.width, height: Math.ceil(rows.y + rows.height) + 180 },
    });
    await dora.close();
    await einar.close();
  });

  test("offering a ride (spec 31)", async ({ page }, info) => {
    test.setTimeout(300_000);
    const folder = join(root ?? "", "one-ride-one-ticket", "built");
    mkdirSync(folder, { recursive: true });
    const wide = info.project.name === "desktop";
    const window = wide ? { width: 1280, height: 720 } : (page.viewportSize() ?? null);
    if (window === null) throw new Error("The page has no size");
    await page.setViewportSize(window);
    const visible = { visible: true };
    const kind = wide ? "laptop" : "phone";
    const shoot = async (name: string, scheme: "light" | "dark") => {
      await showWhole(page, window.width);
      // Away from the rows: one under the pointer would show as hovered.
      await page.mouse.move(0, 0);
      await page.screenshot({
        path: join(folder, `${name}-${kind}-${scheme}.png`),
        scale: wide ? "css" : "device",
      });
      await page.setViewportSize(window);
    };
    const heading = (name: string) => page.getByRole("heading", { name }).filter(visible);

    // A first-time driver: the photo, the car and the licence are asked on
    // the last step.
    await signUp(page, english, "Anna");
    await page.goto("/offer");
    await choose(page, "From", "mjódd", /^Mjódd bus terminal,/);
    await choose(page, "To", "selfo", /^N1 Selfoss,/);
    await expect(page.getByRole("switch", { name: "Olís Norðlingaholt" })).toBeVisible();
    await shoot("offer-route", "light");
    if (!wide) {
      // Another meeting point, with the head of a step.
      await page.getByRole("button", { name: "Add a meeting point" }).click();
      await expect(heading("Add a meeting point")).toBeVisible();
      await shoot("offer-add-point", "light");
      await page.getByRole("button", { name: "Back" }).filter(visible).click();
    }
    await page.getByRole("button", { name: "Choose date and time" }).click();
    const day = tomorrow("en");
    if (day.nextMonth) await page.getByRole("button", { name: "Next month" }).click();
    await page.getByRole("radio", { name: day.name }).click();
    await chooseTime(page, "Leaving Mjódd bus terminal at", "17:45");
    await page.getByRole("button", { name: "Choose seats" }).click();
    await page.getByRole("button", { name: "Set your price" }).click();
    await expect(heading("Set your price")).toBeVisible();
    if (!wide) await shoot("offer-price", "light");
    await page.getByRole("button", { name: "Check your ride" }).click();
    await expect(heading("Check and publish")).toBeVisible();
    await expect(page.getByTestId("preview-ticket").filter(visible)).toBeVisible();
    const review = page.url();
    if (!wide) await shoot("offer-check-missing", "light");

    await addPhotoBeforePublishing(page);
    await page.getByRole("button", { name: "Add a car" }).click();
    await page.getByLabel("Make").fill("Toyota");
    await page.getByLabel("Model").fill("Yaris");
    await page.getByRole("radio", { name: "White" }).click();
    await page.getByRole("button", { name: "Save car" }).click();
    await page.getByRole("button", { name: "Confirm your licence" }).click();
    await page
      .getByRole("checkbox", {
        name: "I declare that I hold a valid driving licence for the cars I drive on PuffinRide",
      })
      .click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(heading("Check and publish")).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish ride" }).filter(visible)).toBeEnabled();
    await expect(page.getByTestId("needs-you-card").filter(visible)).toHaveCount(0);
    await shoot("offer-check", "light");
    if (wide) return;

    // In Icelandic, at night.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.getByRole("button", { name: "Change the language to Icelandic" }).click();
    await expect(page.getByRole("button", { name: "Skipta yfir í ensku" })).toBeVisible();
    await page.goto(review);
    await expect(heading("Yfirfara og birta")).toBeVisible();
    await expect(page.getByTestId("preview-ticket").filter(visible)).toBeVisible();
    await shoot("offer-check", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.getByRole("button", { name: "Skipta yfir í ensku" }).click();
    await expect(
      page.getByRole("button", { name: "Change the language to Icelandic" }),
    ).toBeVisible();

    await page.goto(review);
    await page.getByRole("button", { name: "Publish ride" }).filter(visible).click();
    await expect(heading("Your ride is published")).toBeVisible();
    await expect(page.getByRole("button", { name: /^You drive, / }).filter(visible)).toBeVisible();
    await shoot("offer-published", "light");
  });

  // Messages as built (spec 31, 3.13): a conversation with its top, the
  // ride as one line, the quiet safety line, the chips and the field; its
  // menu open; the field with three lines written; the same in Icelandic
  // at night; and the list. On a laptop, the conversation beside the list.
  test("Messages (spec 31)", async ({ page, browser }, info) => {
    test.setTimeout(300_000);
    const folder = join(root ?? "", "one-ride-one-ticket", "built");
    mkdirSync(folder, { recursive: true });
    const wide = info.project.name === "desktop";
    const window = wide ? { width: 1280, height: 720 } : (page.viewportSize() ?? null);
    if (window === null) throw new Error("The page has no size");
    await page.setViewportSize(window);
    const { userAgent, isMobile, hasTouch, baseURL } = info.project.use;
    const other = await browser.newContext({
      viewport: window,
      deviceScaleFactor: 2,
      userAgent,
      isMobile,
      hasTouch,
      baseURL,
      locale: "en-GB",
    });
    const dora = await other.newPage();
    // At half past five, whenever the pictures are taken.
    const { tripId, booking } = await confirmedBooking(page, dora, [], 3, "17:30");
    const chat = `/messages/${booking.split("/").at(-1) ?? ""}`;
    const visible = { visible: true };
    const kind = wide ? "laptop" : "phone";
    // A conversation is as tall as the window: its top and its bar stay.
    const shoot = async (name: string, scheme: "light" | "dark") => {
      await dora.mouse.move(0, 0);
      await dora.waitForTimeout(500);
      await dora.screenshot({
        path: join(folder, `${name}-${kind}-${scheme}.png`),
        scale: wide ? "css" : "device",
      });
    };

    // Dóra asks where to wait, and Bára answers from her ride.
    await dora.goto(chat);
    await expect(dora.getByRole("heading", { name: "Bára" }).filter(visible)).toBeVisible();
    await dora.getByLabel("Write a message").filter(visible).fill("Where shall I wait?");
    await dora.getByRole("button", { name: "Send", exact: true }).filter(visible).click();
    await expect(dora.getByLabel(/^You, \d\d:\d\d: Where shall I wait\?$/)).toBeVisible();
    await page.goto(`/drive/trips/${tripId}`);
    await page.getByRole("button", { name: "Message Dóra" }).click();
    await expect(page.getByLabel(/^Dóra, \d\d:\d\d: Where shall I wait\?$/)).toBeVisible();
    await page
      .getByLabel("Write a message")
      .filter(visible)
      .fill("By the bus shelter, on the side of the shops.");
    await page.getByRole("button", { name: "Send", exact: true }).filter(visible).click();
    await expect(dora.getByLabel(/^Bára, \d\d:\d\d: By the bus shelter/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(dora.getByLabel(/Where shall I wait\? Seen$/)).toBeVisible({ timeout: 15_000 });
    await shoot("chat", "light");
    if (wide) {
      await other.close();
      return;
    }

    // The menu of its top, open.
    await dora.getByRole("button", { name: "More", exact: true }).filter(visible).click();
    await expect(dora.getByRole("button", { name: "Block Bára" }).filter(visible)).toBeVisible();
    await shoot("chat-menu", "light");
    await dora.getByRole("button", { name: "More", exact: true }).filter(visible).click();

    // Three lines written: the field has grown, and Send stays at its foot.
    await dora
      .getByLabel("Write a message")
      .filter(visible)
      .fill("I have a small rucksack and a pair of skis.\nIs that fine?\nI can also take the bus.");
    await shoot("chat-writing", "light");
    await dora.getByLabel("Write a message").filter(visible).fill("");

    // The list of conversations.
    await dora.goto("/messages");
    await expect(dora.getByRole("heading", { name: "Messages" }).filter(visible)).toBeVisible();
    await expect(dora.getByRole("button", { name: /^Bára, / }).filter(visible)).toBeVisible();
    await shoot("messages", "light");

    // In Icelandic, at night.
    await dora.emulateMedia({ colorScheme: "dark" });
    await dora.goto("/");
    await dora.getByRole("button", { name: "Change the language to Icelandic" }).click();
    await expect(dora.getByRole("button", { name: "Skipta yfir í ensku" })).toBeVisible();
    await dora.goto(chat);
    await expect(dora.getByRole("heading", { name: "Bára" }).filter(visible)).toBeVisible();
    await expect(dora.getByLabel(/^Bára, \d\d:\d\d: By the bus shelter/)).toBeVisible();
    await shoot("chat", "dark");
    await other.close();
  });

  // Profile as built (spec 31, 3.14): the person's card, the four groups
  // and Sign out on one page; the pages of the language, of the
  // notifications and of the ways to sign in; Profile in Icelandic at
  // night. On a laptop, the card in the side column and the groups in the
  // main one.
  test("Profile and settings (spec 31)", async ({ page }, info) => {
    test.setTimeout(300_000);
    const folder = join(root ?? "", "one-ride-one-ticket", "built");
    mkdirSync(folder, { recursive: true });
    const wide = info.project.name === "desktop";
    const window = wide ? { width: 1280, height: 720 } : (page.viewportSize() ?? null);
    if (window === null) throw new Error("The page has no size");
    await page.setViewportSize(window);
    const visible = { visible: true };
    const shoot = shooter(page, folder, window, wide);
    const heading = (name: string) =>
      page.getByRole("heading", { name, exact: true }).filter(visible);
    const row = (name: string | RegExp) => page.getByRole("link", { name }).filter(visible);

    // Bára has posted a ride: her photo, her car and her licence are in place.
    await signUp(page, english, "Bára");
    await postTripToSelfoss(page, "17:30");
    await page.goto("/profile");
    await expect(heading("My profile")).toBeVisible();
    await expect(row("My cars, Toyota Yaris")).toBeVisible();
    await expect(row("Driving licence, Confirmed")).toBeVisible();
    await expect(row(/^Sign-in methods, /)).toBeVisible();
    await expect(page.getByTestId("person-card-standing").filter(visible)).toBeVisible();
    await shoot("profile", "light");
    if (wide) return;

    // The language's page and the notifications'.
    await row("Language, English").click();
    await expect(heading("Language")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Íslenska" }).filter(visible)).toBeVisible();
    await shoot("language", "light");
    await page.goto("/settings/notifications");
    await expect(heading("Notifications")).toBeVisible();
    await expect(page.getByRole("switch").filter(visible).first()).toBeVisible();
    await shoot("notifications", "light");
    // The ways to sign in, with "Sign out on all devices" at their end.
    await page.goto("/settings/sign-in-methods");
    await expect(
      page.getByRole("button", { name: "Sign out on all devices" }).filter(visible),
    ).toBeVisible();
    await shoot("sign-in-methods", "light");

    // In Icelandic, at night: the language is changed on its own page.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/settings/language");
    await page.getByRole("radio", { name: "Íslenska" }).filter(visible).click();
    await expect(heading("Tungumál")).toBeVisible();
    await page.goto("/profile");
    await expect(row("Tungumál, Íslenska")).toBeVisible();
    await expect(row("Bílarnir mínir, Toyota Yaris")).toBeVisible();
    await expect(page.getByTestId("person-card-standing").filter(visible)).toBeVisible();
    await shoot("profile", "dark");
  });

  // Spec 31, 3.19, the second half of Profile and settings: a person's
  // profile, with the person in the card and Report and Block as the last
  // rows; Edit profile with the same card; and pages Profile opens, their
  // titles at the left: Privacy with its red last row, deleting the account
  // with its red button, and a car with Remove as a red row. The person
  // looked at is made up (support/person.ts).
  test("a person's profile and the pages Profile opens (spec 31)", async ({ page }, info) => {
    test.setTimeout(300_000);
    const folder = join(root ?? "", "one-ride-one-ticket", "built");
    mkdirSync(folder, { recursive: true });
    const wide = info.project.name === "desktop";
    const window = wide ? { width: 1280, height: 720 } : (page.viewportSize() ?? null);
    if (window === null) throw new Error("The page has no size");
    await page.setViewportSize(window);
    const visible = { visible: true };
    const shoot = shooter(page, folder, window, wide);
    const heading = (name: string) =>
      page.getByRole("heading", { name, exact: true }).filter(visible);
    const person = () => page.getByTestId("person-card").filter(visible);

    await signUp(page, english, "Dóra");
    await showPerson(page, aPerson());
    await page.goto(`/people/${personId}`);
    await expect(heading("Profile")).toBeVisible();
    await expect(person().getByText("Bára", { exact: true })).toBeVisible();
    await expect(page.getByText("Easy to travel with.").filter(visible)).toBeVisible();
    await expect(page.getByRole("link", { name: "Block Bára" }).filter(visible)).toBeVisible();
    await shoot("person", "light");
    if (wide) return;

    // Edit profile, with who she is now over the form.
    await page.goto("/profile/edit");
    await expect(heading("Edit profile")).toBeVisible();
    await expect(person().getByText("Dóra", { exact: true })).toBeVisible();
    await shoot("edit-profile", "light");

    // Privacy and your data, then deleting the account: nothing is open yet.
    await page.goto("/settings/privacy");
    await expect(heading("Privacy")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Delete my account" }).filter(visible),
    ).toBeVisible();
    await shoot("privacy", "light");
    await page.goto("/settings/privacy/delete");
    await expect(
      page.getByRole("button", { name: "Delete my account" }).filter(visible),
    ).toBeVisible();
    await shoot("delete-account", "light");

    // A car, once she has posted a ride with one.
    await postTripToSelfoss(page, "17:30");
    await page.goto("/drive/cars");
    await expect(heading("My cars")).toBeVisible();
    await page
      .getByRole("link", { name: /^Toyota Yaris/ })
      .filter(visible)
      .click();
    await expect(heading("Edit your car")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove car" }).filter(visible)).toBeVisible();
    await shoot("edit-car", "light");

    // The person again, in Icelandic, at night.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/settings/language");
    await page.getByRole("radio", { name: "Íslenska" }).filter(visible).click();
    await expect(heading("Tungumál")).toBeVisible();
    await page.goto(`/people/${personId}`);
    await expect(heading("Prófíll")).toBeVisible();
    await expect(page.getByRole("link", { name: "Loka á: Bára" }).filter(visible)).toBeVisible();
    await expect(page.getByText("Easy to travel with.").filter(visible)).toBeVisible();
    await shoot("person", "dark");
  });

  test("the last pass: one main button and titles at the left (spec 31)", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "desktop", "A phone's pictures");
    test.setTimeout(300_000);
    const folder = join(root ?? "", "one-ride-one-ticket", "built");
    mkdirSync(folder, { recursive: true });
    const window = page.viewportSize();
    if (window === null) throw new Error("The page has no size");
    const visible = { visible: true };
    const shoot = shooter(page, folder, window, false);
    const heading = (name: string) =>
      page.getByRole("heading", { name, exact: true }).filter(visible);
    const bar = () => page.getByTestId("bottom-bar").filter(visible);

    // The meeting points, one of them, and what is wrong there.
    await signUp(page, english, "Dóra");
    await page.goto("/meeting-points");
    await expect(heading("Meeting points")).toBeVisible();
    await expect(page.getByTestId("points-map").filter(visible)).toBeVisible();
    await shoot("meeting-points", "light");
    await page.getByRole("radio", { name: "List" }).filter(visible).click();
    await page
      .getByRole("link", { name: /^N1 Vík/ })
      .filter(visible)
      .click();
    await expect(heading("N1 Vík")).toBeVisible();
    await shoot("meeting-point", "light");
    await page.getByRole("button", { name: "Something wrong here?" }).filter(visible).click();
    await expect(heading("What's wrong here?")).toBeVisible();
    await expect(bar().getByRole("button", { name: "Send", exact: true })).toBeVisible();
    await shoot("meeting-point-problem", "light");

    // My cars and All rides, once she has posted a ride with a car.
    await postTripToSelfoss(page, "17:30");
    await page.goto("/drive/cars");
    await expect(heading("My cars")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Toyota Yaris/ }).filter(visible)).toBeVisible();
    await shoot("cars", "light");
    await page.goto("/rides");
    await expect(heading("Rides leaving soon")).toBeVisible();
    await expect(page.getByTestId("ticket-top").filter(visible).first()).toBeVisible();
    await shoot("rides", "light");

    // Asking for a file of my data, with the code's form open.
    await page.goto("/settings/privacy/download");
    await expect(heading("Download my data")).toBeVisible();
    await bar().getByRole("button", { name: "Make my file" }).click();
    await expect(page.getByLabel("6-digit code").filter(visible)).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" }).filter(visible)).toBeVisible();
    await shoot("download-code", "light");

    // A meeting point again, in Icelandic, at night.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/settings/language");
    await page.getByRole("radio", { name: "Íslenska" }).filter(visible).click();
    await expect(heading("Tungumál")).toBeVisible();
    await page.goto("/meeting-points");
    await page.getByRole("radio", { name: "Listi" }).filter(visible).click();
    await page
      .getByRole("link", { name: /^N1 Vík/ })
      .filter(visible)
      .click();
    await expect(heading("N1 Vík")).toBeVisible();
    await shoot("meeting-point", "dark");
  });

  test("the last pass: text twice as large on a phone 360 wide (spec 31)", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "desktop", "A phone's pictures");
    test.setTimeout(300_000);
    const folder = join(root ?? "", "one-ride-one-ticket", "built");
    mkdirSync(folder, { recursive: true });
    const visible = { visible: true };
    /** The window as it is, not the whole screen: what a phone shows of it. */
    const shoot = async (name: string) => {
      await page.mouse.move(0, 0);
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(folder, `${name}-phone-light.png`), scale: "device" });
    };
    await signUp(page, english, "Dóra");
    const tripId = await postTripToSelfoss(page, "17:30");
    await page.setViewportSize({ width: 360, height: 740 });

    // Find: the language under the name, and the menu on two rows.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Hi Dóra" }).filter(visible)).toBeVisible();
    await twiceAsLarge(page);
    await shoot("large-text-find");

    // A posting step: the road says its step in one line.
    await page.goto("/offer");
    await expect(
      page.getByRole("heading", { name: "Where are you driving?" }).filter(visible),
    ).toBeVisible();
    await twiceAsLarge(page);
    await expect(page.getByText("Step 1 of 5: Route").filter(visible)).toBeVisible();
    await shoot("large-text-offer");

    // A ride's stops: "Get in" and "Get out" under their stops' names.
    await page.goto(`/trips/${tripId}?from=0&to=1`);
    const stop = page.getByTestId("route-stop").filter(visible).first();
    await expect(stop).toBeVisible();
    await twiceAsLarge(page);
    await stop.evaluate((row) => {
      row.scrollIntoView({ block: "start" });
    });
    await shoot("large-text-stops");

    // "Where you sit": the words stay beside the car, in a narrow column (left, 12c).
    const seats = page.getByTestId("where-you-sit").filter(visible);
    await seats.evaluate((card) => {
      card.scrollIntoView({ block: "center" });
    });
    await shoot("large-text-where-you-sit");
  });

  test("the last pass: a short window, a phone on its side (spec 31)", async ({ page }, info) => {
    test.skip(info.project.name === "desktop", "A phone's pictures");
    test.setTimeout(300_000);
    const folder = join(root ?? "", "one-ride-one-ticket", "built");
    mkdirSync(folder, { recursive: true });
    const visible = { visible: true };
    const shoot = async (name: string) => {
      await page.mouse.move(0, 0);
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(folder, `${name}-phone-light.png`), scale: "device" });
    };
    await signUp(page, english, "Dóra");
    await openTrip(page, {
      fromField: /^From: /,
      fromLabel: "From",
      from: "mjód",
      fromPoint: /^Mjódd bus terminal,/,
      toField: /^To: /,
      toLabel: "To",
      to: "selfo",
      toPoint: /^N1 Selfoss,/,
      search: "Find a ride",
      result: /^Leaves Mjódd bus terminal at \d\d:\d\d, .*Sigga, New driver/,
    });
    await page.setViewportSize({ width: 740, height: 360 });

    // A ride: nothing of the window is taken by a bar.
    await expect(page.getByTestId("where-you-sit").filter(visible)).toBeVisible();
    await page
      .getByTestId("screen-scroll")
      .filter(visible)
      .evaluate((scroll) => {
        scroll.scrollTo(0, 0);
      });
    await shoot("short-window-ride");
    // And its end: the page's button after its last part.
    // (As far down as the page goes: the bar cannot reach the window's top.)
    const bar = page.getByTestId("bottom-bar").filter(visible);
    await bar.evaluate((end) => {
      end.scrollIntoView({ block: "start" });
    });
    await shoot("short-window-ride-end");
  });
});
