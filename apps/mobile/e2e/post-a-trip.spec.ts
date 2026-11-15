import { expect, test, type Page } from "@playwright/test";
import { formatDay, type Locale } from "@shareride/i18n";
import { english, icelandic, signUp, type Texts } from "./support/account";

// Spec 3's journey on the web build, against the test API and its sample
// meeting points: a first-time driver posts Reykjavík to Akureyri, adds a
// car and confirms the licence from the check step, and publishes.

interface Journey {
  readonly locale: Locale;
  readonly account: Texts;
  readonly offerRide: string;
  readonly postTrip: string;
  readonly routeTitle: string;
  readonly from: string;
  readonly to: string;
  readonly search: string;
  readonly start: RegExp;
  readonly end: RegExp;
  readonly onTheWay: string;
  readonly routeMap: RegExp;
  readonly toTimes: string;
  readonly timeTitle: string;
  readonly nextMonth: string;
  readonly departure: string;
  readonly arrival: string;
  readonly toPrice: string;
  readonly priceTitle: string;
  readonly suggested: string;
  readonly fullPrice: string;
  readonly lower: string;
  readonly lowerPrice: string;
  readonly reviewPrice: string;
  readonly toSeats: string;
  readonly pets: string;
  readonly toReview: string;
  readonly reviewTitle: string;
  readonly addCar: string;
  readonly make: string;
  readonly model: string;
  readonly white: string;
  readonly saveCar: string;
  readonly confirmLicence: string;
  readonly declaration: string;
  readonly confirm: string;
  readonly publish: string;
  readonly published: string;
  readonly seeTrips: string;
  readonly publishedTrips: string;
}

const inEnglish: Journey = {
  locale: "en",
  account: english,
  offerRide: "Offer a ride",
  postTrip: "Post a trip",
  routeTitle: "Where are you driving?",
  from: "From: Choose a meeting point",
  to: "To: Choose a meeting point",
  search: "Town or meeting point",
  start: /^BSÍ bus terminal,/,
  end: /^Hof bus stop, Akureyri,/,
  onTheWay: "N1 Borgarnes",
  routeMap: /^Your route on a map of Iceland: BSÍ bus terminal → Hof bus stop, Akureyri\.$/,
  toTimes: "Choose date and time",
  timeTitle: "When are you leaving?",
  nextMonth: "Next month",
  departure: "Leaving BSÍ bus terminal at",
  arrival: "Time at Hof bus stop, Akureyri",
  toPrice: "Set your price",
  priceTitle: "Set your price",
  suggested: "Suggested price",
  fullPrice: "5,600 ISK",
  lower: "Lower the price",
  lowerPrice: "4,600 ISK",
  reviewPrice: "80% · the whole route 4,600 ISK",
  toSeats: "Choose seats",
  pets: "Pets welcome",
  toReview: "Review your trip",
  reviewTitle: "Check and publish",
  addCar: "Add a car",
  make: "Make",
  model: "Model",
  white: "White",
  saveCar: "Save car",
  confirmLicence: "Confirm your licence",
  declaration: "I declare that I hold a valid driving licence for the cars I drive on ShareRide",
  confirm: "Confirm",
  publish: "Publish trip",
  published: "Your trip is published",
  seeTrips: "See my trips",
  publishedTrips: "Published",
};

const inIcelandic: Journey = {
  locale: "is",
  account: icelandic,
  offerRide: "Bjóða far",
  postTrip: "Setja inn ferð",
  routeTitle: "Hvert ertu að keyra?",
  from: "Frá: Veldu mótsstað",
  to: "Til: Veldu mótsstað",
  search: "Bær eða mótsstaður",
  start: /^BSÍ,/,
  end: /^Hof, Akureyri,/,
  onTheWay: "N1 Borgarnesi",
  routeMap: /^Leiðin þín á korti af Íslandi: BSÍ → Hof, Akureyri\.$/,
  toTimes: "Velja dag og tíma",
  timeTitle: "Hvenær leggur þú af stað?",
  nextMonth: "Næsti mánuður",
  departure: "Brottför frá BSÍ kl.",
  arrival: "Tími á Hof, Akureyri",
  toPrice: "Ákveða verð",
  priceTitle: "Ákveddu verðið",
  suggested: "Ráðlagt verð",
  fullPrice: "5.600 kr.",
  lower: "Lækka verðið",
  lowerPrice: "4.600 kr.",
  reviewPrice: "80% · öll leiðin 4.600 kr.",
  toSeats: "Velja sæti",
  pets: "Gæludýr velkomin",
  toReview: "Fara yfir ferðina",
  reviewTitle: "Yfirfara og birta",
  addCar: "Bæta við bíl",
  make: "Tegund",
  model: "Gerð",
  white: "Hvítur",
  saveCar: "Vista bíl",
  confirmLicence: "Staðfesta ökuskírteini",
  declaration:
    "Ég lýsi því yfir að ég sé með gilt ökuskírteini fyrir þá bíla sem ég ek á ShareRide",
  confirm: "Staðfesta",
  publish: "Birta ferð",
  published: "Ferðin þín er birt",
  seeTrips: "Sjá ferðirnar mínar",
  publishedTrips: "Birtar",
};

/** Tomorrow in Iceland, as the calendar names it, and whether it is next month. */
function tomorrow(locale: Locale) {
  const now = new Date();
  const then = new Date(now.getTime() + 24 * 3600 * 1000);
  const month = (moment: Date) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "Atlantic/Reykjavik", month: "numeric" }).format(
      moment,
    );
  return { name: formatDay(then, locale), nextMonth: month(then) !== month(now) };
}

async function choose(page: Page, journey: Journey, field: string, typed: string, card: RegExp) {
  await page.getByRole("button", { name: field }).click();
  await page.getByLabel(journey.search).fill(typed);
  await page.getByRole("button", { name: card }).click();
}

async function postTrip(page: Page, journey: Journey) {
  await signUp(page, journey.account, "Anna");
  await page.getByRole("button", { name: journey.offerRide }).click();
  await page.getByRole("button", { name: journey.postTrip }).click();

  // 1. The route, with the meeting points on the way.
  await expect(page.getByRole("heading", { name: journey.routeTitle })).toBeVisible();
  await choose(page, journey, journey.from, "BSÍ", journey.start);
  await choose(page, journey, journey.to, "Hof", journey.end);
  await expect(page.getByRole("switch", { name: journey.onTheWay })).toBeChecked();
  await expect(page.getByRole("img", { name: journey.routeMap })).toBeVisible();
  await page.getByRole("button", { name: journey.toTimes }).click();

  // 2. Tomorrow at nine; the other times follow.
  await expect(page.getByRole("heading", { name: journey.timeTitle })).toBeVisible();
  const day = tomorrow(journey.locale);
  if (day.nextMonth) await page.getByRole("button", { name: journey.nextMonth }).click();
  await page.getByRole("radio", { name: day.name }).click();
  await page.getByLabel(journey.departure).fill("09:00");
  await expect(page.getByLabel(journey.arrival)).toHaveValue(/^1[34]:\d\d$/);
  await page.getByRole("button", { name: journey.toPrice }).click();

  // 3. The suggested price for the whole route, then 80%.
  await expect(page.getByRole("heading", { name: journey.priceTitle })).toBeVisible();
  await expect(page.getByText(journey.fullPrice, { exact: true })).toBeVisible();
  await expect(page.getByText(journey.suggested)).toBeVisible();
  // One step down with minus, then a tap on the track at 80%.
  await page.getByRole("button", { name: journey.lower }).click();
  await expect(page.getByText("90%", { exact: true })).toBeVisible();
  await page.getByTestId("price-step-80").click();
  await expect(page.getByText(journey.lowerPrice, { exact: true })).toBeVisible();
  await expect(page.getByText("80%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: journey.toSeats }).click();

  // 4. Seats and preferences.
  await page.getByRole("radio", { name: journey.pets }).click();
  await expect(page.getByRole("radio", { name: journey.pets })).toBeChecked();
  await page.getByRole("button", { name: journey.toReview }).click();

  // 5. Check: the car and licence are done from here, then publish.
  await expect(page.getByRole("heading", { name: journey.reviewTitle })).toBeVisible();
  await page.getByRole("button", { name: journey.addCar }).click();
  await page.getByLabel(journey.make).fill("Toyota");
  await page.getByLabel(journey.model).fill("Yaris");
  await page.getByRole("radio", { name: journey.white }).click();
  await page.getByRole("button", { name: journey.saveCar }).click();
  await expect(page.getByRole("heading", { name: journey.reviewTitle })).toBeVisible();
  await page.getByRole("button", { name: journey.confirmLicence }).click();
  await page.getByRole("checkbox", { name: journey.declaration }).click();
  await page.getByRole("button", { name: journey.confirm, exact: true }).click();
  await expect(page.getByRole("heading", { name: journey.reviewTitle })).toBeVisible();
  await expect(page.getByText(journey.reviewPrice, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: journey.publish }).click();
  await expect(page.getByRole("heading", { name: journey.published })).toBeVisible();
  await page.getByRole("button", { name: journey.seeTrips }).click();
  await expect(page.getByRole("heading", { name: journey.publishedTrips })).toBeVisible();
}

test.describe("posting a trip on the web, in English", () => {
  test.use({ locale: "en-GB" });

  test("a first-time driver posts Reykjavík to Akureyri", async ({ page }) => {
    await postTrip(page, inEnglish);
  });
});

test.describe("posting a trip on the web, in Icelandic", () => {
  test.use({ locale: "is-IS" });

  test("a first-time driver posts Reykjavík to Akureyri", async ({ page }) => {
    await postTrip(page, inIcelandic);
  });
});
