import { expect, test } from "@playwright/test";
import { english, icelandic, signUp, type Texts } from "./support/account";
import { expectNoSidewaysScroll, laptop, widths } from "./support/laptop";
import { focused, openTrip, type TripSearch } from "./support/trips";

// Spec 5's requests, My rides (spec 16, 3.3) and what Find shows of my own
// rides (spec 31, 3.5) on the web build, against the sample
// trips the e2e API seeds: Sigga drives Mjódd → N1 Hveragerði → N1 Selfoss
// tomorrow at 17:15, with 4 seats, and answers requests herself. Each run
// requests one seat, finds it in My rides and withdraws it again. Screens left behind stay in the
// page, hidden, so text checks look only at what shows.

interface Journey extends TripSearch {
  readonly locale: string;
  readonly account: Texts;
  readonly name: string;
  readonly sendRequest: string;
  readonly message: string;
  readonly requestSent: string;
  readonly answerBy: RegExp;
  /** A requested seat's ticket says whose answer it waits for (spec 31, 3.10). */
  readonly waiting: string;
  readonly nextRide: string;
  readonly seeInMyRides: string;
  readonly withdraw: string;
  readonly withdrawAsk: RegExp;
  readonly withdrawn: string;
  readonly withdrawnTag: string;
  readonly myRides: string;
  readonly passenger: string;
  readonly past: string;
  readonly nothing: string;
  readonly searchAgain: string;
}

const journeys: readonly Journey[] = [
  {
    locale: "en-GB",
    account: english,
    name: "Hulda",
    fromField: /^From: /,
    from: "mjód",
    fromPoint: /^Mjódd bus terminal,/,
    toField: /^To: /,
    to: "selfo",
    toPoint: /^N1 Selfoss,/,
    fromLabel: "From",
    toLabel: "To",
    search: "Find a ride",
    result: /^Leaves Mjódd bus terminal at \d\d:\d\d, .*Sigga, New driver/,
    sendRequest: "Send request",
    message: "Message to the driver (optional)",
    requestSent: "Request sent",
    answerBy: /^Sigga has until \d\d:\d\d( tomorrow)? to answer\.$/,
    waiting: "Waiting for Sigga's answer",
    nextRide: "Your next ride",
    seeInMyRides: "See it in My rides",
    withdraw: "Withdraw request",
    withdrawAsk: /^Withdraw your request\? Sigga won't see it any more/,
    withdrawn: "You withdrew this request. That never counts against you.",
    withdrawnTag: "Withdrawn",
    myRides: "My rides",
    passenger: "Passenger",
    past: "Past",
    nothing: "Nothing coming up. Book a seat on a ride, or offer the empty seats in your car.",
    searchAgain: "Find another ride",
  },
  {
    locale: "is-IS",
    account: icelandic,
    name: "Hrafn",
    fromField: /^Frá: /,
    from: "mjód",
    fromPoint: /^Mjódd,/,
    toField: /^Til: /,
    to: "selfo",
    toPoint: /^N1 Selfossi,/,
    fromLabel: "Frá",
    toLabel: "Til",
    search: "Finna far",
    result: /^Mjódd, brottför kl\. \d\d:\d\d, .*Sigga, Nýr ökumaður/,
    sendRequest: "Senda beiðni",
    message: "Skilaboð til ökumanns (valfrjálst)",
    requestSent: "Beiðni send",
    answerBy: /^Sigga hefur til \d\d:\d\d( á morgun)? til að svara\.$/,
    waiting: "Sigga á eftir að svara",
    nextRide: "Næsta ferðin þín",
    seeInMyRides: "Sjá í Ferðunum mínum",
    withdraw: "Draga beiðni til baka",
    withdrawAsk: /^Draga beiðnina til baka\? Sigga sér hana ekki lengur/,
    withdrawn: "Þú dróst þessa beiðni til baka. Það hefur aldrei áhrif á áreiðanleika þinn.",
    withdrawnTag: "Dregin til baka",
    myRides: "Ferðirnar mínar",
    passenger: "Farþegi",
    past: "Liðnar",
    nothing: "Ekkert framundan. Bókaðu sæti í ferð eða bjóddu laus sæti í bílnum þínum.",
    searchAgain: "Finna aðra ferð",
  },
];

/** A screen under the one open stays in the page, hidden. */
const shown = { visible: true } as const;

for (const journey of journeys) {
  test.describe(`requests and my rides (${journey.locale})`, () => {
    test.use({ locale: journey.locale });

    test("withdraws a request and finds it under Past", async ({ page }, testInfo) => {
      await signUp(page, journey.account, journey.name);
      await openTrip(page, journey);
      await page.getByRole("button", { name: journey.sendRequest, exact: true }).click();
      await page.getByLabel(journey.message).fill("One small bag.");
      await page.getByRole("button", { name: journey.sendRequest, exact: true }).click();

      // Request sent, with until when Sigga can answer (spec 16, 3.7, item 5).
      await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]+\/booked$/);
      await expect(page.getByRole("heading", { name: journey.requestSent })).toBeVisible();
      await expect(page.getByText(journey.answerBy).filter({ visible: true })).toBeVisible();

      // My rides lists it as a ticket, which says whose answer it waits for.
      await page.getByRole("button", { name: journey.seeInMyRides }).click();
      await expect(page).toHaveURL(/\/my-rides$/);
      const ticket = new RegExp(`^${journey.passenger}, .*, Sigga, ${journey.waiting}$`);
      await expect(page.getByRole("button", { name: ticket }).filter(shown)).toBeVisible();

      // Find greets by name, with the request as the next ride over the
      // search (spec 31, 3.5); the ticket opens the booking.
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: journey.account.hi(journey.name) }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: journey.nextRide })).toBeVisible();
      const next = page.getByTestId("my-ride");
      await expect(next).toHaveCount(1);
      if (testInfo.project.name === "phone") {
        const search = await page.getByRole("button", { name: journey.fromField }).boundingBox();
        expect((await next.boundingBox())?.y).toBeLessThan(search?.y ?? 0);
      } else {
        // Beside the rides, the ticket is whole: its outline and the notches
        // of its tear line stand a little out of it, and the side column does
        // not scroll sideways to reach them.
        const window = page.viewportSize();
        for (const width of widths) {
          await page.setViewportSize(laptop(width));
          await expectNoSidewaysScroll(page);
        }
        if (window !== null) await page.setViewportSize(window);
      }
      await page.getByRole("button", { name: ticket }).click();
      await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]+$/);
      const booking = page.url();

      // Withdrawing asks once more, then frees the seat (R5.8).
      await page.getByRole("button", { name: journey.withdraw }).click();
      await expect(page.getByText(journey.withdrawAsk).filter({ visible: true })).toBeVisible();
      await page.getByRole("button", { name: journey.withdraw }).click();
      await expect(
        page.getByText(journey.withdrawn, { exact: true }).filter({ visible: true }),
      ).toBeVisible();
      await expect.poll(() => focused(page)).toContain(journey.withdrawn);
      await expect(page.getByRole("button", { name: journey.withdraw })).toBeHidden();

      // My rides: nothing coming up; the request is under Past.
      await page.goto("/my-rides");
      await expect(page.getByRole("heading", { name: journey.myRides })).toBeVisible();
      await expect(
        page.getByText(journey.nothing, { exact: true }).filter({ visible: true }),
      ).toBeVisible();
      await page.getByRole("radio", { name: journey.past }).click();
      await expect(page).toHaveURL(/\/my-rides\?when=past$/);
      const card = page.getByRole("button", {
        name: new RegExp(`^${journey.passenger}, .*, Sigga, ${journey.withdrawnTag}$`),
      });
      await expect(card).toBeVisible();
      await card.click();
      await expect(page).toHaveURL(booking);
      await expect(
        page.getByText(journey.withdrawn, { exact: true }).filter({ visible: true }),
      ).toBeVisible();

      // Search again opens the same route on the same day, with Sigga's trip.
      await page.getByRole("button", { name: journey.searchAgain }).click();
      await expect(page).toHaveURL(/\/search\/results\?.*date=\d{4}-\d\d-\d\d/);
      const again = new URL(page.url()).searchParams;
      expect(again.get("seats")).toBe("1");
      expect(again.get("fromName")).toMatch(/^Mjódd/);
      expect(again.get("toName")).toMatch(/^N1 Selfoss/);
      await expect(page.getByRole("button", { name: journey.result }).first()).toBeVisible();
    });
  });
}
