import { expect, test, type Page } from "@playwright/test";
import type { Locale } from "@shareride/i18n";
import { english, icelandic, signUp, type Texts } from "./support/account";
import { addPhotoBeforePublishing, englishPhoto, type PhotoTexts } from "./support/photo";
import { chooseTime, englishWheel, timeField, tomorrow, type WheelTexts } from "./support/trips";

/**
 * Text in sight. Find stays in the page under the screens opened on top,
 * and its rides leaving soon can show the same prices.
 */
function shownText(page: Page, text: string) {
  return page.getByText(text, { exact: true }).filter({ visible: true });
}

// Spec 3's journey on the web build, against the test API and its sample
// meeting points: a first-time driver posts Reykjavík to Akureyri, adds a
// photo and a car and confirms the licence from the check step, and
// publishes. Offer,
// the folded stop times and step 5 follow spec 16, 3.6.

interface Journey {
  readonly locale: Locale;
  readonly account: Texts;
  readonly offerRide: string;
  readonly routeTitle: string;
  readonly from: string;
  readonly to: string;
  /** The names of the fields that drop down under From and To. */
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly start: RegExp;
  readonly end: RegExp;
  readonly onTheWay: string;
  readonly routeMap: RegExp;
  readonly toTimes: string;
  readonly timeTitle: string;
  readonly nextMonth: string;
  readonly departure: string;
  readonly arrival: string;
  /** The folded time at the end, worked out from the departure. */
  readonly arrivalLine: RegExp;
  readonly changeStops: string;
  readonly wheel: WheelTexts;
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
  readonly missing: string;
  readonly photo: PhotoTexts;
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
  readonly shareRide: string;
  readonly copyText: string;
  readonly textCopied: string;
  readonly post: RegExp;
  readonly addEmailPrompt: string;
  readonly seeTrips: string;
  readonly publishedTrips: string;
}

const inEnglish: Journey = {
  locale: "en",
  account: english,
  offerRide: "Offer a ride",
  routeTitle: "Where are you driving?",
  from: "From: Choose a meeting point",
  to: "To: Choose a meeting point",
  fromLabel: "From",
  toLabel: "To",
  start: /^BSÍ bus terminal,/,
  end: /^Hof bus stop, Akureyri,/,
  onTheWay: "N1 Borgarnes",
  routeMap: /^Your route on a map of Iceland: BSÍ bus terminal → Hof bus stop, Akureyri\.$/,
  toTimes: "Choose date and time",
  timeTitle: "When are you leaving?",
  nextMonth: "Next month",
  departure: "Leaving BSÍ bus terminal at",
  arrival: "Time at Hof bus stop, Akureyri",
  arrivalLine: /^1[34]:\d[05]\s+Hof bus stop, Akureyri$/u,
  changeStops: "Change the times at the stops",
  wheel: englishWheel,
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
  missing: "Three things before you publish",
  photo: englishPhoto,
  addCar: "Add a car",
  make: "Make",
  model: "Model",
  white: "White",
  saveCar: "Save car",
  confirmLicence: "Confirm your licence",
  declaration: "I declare that I hold a valid driving licence for the cars I drive on PuffinRide",
  confirm: "Confirm",
  publish: "Publish trip",
  published: "Your trip is published",
  shareRide: "Share this ride",
  copyText: "Copy text",
  textCopied: "Text copied. Paste it into your post.",
  post: /^Offering a ride: .+\n.+\n(Stops on the way: .+\n)?(Book|Ask for) a seat on PuffinRide: http:\/\/localhost:\d+\/trips\/[0-9a-f-]+\?from=0&to=\d+$/u,
  addEmailPrompt: "Add an email so we can reach you if your trip changes.",
  seeTrips: "See my trips",
  publishedTrips: "Published",
};

const inIcelandic: Journey = {
  locale: "is",
  account: icelandic,
  offerRide: "Bjóða far",
  routeTitle: "Hvert ertu að keyra?",
  from: "Frá: Veldu mótsstað",
  to: "Til: Veldu mótsstað",
  fromLabel: "Frá",
  toLabel: "Til",
  start: /^BSÍ,/,
  end: /^Hof, Akureyri,/,
  onTheWay: "N1 Borgarnesi",
  routeMap: /^Leiðin þín á korti af Íslandi: BSÍ → Hof, Akureyri\.$/,
  toTimes: "Velja dag og tíma",
  timeTitle: "Hvenær leggur þú af stað?",
  nextMonth: "Næsti mánuður",
  departure: "Brottför frá BSÍ kl.",
  arrival: "Tími á Hof, Akureyri",
  arrivalLine: /^1[34]:\d[05]\s+Hof, Akureyri$/u,
  changeStops: "Breyta tímum á viðkomustöðum",
  wheel: { hour: "Klukkustund", minutes: "Mínútur", done: "Lokið" },
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
  missing: "Þrennt áður en þú birtir",
  photo: {
    reviewTitle: "Yfirfara og birta",
    addPhoto: "Bæta við mynd",
    photoTitle: "Prófílmyndin þín",
  },
  addCar: "Bæta við bíl",
  make: "Tegund",
  model: "Gerð",
  white: "Hvítur",
  saveCar: "Vista bíl",
  confirmLicence: "Staðfesta ökuskírteini",
  declaration:
    "Ég lýsi því yfir að ég sé með gilt ökuskírteini fyrir þá bíla sem ég ek á PuffinRide",
  confirm: "Staðfesta",
  publish: "Birta ferð",
  published: "Ferðin þín er birt",
  shareRide: "Deildu þessari ferð",
  copyText: "Afrita texta",
  textCopied: "Textinn var afritaður. Límdu hann í færsluna.",
  post: /^Býð far: .+\n.+\n(Mótsstaðir á leiðinni: .+\n)?(Bókaðu|Óskaðu eftir) sæti á PuffinRide: http:\/\/localhost:\d+\/trips\/[0-9a-f-]+\?from=0&to=\d+$/u,
  addEmailPrompt: "Bættu við netfangi svo við getum látið þig vita ef ferðin breytist.",
  seeTrips: "Sjá ferðirnar mínar",
  publishedTrips: "Birtar",
};

async function choose(page: Page, field: string, label: string, typed: string, card: RegExp) {
  await page.getByRole("button", { name: field }).click();
  await page.getByLabel(label, { exact: true }).fill(typed);
  await page.getByRole("button", { name: card }).click();
}

async function postTrip(page: Page, journey: Journey) {
  await signUp(page, journey.account, "Anna");
  // Offer opens straight on step 1 (spec 16, 3.6).
  await page.getByRole("button", { name: journey.offerRide }).click();

  // 1. The route, with the meeting points on the way.
  await expect(page.getByRole("heading", { name: journey.routeTitle })).toBeVisible();
  await choose(page, journey.from, journey.fromLabel, "BSÍ", journey.start);
  await choose(page, journey.to, journey.toLabel, "Hof", journey.end);
  await expect(page.getByRole("switch", { name: journey.onTheWay })).toBeChecked();
  await expect(page.getByRole("img", { name: journey.routeMap })).toBeVisible();
  await page.getByRole("button", { name: journey.toTimes }).click();

  // 2. Tomorrow at nine; the other times follow, folded until Change.
  await expect(page.getByRole("heading", { name: journey.timeTitle })).toBeVisible();
  const day = tomorrow(journey.locale);
  if (day.nextMonth) await page.getByRole("button", { name: journey.nextMonth }).click();
  await page.getByRole("radio", { name: day.name }).click();
  await chooseTime(page, journey.departure, "09:00", journey.wheel);
  await expect(page.getByText(journey.arrivalLine)).toBeVisible();
  await expect(timeField(page, journey.arrival)).toBeHidden();
  await page.getByRole("button", { name: journey.changeStops }).click();
  await expect(timeField(page, journey.arrival)).toHaveAccessibleName(/ 1[34]:\d[05]$/u);
  // The keyboard turns a wheel too, and Escape closes it back onto the field.
  await timeField(page, journey.departure).click();
  const minutes = page.getByRole("spinbutton", { name: journey.wheel.minutes });
  await minutes.press("ArrowUp");
  await expect(minutes).toHaveAttribute("aria-valuetext", "05");
  await minutes.press("ArrowDown");
  await expect(minutes).toHaveAttribute("aria-valuetext", "00");
  await page.keyboard.press("Escape");
  await expect(timeField(page, journey.departure)).toBeFocused();
  await expect(timeField(page, journey.departure)).toHaveAccessibleName(/ 09:00$/u);
  await expect(minutes).toBeHidden();
  await page.getByRole("button", { name: journey.toSeats }).click();

  // 3. Seats and preferences, before the price, which depends on them.
  await page.getByRole("radio", { name: journey.pets }).click();
  await expect(page.getByRole("radio", { name: journey.pets })).toBeChecked();
  await page.getByRole("button", { name: journey.toPrice }).click();

  // 4. The suggested price for the whole route, then 80%.
  await expect(page.getByRole("heading", { name: journey.priceTitle })).toBeVisible();
  await expect(shownText(page, journey.fullPrice)).toBeVisible();
  await expect(page.getByText(journey.suggested)).toBeVisible();
  // One step down with minus, then a tap on the track at 80%.
  await page.getByRole("button", { name: journey.lower }).click();
  await expect(page.getByText("90%", { exact: true })).toBeVisible();
  await page.getByTestId("price-step-80").click();
  await expect(shownText(page, journey.lowerPrice)).toBeVisible();
  await expect(page.getByText("80%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: journey.toReview }).click();

  // 5. Check: the photo, car and licence come first and are done from
  // here; Publish waits for them.
  await expect(page.getByRole("heading", { name: journey.reviewTitle })).toBeVisible();
  await expect(page.getByRole("heading", { name: journey.missing })).toBeVisible();
  await expect(page.getByRole("button", { name: journey.publish })).toBeDisabled();
  await addPhotoBeforePublishing(page, journey.photo);
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
  await expect(shownText(page, journey.reviewPrice)).toBeVisible();
  await expect(page.getByRole("heading", { name: journey.missing })).toBeHidden();

  await page.getByRole("button", { name: journey.publish }).click();
  await expect(page.getByRole("heading", { name: journey.published })).toBeVisible();
  // Share this ride (spec 28, 3.2): the post's text, in the app's language, copied.
  await expect(page.getByRole("heading", { name: journey.shareRide })).toBeVisible();
  await page.getByRole("button", { name: journey.copyText }).click();
  await expect(page.getByText(journey.textCopied)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(journey.post);
  // No push on the web, but the account's email reaches them: no prompt
  // for one (spec 7, 3.6.2; spec 26).
  await expect(page.getByText(journey.addEmailPrompt)).toHaveCount(0);
  await page.getByRole("button", { name: journey.seeTrips }).click();
  await expect(page.getByRole("heading", { name: journey.publishedTrips })).toBeVisible();
}

test.describe("posting a trip on the web, in English", () => {
  test.use({ locale: "en-GB", permissions: ["clipboard-read", "clipboard-write"] });

  test("a first-time driver posts Reykjavík to Akureyri", async ({ page }) => {
    await postTrip(page, inEnglish);
  });
});

test.describe("posting a trip on the web, in Icelandic", () => {
  test.use({ locale: "is-IS", permissions: ["clipboard-read", "clipboard-write"] });

  test("a first-time driver posts Reykjavík to Akureyri", async ({ page }) => {
    await postTrip(page, inIcelandic);
  });
});
