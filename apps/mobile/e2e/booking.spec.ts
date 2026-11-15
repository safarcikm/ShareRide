import { expect, test } from "@playwright/test";
import { english, enterCode, finishSignUp, icelandic, signUp, type Texts } from "./support/account";
import { newPhoneNumber } from "./support/sms";
import { focused, openTrip, type TripSearch } from "./support/trips";

// Spec 5's booking on the web build, against the sample trips the e2e API
// seeds: Jón drives N1 Selfoss → N1 Hella → N1 Hvolsvöllur → N1 Vík in two
// days, with instant booking and 2 seats. Paying uses the test provider's
// sheet, where no money moves. Each language books its own segment, once at
// phone size and once at desktop size, so the 2 seats are enough; the
// journey that signs up mid-booking takes the segment between and stops
// before booking. Screens left behind stay in the page, hidden, so text
// checks look only at what shows.

interface Journey extends TripSearch {
  readonly locale: string;
  readonly account: Texts;
  readonly name: string;
  readonly part: string;
  readonly book: string;
  readonly title: string;
  readonly payNow: RegExp;
  readonly payBy: RegExp;
  readonly waiting: string;
  readonly pay: RegExp;
  readonly sheet: string;
  readonly fail: string;
  readonly failed: string;
  readonly confirmed: string;
  readonly confirmedTag: string;
  readonly whereToStand: string;
  readonly openInMaps: string;
  readonly yours: string;
  readonly see: string;
}

const inEnglish: Journey = {
  locale: "en-GB",
  account: english,
  name: "Gunna",
  from: "selfo",
  fromPoint: /^N1 Selfoss,/,
  to: "hella",
  toPoint: /^N1 Hella,/,
  fromField: /^From: /,
  toField: /^To: /,
  fromLabel: "From",
  toLabel: "To",
  search: "Search",
  result: /^Leaves N1 Selfoss at \d\d:\d\d, .*Jón, New driver/,
  part: "N1 Selfoss → N1 Hella",
  book: "Book",
  title: "Book this ride",
  payNow: /^Pay [\d,]+ ISK to confirm your seat$/,
  payBy: /^Pay by \d\d:\d\d( tomorrow)? to keep your seat$/,
  waiting: "Waiting for payment",
  pay: /^Pay [\d,]+ ISK$/,
  sheet: "Test payment: no money moves",
  fail: "Make the payment fail",
  failed: "The payment didn't go through. Try again or use another card.",
  confirmed: "Your seat is confirmed",
  confirmedTag: "Confirmed",
  whereToStand: "Where to stand",
  openInMaps: "Open in maps",
  yours: "You have a booking on this trip.",
  see: "See your booking",
};

const inIcelandic: Journey = {
  locale: "is-IS",
  account: icelandic,
  name: "Dísa",
  from: "hvols",
  fromPoint: /^N1 Hvolsvelli,/,
  to: "vík",
  toPoint: /^N1 Vík,/,
  fromField: /^Frá: /,
  toField: /^Til: /,
  fromLabel: "Frá",
  toLabel: "Til",
  search: "Leita",
  result: /^N1 Hvolsvelli, brottför kl\. \d\d:\d\d, .*Jón, Nýr ökumaður/,
  part: "N1 Hvolsvelli → N1 Vík",
  book: "Bóka",
  title: "Bóka þessa ferð",
  payNow: /^Greiddu [\d.]+ kr\. til að staðfesta sætið$/,
  payBy: /^Greiddu fyrir kl\. \d\d:\d\d( á morgun)? til að halda sætinu$/,
  waiting: "Bíður greiðslu",
  pay: /^Greiða [\d.]+ kr\.$/,
  sheet: "Prufugreiðsla: engir peningar færast",
  fail: "Láta greiðsluna mistakast",
  failed: "Greiðslan gekk ekki í gegn. Reyndu aftur eða notaðu annað kort.",
  confirmed: "Sætið þitt er staðfest",
  confirmedTag: "Staðfest",
  whereToStand: "Hvar á að bíða",
  openInMaps: "Opna í kortaforriti",
  yours: "Þú átt bókun í þessari ferð.",
  see: "Sjá bókunina",
};

const journeys = [inEnglish, inIcelandic];

for (const journey of journeys) {
  test.describe(`booking (${journey.locale})`, () => {
    test.use({ locale: journey.locale });

    test("books an instant ride, and pays after a failed payment", async ({ page }) => {
      await signUp(page, journey.account, journey.name);
      const id = await openTrip(page, journey);
      const trip = page.url();
      await page.getByRole("button", { name: journey.book, exact: true }).click();

      await expect(page).toHaveURL(new RegExp(`/trips/${id}/book\\?from=\\d&to=\\d&seats=1$`));
      await expect(page.getByRole("heading", { name: journey.title })).toBeVisible();
      await expect(
        page.getByText(journey.part, { exact: true }).filter({ visible: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: journey.book, exact: true }).click();

      // The booking is accepted at once and waits for payment (rule M1).
      await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]+$/);
      await expect(page.getByText(journey.payNow).filter({ visible: true })).toBeVisible();
      await expect(page.getByText(journey.payBy).filter({ visible: true })).toBeVisible();
      await expect(
        page.getByText(journey.waiting, { exact: true }).filter({ visible: true }),
      ).toBeVisible();

      // A failed payment leaves the seat waiting, and paying can start again.
      // Focus follows each step, since the button pressed goes away.
      await page.getByRole("button", { name: journey.pay }).click();
      await expect(page.getByRole("heading", { name: journey.sheet })).toBeVisible();
      await expect.poll(() => focused(page)).toContain(journey.sheet);
      await page.getByRole("button", { name: journey.fail }).click();
      await expect(page.getByText(journey.failed).filter({ visible: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: journey.sheet })).toBeHidden();
      await expect.poll(() => focused(page)).toContain(journey.failed);

      await page.getByRole("button", { name: journey.pay }).click();
      await expect(page.getByRole("heading", { name: journey.sheet })).toBeVisible();
      await page.getByRole("button", { name: journey.pay }).click();
      await expect(
        page.getByText(journey.confirmed, { exact: true }).filter({ visible: true }),
      ).toBeVisible();
      await expect.poll(() => focused(page)).toContain(journey.confirmed);
      await expect(
        page.getByText(journey.confirmedTag, { exact: true }).filter({ visible: true }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: journey.whereToStand })).toBeVisible();
      await expect(page.getByRole("button", { name: journey.openInMaps })).toBeVisible();
      await expect(page.getByText(journey.payNow).filter({ visible: true })).toBeHidden();
      const booking = page.url();

      // The confirmed seat is kept, and the trip page now leads to it.
      await page.reload();
      await expect(
        page.getByText(journey.confirmed, { exact: true }).filter({ visible: true }),
      ).toBeVisible();
      await page.goto(trip);
      await expect(page.getByText(journey.yours).filter({ visible: true })).toBeVisible();
      await page.getByRole("button", { name: journey.see }).click();
      await expect(page).toHaveURL(booking);
    });
  });
}

test.describe("booking before having an account", () => {
  test.use({ locale: "is-IS" });

  test("signs up on the way and comes back to the same part and seats", async ({ page }) => {
    const journey: Journey = {
      ...inIcelandic,
      from: "hell",
      fromPoint: /^N1 Hellu,/,
      to: "hvols",
      toPoint: /^N1 Hvolsvelli,/,
      result: /^N1 Hellu, brottför kl\. \d\d:\d\d, .*Jón, Nýr ökumaður/,
    };
    const id = await openTrip(page, journey);
    await expect(page).toHaveURL(/\?from=1&to=2$/);
    await page.getByRole("button", { name: "Einu sæti fleira" }).click();
    await expect(page).toHaveURL(/\?from=1&to=2&seats=2$/);
    await expect(
      page.getByText("Þú skráir þig fyrst inn eða stofnar aðgang.").filter({ visible: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: journey.book, exact: true }).click();

    await enterCode(page, icelandic, newPhoneNumber());
    await finishSignUp(page, icelandic, "Bjössi");

    await expect(page).toHaveURL(new RegExp(`/trips/${id}/book\\?from=1&to=2&seats=2$`));
    await expect(page.getByRole("heading", { name: journey.title })).toBeVisible();
    await expect(
      page.getByText("N1 Hellu → N1 Hvolsvelli", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("2 sæti", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
  });
});
