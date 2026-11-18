import { expect, test } from "@playwright/test";
import { english, enterCode, finishSignUp, icelandic, signUp, type Texts } from "./support/account";
import { newPhoneNumber } from "./support/sms";
import { focused, openTrip, type TripSearch } from "./support/trips";

/** A meeting point's ID in an address. */
const uuid = "[0-9a-f-]{36}";

// Spec 5's booking, with spec 16's Check and pay and You're booked, on the
// web build, against the sample trips the e2e API seeds: Jón drives N1
// Selfoss → N1 Hella → N1 Hvolsvöllur → N1 Vík in two days, with instant
// booking and 2 seats. Paying uses the test provider's sheet, where no money
// moves. Each language books its own segment, once at phone size and once
// at desktop size, so the 2 seats are enough; the journey that signs up
// mid-booking takes the segment between and stops before booking. Screens
// left behind stay in the page, hidden, so text checks look only at what
// shows.

interface Journey extends TripSearch {
  readonly locale: string;
  readonly account: Texts;
  readonly name: string;
  readonly getIn: string;
  readonly book: string;
  readonly title: string;
  readonly driver: RegExp;
  readonly confirmedOnPay: string;
  readonly pay: RegExp;
  readonly sheet: string;
  readonly fail: string;
  readonly failed: string;
  readonly held: RegExp;
  readonly booked: string;
  readonly next: string;
  readonly confirmed: string;
  readonly whereToStand: string;
  readonly openInMaps: string;
  readonly yours: string;
  readonly see: string;
  readonly weather: string;
  readonly share: string;
  readonly addEmailPrompt: string;
  readonly notNow: string;
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
  getIn: "N1 Selfoss",
  book: "Book",
  title: "Check and pay",
  driver: /^Driver: Jón · /,
  confirmedOnPay: "Your seat is confirmed as soon as you pay.",
  pay: /^Pay [\d,]+ ISK$/,
  sheet: "Test payment: no money moves",
  fail: "Make the payment fail",
  failed: "The payment didn't go through. Try again or use another card.",
  held: /^Not paid yet\. Your seat is held until \d\d:\d\d( tomorrow)?\.$/,
  booked: "You're booked!",
  next: "What happens next",
  confirmed: "Your seat is confirmed",
  whereToStand: "Where to stand",
  openInMaps: "Open in maps",
  yours: "You have a booking on this trip.",
  see: "See your booking",
  weather: "Weather (vedur.is)",
  share: "Share trip details",
  addEmailPrompt: "Add an email so we can reach you if your trip changes.",
  notNow: "Not now",
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
  getIn: "N1 Hvolsvelli",
  book: "Bóka",
  title: "Yfirfara og greiða",
  driver: /^Ökumaður: Jón · /,
  confirmedOnPay: "Sætið þitt er staðfest um leið og þú greiðir.",
  pay: /^Greiða [\d.]+ kr\.$/,
  sheet: "Prufugreiðsla: engir peningar færast",
  fail: "Láta greiðsluna mistakast",
  failed: "Greiðslan gekk ekki í gegn. Reyndu aftur eða notaðu annað kort.",
  held: /^Ekki greitt enn\. Sætið er frátekið fyrir þig til kl\. \d\d:\d\d( á morgun)?\.$/,
  booked: "Sætið er þitt!",
  next: "Hvað gerist næst",
  confirmed: "Sætið þitt er staðfest",
  whereToStand: "Hvar á að bíða",
  openInMaps: "Opna í kortaforriti",
  yours: "Þú átt bókun í þessari ferð.",
  see: "Sjá bókunina",
  weather: "Veður (vedur.is)",
  share: "Deila upplýsingum um ferðina",
  addEmailPrompt: "Bættu við netfangi svo við getum látið þig vita ef ferðin breytist.",
  notNow: "Ekki núna",
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

      // Check and pay: the ride as booked, and one button that pays (spec 16, 3.7).
      // With the meeting points shown, so a stop added meanwhile is noticed (spec 6, 3.2).
      await expect(page).toHaveURL(
        new RegExp(
          `/trips/${id}/book\\?from=\\d&to=\\d&seats=1&fromPoint=${uuid}&toPoint=${uuid}$`,
        ),
      );
      await expect(page.getByRole("heading", { name: journey.title })).toBeVisible();
      await expect(
        page.getByText(journey.getIn, { exact: true }).filter({ visible: true }),
      ).toBeVisible();
      await expect(page.getByText(journey.driver).filter({ visible: true })).toBeVisible();
      await expect(
        page.getByText(journey.confirmedOnPay, { exact: true }).filter({ visible: true }),
      ).toBeVisible();

      // Pay books the seat and opens the payment at once (rule M1). A failed
      // payment leaves the seat held, and paying can start again. Focus
      // follows each step, since the button pressed goes away.
      await page.getByRole("button", { name: journey.pay }).click();
      await expect(page.getByRole("heading", { name: journey.sheet })).toBeVisible();
      await expect.poll(() => focused(page)).toContain(journey.sheet);
      await page.getByRole("button", { name: journey.fail }).click();
      await expect(page.getByText(journey.failed).filter({ visible: true })).toBeVisible();
      await expect(page.getByText(journey.held).filter({ visible: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: journey.sheet })).toBeHidden();
      await expect.poll(() => focused(page)).toContain(journey.failed);

      await page.getByRole("button", { name: journey.pay }).click();
      await expect(page.getByRole("heading", { name: journey.sheet })).toBeVisible();
      await page.getByRole("button", { name: journey.pay }).click();

      // You're booked, with what happens next and where to stand.
      await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]+\/booked$/);
      await expect(page.getByRole("heading", { name: journey.booked })).toBeVisible();
      await expect.poll(() => focused(page)).toContain(journey.booked);
      await expect(page.getByRole("heading", { name: journey.next })).toBeVisible();
      await expect(page.getByRole("heading", { name: journey.whereToStand })).toBeVisible();
      await expect(page.getByRole("button", { name: journey.openInMaps })).toBeVisible();
      // On the web nothing can reach them yet, so they are asked to add an
      // email (spec 7, 3.6.2); "Not now" closes it.
      await expect(page.getByText(journey.addEmailPrompt)).toBeVisible();
      await page.getByRole("button", { name: journey.notNow }).click();
      await expect(page.getByText(journey.addEmailPrompt)).toBeHidden();
      const booking = page.url().replace(/\/booked$/, "");

      // The confirmed seat is kept, and the trip page now leads to it.
      await page.reload();
      await expect(page.getByRole("heading", { name: journey.booked })).toBeVisible();
      await page.goto(trip);
      await expect(page.getByText(journey.yours).filter({ visible: true })).toBeVisible();
      await page.getByRole("button", { name: journey.see }).click();
      await expect(page).toHaveURL(booking);
      await expect(
        page.getByText(journey.confirmed, { exact: true }).filter({ visible: true }),
      ).toBeVisible();

      // Safety on the confirmed booking (spec 9, 3.3): the links for a trip
      // out of the capital area, and sharing its details. No 112 button:
      // people dial it themselves.
      await expect(page.getByRole("link", { name: journey.weather })).toBeVisible();
      await expect(page.getByRole("button", { name: journey.share })).toBeVisible();
      await expect(page.getByRole("button", { name: /112/ })).toHaveCount(0);
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

    // Each step shows the ride kept (spec 16, 3.5).
    await expect(
      page.getByText("Þú ert að bóka", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(page.getByText("Skref 1 af 3").filter({ visible: true })).toBeVisible();
    await enterCode(page, icelandic, newPhoneNumber());
    await finishSignUp(page, icelandic, "Bjössi", "Stofna aðgang og bóka");

    await expect(page).toHaveURL(
      new RegExp(`/trips/${id}/book\\?from=1&to=2&seats=2&fromPoint=${uuid}&toPoint=${uuid}$`),
    );
    await expect(page.getByRole("heading", { name: journey.title })).toBeVisible();
    await expect(
      page.getByText("N1 Hellu", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(page.getByText(/^2 sæti × [\d.]+ kr\.$/).filter({ visible: true })).toBeVisible();
  });
});
