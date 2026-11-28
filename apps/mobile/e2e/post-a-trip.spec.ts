import { expect, test, type Page } from "@playwright/test";
import type { Locale } from "@shareride/i18n";
import { english, icelandic, signUp, type Texts } from "./support/account";
import { addPhotoBeforePublishing, englishPhoto, type PhotoTexts } from "./support/photo";
import {
  chooseTime,
  dragPriceTo,
  englishWheel,
  swipeUpFromPriceTrack,
  timeField,
  tomorrow,
  type WheelTexts,
} from "./support/trips";

/**
 * Text in sight. Find stays in the page under the screens opened on top,
 * and its rides leaving soon can show the same prices.
 */
function shownText(page: Page, text: string) {
  return page.getByText(text, { exact: true }).filter(shown);
}

/** Screens left behind stay in the page: only what is on show counts. */
const shown = { visible: true } as const;

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
  /** What a screen reader hears of the road on step 1 and on step 5. */
  readonly roadRoute: string;
  readonly roadCheck: string;
  /** Step 5's line over the ride as others will see it. */
  readonly reviewLine: string;
  /** The row of step 5 that opens the route. */
  readonly routeRow: RegExp;
  readonly toSeats: string;
  readonly pets: string;
  readonly toReview: string;
  readonly reviewTitle: string;
  readonly missing: string;
  /** The yellow card once the photo is added: what is done and what is left. */
  readonly missingTwo: string;
  readonly leftTwo: string;
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
  readonly downloadPicture: string;
  readonly addEmailPrompt: string;
  readonly seeTrips: string;
  /** My rides' title, and what the name of a ride I drive starts with there. */
  readonly myRides: string;
  readonly myRide: RegExp;
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
  reviewPrice: "4,600 ISK the whole way",
  roadRoute: "Step 1 of 5: Route",
  roadCheck: "Step 5 of 5: Check",
  reviewLine: "This is how people will see your ride.",
  routeRow:
    /^Route, BSÍ bus terminal to Hof bus stop, Akureyri, with \d+ stops? on the way, Change$/,
  toSeats: "Choose seats",
  pets: "Pets welcome",
  toReview: "Check your ride",
  reviewTitle: "Check and publish",
  missing: "Three things before you publish",
  missingTwo: "Two things before you publish",
  leftTwo: "Your photo is done. Your car and your driving licence are left.",
  photo: englishPhoto,
  addCar: "Add a car",
  make: "Make",
  model: "Model",
  white: "White",
  saveCar: "Save car",
  confirmLicence: "Confirm your licence",
  declaration: "I declare that I hold a valid driving licence for the cars I drive on PuffinRide",
  confirm: "Confirm",
  publish: "Publish ride",
  published: "Your ride is published",
  shareRide: "Share this ride",
  copyText: "Copy text",
  downloadPicture: "Download picture",
  textCopied: "Text copied. Paste it into your post.",
  post: /^Offering a ride: .+\n.+\n(Stops on the way: .+\n)?(Book|Ask for) a seat on PuffinRide: http:\/\/localhost:\d+\/trips\/[0-9a-f-]+\?from=0&to=\d+$/u,
  addEmailPrompt: "Add an email so we can reach you if your ride changes.",
  seeTrips: "See my rides",
  myRides: "My rides",
  myRide: /^You drive, /,
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
  reviewPrice: "4.600 kr. alla leið",
  roadRoute: "Skref 1 af 5: Leið",
  roadCheck: "Skref 5 af 5: Yfirfara",
  reviewLine: "Svona sér fólk ferðina þína.",
  routeRow: /^Leið, BSÍ til Hof, Akureyri, með \d+ viðkomust(?:að|öðum) á leiðinni, Breyta$/,
  toSeats: "Velja sæti",
  pets: "Gæludýr velkomin",
  toReview: "Fara yfir ferðina",
  reviewTitle: "Yfirfara og birta",
  missing: "Þrennt áður en þú birtir",
  missingTwo: "Tvennt áður en þú birtir",
  leftTwo: "Myndin er komin. Bíllinn og ökuskírteinið eru eftir.",
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
  downloadPicture: "Sækja mynd",
  textCopied: "Textinn var afritaður. Límdu hann í færsluna.",
  post: /^Býð far: .+\n.+\n(Mótsstaðir á leiðinni: .+\n)?(Bókaðu|Óskaðu eftir) sæti á PuffinRide: http:\/\/localhost:\d+\/trips\/[0-9a-f-]+\?from=0&to=\d+$/u,
  addEmailPrompt: "Bættu við netfangi svo við getum látið þig vita ef ferðin breytist.",
  seeTrips: "Sjá ferðirnar mínar",
  myRides: "Ferðirnar mínar",
  myRide: /^Þú ekur, /,
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

  // 1. The route, with the meeting points on the way. The road stands
  // where "Step 1 of 5" and its bars stood (spec 31, 3.11).
  await expect(page.getByRole("heading", { name: journey.routeTitle })).toBeVisible();
  await expect(page.getByRole("img", { name: journey.roadRoute })).toBeVisible();
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
  // One step down with minus, then the handle dragged along the track to
  // 70% and back to 80%, by a finger on a phone and the mouse on a laptop.
  await page.getByRole("button", { name: journey.lower }).click();
  await expect(page.getByText("90%", { exact: true })).toBeVisible();
  await dragPriceTo(page, 70);
  await expect(page.getByText("70%", { exact: true })).toBeVisible();
  await dragPriceTo(page, 80);
  await expect(shownText(page, journey.lowerPrice)).toBeVisible();
  await expect(page.getByText("80%", { exact: true })).toBeVisible();
  // On a phone, a finger that moves up from the track scrolls the page instead.
  if (await swipeUpFromPriceTrack(page)) {
    await expect(page.getByText("80%", { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: journey.toReview }).click();

  // 5. Check: the ride as others will see it, each part as a row with
  // Change, and one yellow card for the photo, car and licence, which are
  // done from here; Publish waits for them (spec 31, 3.11, items 3 to 5).
  await expect(page.getByRole("heading", { name: journey.reviewTitle })).toBeVisible();
  await expect(page.getByRole("img", { name: journey.roadCheck }).filter(shown)).toBeVisible();
  await expect(shownText(page, journey.reviewLine)).toBeVisible();
  await expect(page.getByTestId("preview-ticket").filter(shown)).toBeVisible();
  await expect(page.getByRole("link", { name: journey.routeRow }).filter(shown)).toBeVisible();
  await expect(shownText(page, journey.missing)).toBeVisible();
  await expect(page.getByRole("button", { name: journey.publish })).toBeDisabled();
  await addPhotoBeforePublishing(page, journey.photo);
  await expect(page.getByRole("heading", { name: journey.reviewTitle })).toBeVisible();
  // The card names what is done and what is left, with the next one's button.
  await expect(shownText(page, journey.missingTwo)).toBeVisible();
  await expect(shownText(page, journey.leftTwo)).toBeVisible();
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
  await expect(page.getByTestId("needs-you-card").filter(shown)).toHaveCount(0);

  await page.getByRole("button", { name: journey.publish }).click();
  await expect(page.getByRole("heading", { name: journey.published })).toBeVisible();
  // The ride as the ticket it is in My rides (spec 31, 3.19).
  await expect(page.getByRole("button", { name: journey.myRide }).filter(shown)).toBeVisible();
  // Share this ride (spec 28, 3.2): the post's text, in the app's language, copied.
  await expect(page.getByRole("heading", { name: journey.shareRide })).toBeVisible();
  await page.getByRole("button", { name: journey.copyText }).click();
  await expect(page.getByTestId("notice").filter({ hasText: journey.textCopied })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(journey.post);
  // The story picture (3.5), saved from the page under its route's name.
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: journey.downloadPicture }).click();
  expect((await saved).suggestedFilename()).toMatch(/^puffinride-[a-z0-9-]+\.png$/);
  await expect(page.getByRole("heading", { name: journey.published })).toBeVisible();
  // No push on the web, but the account's email reaches them: no prompt
  // for one (spec 7, 3.6.2; spec 26).
  await expect(page.getByText(journey.addEmailPrompt)).toHaveCount(0);
  await page.getByRole("button", { name: journey.seeTrips }).click();
  // My rides, with the ride just published as a ticket (spec 31, 3.10).
  await expect(page).toHaveURL("/my-rides");
  await expect(page.getByRole("heading", { name: journey.myRides, exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: journey.myRide }).filter({ visible: true }),
  ).toBeVisible();
}

test.describe("posting a ride on the web, in English", () => {
  test.use({ locale: "en-GB", permissions: ["clipboard-read", "clipboard-write"] });

  test("a first-time driver posts Reykjavík to Akureyri", async ({ page }) => {
    await postTrip(page, inEnglish);
  });
});

test.describe("posting a ride on the web, in Icelandic", () => {
  test.use({ locale: "is-IS", permissions: ["clipboard-read", "clipboard-write"] });

  test("a first-time driver posts Reykjavík to Akureyri", async ({ page }) => {
    await postTrip(page, inIcelandic);
  });
});
