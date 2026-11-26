import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { apiUrl } from "../playwright.config";
import { english, signUp } from "./support/account";
import { confirmedBooking, requestSeat, secondPage } from "./support/cancelling";
import { passengerRow } from "./support/driver-ride";
import { postTripToSelfoss } from "./support/trips";

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
      // The icon beside the trip's name on the driver's trip page, and in
      // the corner of the trip in My trips.
      await page.setViewportSize({ width: 412, height: 839 });
      await page.goto(`/drive/trips/${tripId}`);
      await expect(page.getByRole("button", { name: "Share this ride" })).toBeVisible();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: join(folder, "trip-page-head-phone.png"),
        clip: { x: 0, y: 0, width: 412, height: 260 },
      });
      await page.goto("/drive/trips");
      const mine = page.getByRole("button", { name: /^Mjódd bus terminal → N1 Selfoss, / });
      await expect(mine).toBeVisible();
      await page.waitForTimeout(500);
      await page
        .getByTestId("card-with-corner")
        .filter({ visible: true })
        .first()
        .screenshot({ path: join(folder, "my-trips-card-phone.png") });
      return;
    }
    // The driver's trip page on a laptop: the icon between the name and Edit trip.
    await page.goto(`/drive/trips/${tripId}`);
    await expect(page.getByRole("button", { name: "Share this ride" })).toBeVisible();
    await page.waitForTimeout(500);
    const head = await page.getByTestId("page-head").filter({ visible: true }).boundingBox();
    if (head === null) throw new Error("The ride page has no head");
    await page.screenshot({
      path: join(folder, "trip-page-head-laptop.png"),
      clip: { x: head.x - 16, y: head.y - 16, width: head.width + 32, height: head.height + 26 },
    });
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
});
