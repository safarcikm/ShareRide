import { expect, test } from "@playwright/test";
import { english, icelandic, signUp, type Texts } from "./support/account";
import { focused, openTrip, type TripSearch } from "./support/trips";

// Spec 5's requests and My bookings on the web build, against the sample
// trips the e2e API seeds: Sigga drives Mjódd → N1 Hveragerði → N1 Selfoss
// tomorrow at 17:15, with 4 seats, and answers requests herself. Each run
// requests one seat and withdraws it again. Screens left behind stay in the
// page, hidden, so text checks look only at what shows.

interface Journey extends TripSearch {
  readonly locale: string;
  readonly account: Texts;
  readonly name: string;
  readonly sendRequest: string;
  readonly message: string;
  readonly requestSent: RegExp;
  readonly withdraw: string;
  readonly withdrawAsk: RegExp;
  readonly withdrawn: string;
  readonly withdrawnTag: string;
  readonly myBookings: string;
  readonly past: string;
  readonly noneUpcoming: string;
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
    field: "Town or meeting point",
    search: "Search",
    result: /^Leaves Mjódd bus terminal at \d\d:\d\d, .*Sigga, New driver/,
    sendRequest: "Send request",
    message: "Message to the driver (optional)",
    requestSent: /^Request sent\. Sigga has until \d\d:\d\d( tomorrow)? to answer\.$/,
    withdraw: "Withdraw request",
    withdrawAsk: /^Withdraw your request\? Sigga won't see it any more/,
    withdrawn: "You withdrew this request. That never counts against you.",
    withdrawnTag: "Withdrawn",
    myBookings: "My bookings",
    past: "Past",
    noneUpcoming: "No rides coming up. Find one and book a seat.",
    searchAgain: "Search again",
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
    field: "Bær eða mótsstaður",
    search: "Leita",
    result: /^Mjódd, brottför kl\. \d\d:\d\d, .*Sigga, Nýr ökumaður/,
    sendRequest: "Senda beiðni",
    message: "Skilaboð til ökumanns (valfrjálst)",
    requestSent: /^Beiðni send\. Sigga hefur til \d\d:\d\d( á morgun)? til að svara\.$/,
    withdraw: "Draga beiðni til baka",
    withdrawAsk: /^Draga beiðnina til baka\? Sigga sér hana ekki lengur/,
    withdrawn: "Þú dróst þessa beiðni til baka. Það hefur aldrei áhrif á áreiðanleika þinn.",
    withdrawnTag: "Dregin til baka",
    myBookings: "Bókanirnar mínar",
    past: "Liðnar",
    noneUpcoming: "Engar ferðir framundan. Finndu far og bókaðu sæti.",
    searchAgain: "Leita aftur",
  },
];

for (const journey of journeys) {
  test.describe(`requests and my bookings (${journey.locale})`, () => {
    test.use({ locale: journey.locale });

    test("withdraws a request and finds it under Past", async ({ page }) => {
      await signUp(page, journey.account, journey.name);
      await openTrip(page, journey);
      await page.getByRole("button", { name: journey.sendRequest, exact: true }).click();
      await page.getByLabel(journey.message).fill("One small bag.");
      await page.getByRole("button", { name: journey.sendRequest, exact: true }).click();

      await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]+$/);
      const booking = page.url();
      await expect(page.getByText(journey.requestSent).filter({ visible: true })).toBeVisible();

      // Withdrawing asks once more, then frees the seat (R5.8).
      await page.getByRole("button", { name: journey.withdraw }).click();
      await expect(page.getByText(journey.withdrawAsk).filter({ visible: true })).toBeVisible();
      await page.getByRole("button", { name: journey.withdraw }).click();
      await expect(
        page.getByText(journey.withdrawn, { exact: true }).filter({ visible: true }),
      ).toBeVisible();
      await expect.poll(() => focused(page)).toContain(journey.withdrawn);
      await expect(page.getByRole("button", { name: journey.withdraw })).toBeHidden();

      // My bookings: nothing coming up; the request is under Past.
      await page.goto("/profile");
      await page.getByRole("button", { name: journey.myBookings }).click();
      await expect(
        page.getByText(journey.noneUpcoming, { exact: true }).filter({ visible: true }),
      ).toBeVisible();
      await page.getByRole("radio", { name: journey.past }).click();
      await expect(page).toHaveURL(/\/bookings\?when=past$/);
      const card = page.getByRole("button", {
        name: new RegExp(`, ${journey.withdrawnTag}, Sigga, `),
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
