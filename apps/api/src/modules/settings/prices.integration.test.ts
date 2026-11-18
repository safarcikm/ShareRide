import {
  addVehicleRoute,
  changeTripRoute,
  createTripRoute,
  declareLicenceRoute,
  myTripRoute,
  publishTripRoute,
  quoteRoute,
  type AdminSettingPreview,
  type AdminSettings,
  type Config,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId, seedSampleMeetingPoints } from "@shareride/db/seed";
import { defaultTripSettings, priceCap, segmentPrice, suggestedPrice } from "@shareride/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";

// The price values from the settings, with their versions (spec 10, 3.2.2
// to 3.2.4; R10.3; ADR 0032; milestone 11, PR 11). One database for the
// whole file: the history cannot be emptied, so the tests follow each
// other.

let api: TestApi;
let operator: { userId: string; cookie: string };

const point = (key: string) => sampleId(`point:${key}`);
const route = [point("bsi"), point("borgarnes"), point("akureyri")];

beforeAll(async () => {
  api = await startTestApi();
  await seedSampleMeetingPoints(api.connection.db, api.now());
  operator = await api.signInOperator();
});

afterAll(async () => {
  await api.close();
});

async function send(method: string, path: string, body?: unknown, cookie = operator.cookie) {
  const response = await api.request(path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

const settings = async () => (await send("GET", "/admin/v1/settings")).body as AdminSettings;
const codeOf = (body: unknown) => (body as { error: { code: string } }).error.code;
const detailsOf = (body: unknown) =>
  (body as { error: { details?: { path: string; issue: string }[] } }).error.details;

/** Changes a setting, and gives the new version. */
async function set(key: string, value: number) {
  const { version } = await settings();
  const changed = await send("PATCH", `/admin/v1/settings/${key}`, {
    value,
    reason: "A test.",
    version,
  });
  if (changed.status !== 200) throw new Error(JSON.stringify(changed.body));
  return (changed.body as AdminSettings).version;
}

const preview = (key: string, value: number, cookie = operator.cookie) =>
  send("POST", `/admin/v1/settings/${key}/preview`, { value }, cookie);

/** A driver ready to publish: account finished, a car, the licence declared. */
async function newDriver() {
  const signedIn = await api.signIn(api.newPhoneNumber());
  const { accessToken } = signedIn;
  await api.connection.db
    .update(schema.users)
    .set({ firstName: "Anna", ageConfirmedAt: api.now() })
    .where(eq(schema.users.id, signedIn.userId));
  const documents = await api.connection.db.select().from(schema.legalDocuments);
  await api.connection.db.insert(schema.legalAcceptances).values(
    documents.map((document) => ({
      userId: signedIn.userId,
      documentId: document.id,
      version: document.version,
      locale: "en",
      acceptedAt: api.now(),
    })),
  );
  const car = await api.client.call(addVehicleRoute, {
    accessToken,
    body: { make: "Toyota", model: "Yaris", colour: "white", registration: null },
  });
  if (!car.ok) throw new Error(car.error.code);
  await api.client.call(declareLicenceRoute, { accessToken, body: { declared: true } });
  return accessToken;
}

async function draft(accessToken: string, seats = 2) {
  const day = new Date(api.now().getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const created = await api.client.call(createTripRoute, {
    accessToken,
    body: { stops: route, departure: `${day}T09:00:00.000Z`, seats, priceLevel: 100 },
  });
  if (!created.ok) throw new Error(created.error.code);
  return created.data;
}

const publish = (accessToken: string, id: string) =>
  api.client.call(publishTripRoute, { accessToken, params: { id }, body: {} });

async function published(accessToken: string, seats = 2) {
  const trip = await publish(accessToken, (await draft(accessToken, seats)).id);
  if (!trip.ok) throw new Error(trip.error.code);
  return trip.data;
}

async function mine(accessToken: string, id: string) {
  const trip = await api.client.call(myTripRoute, { accessToken, params: { id } });
  if (!trip.ok) throw new Error(trip.error.code);
  return trip.data;
}

async function versionOf(tripId: string) {
  const [row] = await api.connection.db
    .select({ settingsVersion: schema.trips.settingsVersion })
    .from(schema.trips)
    .where(eq(schema.trips.id, tripId));
  return row?.settingsVersion;
}

const defaults = {
  suggestedRatePerKm: 15,
  referenceCostPerKm: 150,
  priceStep: 100,
  priceLevelStep: 10,
};

describe("the effect of a price value before saving (spec 10, 3.2.2)", () => {
  it("shows Reykjavík to Akureyri with 3 seats, as it is and as it would be, and stores nothing", async () => {
    const before = await settings();
    const shown = await preview("suggested_rate", 16);
    expect(shown.status).toBe(200);
    expect(shown.body as AdminSettingPreview).toEqual({
      price: {
        distanceKm: 388,
        seats: 3,
        before: { price: 5800, highestLevel: 250 },
        after: { price: 6200, highestLevel: 230 },
      },
    });
    expect(await settings()).toEqual(before);
  });

  it("has no price to show for the other settings", async () => {
    expect((await preview("beta_max_testers", 10)).body).toEqual({ price: null });
    expect((await preview("max_capacity", 6)).body).toEqual({ price: null });
  });

  it("refuses what saving would refuse", async () => {
    const tooHigh = await preview("suggested_rate", 31);
    expect(tooHigh.status).toBe(400);
    expect(detailsOf(tooHigh.body)).toEqual([{ path: "value", issue: "out_of_range" }]);
    const same = await preview("suggested_rate", 15);
    expect(same.status).toBe(409);
    expect(codeOf(same.body)).toBe("unchanged");
    expect((await preview("nothing", 1)).status).toBe(404);
    const bare = await preview("suggested_rate", 16, "");
    expect(bare.status).toBe(401);
  });
});

describe("the check across the price values (ADR 0032)", () => {
  it("refuses a suggested rate the largest car cannot carry, to preview or to save", async () => {
    // 17 kr for 8 passengers and the driver is 153 kr, over the 150 kr of driving.
    const shown = await preview("suggested_rate", 17);
    expect(shown.status).toBe(400);
    expect(detailsOf(shown.body)).toEqual([{ path: "value", issue: "suggested_over_cap" }]);

    const { version } = await settings();
    const saved = await send("PATCH", "/admin/v1/settings/suggested_rate", {
      value: 17,
      reason: "Fuel costs more.",
      version,
    });
    expect(saved.status).toBe(400);
    expect(codeOf(saved.body)).toBe("validation_failed");
    expect(detailsOf(saved.body)).toEqual([{ path: "value", issue: "suggested_over_cap" }]);
    expect((await settings()).version).toBe(version);
  });
});

describe("a trip's prices and the settings version (R10.3)", () => {
  it("keeps a published trip's prices through a level change, and prices a later trip by the new rate", async () => {
    const anna = await newDriver();
    const first = await published(anna);
    const startVersion = (await settings()).version;
    expect(await versionOf(first.id)).toBe(startVersion);
    expect(first.priceSettings).toEqual(defaults);
    const distances = first.segments.map((segment) => segment.distanceM);
    expect(first.segments.map((segment) => segment.price)).toEqual(
      distances.map((distanceM) => segmentPrice(distanceM, 100, 2, defaultTripSettings)),
    );

    // The operator lowers the suggested rate and the price step.
    await set("suggested_rate", 12);
    const version = await set("price_step", 50);
    const lower = { ...defaults, suggestedRatePerKm: 12, priceStep: 50 };

    // The first trip's level goes up: still 15 kr per km, to the nearest 100.
    const raised = await api.client.call(changeTripRoute, {
      accessToken: anna,
      params: { id: first.id },
      query: { preview: false },
      body: { kind: "priceLevel", priceLevel: 120 },
    });
    expect(raised.ok).toBe(true);
    const after = await mine(anna, first.id);
    expect(after.priceLevel).toBe(120);
    expect(after.priceSettings).toEqual(defaults);
    expect(after.segments.map((segment) => segment.price)).toEqual(
      distances.map((distanceM) => segmentPrice(distanceM, 120, 2, defaultTripSettings)),
    );
    expect(await versionOf(first.id)).toBe(startVersion);

    // A route planned now, and a trip published now, use the new values.
    const jon = await newDriver();
    const quote = await api.client.call(quoteRoute, {
      accessToken: jon,
      body: { stops: route, seats: 2, priceLevel: 100 },
    });
    if (!quote.ok) throw new Error(quote.error.code);
    expect(quote.data.segments.map((segment) => segment.price)).toEqual(
      distances.map((distanceM) => segmentPrice(distanceM, 100, 2, lower)),
    );
    const planned = await draft(jon);
    expect(planned.priceSettings).toEqual(lower);
    const second = await publish(jon, planned.id);
    if (!second.ok) throw new Error(second.error.code);
    expect(await versionOf(second.data.id)).toBe(version);
    expect(second.data.priceSettings).toEqual(lower);
    expect(second.data.segments).toMatchObject(
      distances.map((distanceM) => ({
        suggestedPrice: suggestedPrice(distanceM, lower),
        cap: priceCap(distanceM, 2, lower),
        price: segmentPrice(distanceM, 100, 2, lower),
      })),
    );
    // Not the same prices, or the test would show nothing.
    expect(second.data.segments[0]?.price).not.toEqual(first.segments[0]?.price);

    // A later change leaves both as they are.
    await set("suggested_rate", 14);
    expect((await mine(anna, first.id)).priceSettings).toEqual(defaults);
    expect((await mine(jon, second.data.id)).priceSettings).toEqual(lower);
    const seats = await api.client.call(changeTripRoute, {
      accessToken: jon,
      params: { id: second.data.id },
      query: { preview: false },
      body: { kind: "seats", seats: 3 },
    });
    expect(seats.ok).toBe(true);
    expect((await mine(jon, second.data.id)).segments).toMatchObject(
      distances.map((distanceM) => ({
        cap: priceCap(distanceM, 3, lower),
        price: segmentPrice(distanceM, 100, 3, lower),
      })),
    );
  });
});

describe("the seat limit (rule S1)", () => {
  it("is read as it is now: by the apps, when publishing and when changing a trip", async () => {
    const anna = await newDriver();
    const trip = await published(anna, 4);
    expect(((await (await api.request("/v1/config")).json()) as Config).maxSeats).toBe(8);

    await set("max_capacity", 4);
    expect(((await (await api.request("/v1/config")).json()) as Config).maxSeats).toBe(4);

    const jon = await newDriver();
    const five = await publish(jon, (await draft(jon, 5)).id);
    expect(five).toMatchObject({ status: 422, error: { code: "trip_not_publishable" } });
    if (five.ok) return;
    expect(five.error.details).toEqual([{ path: "seats", issue: "seats_invalid" }]);
    expect((await publish(jon, (await draft(jon, 4)).id)).ok).toBe(true);

    // A trip published with 4 seats before keeps them, and cannot take a fifth.
    const more = await api.client.call(changeTripRoute, {
      accessToken: anna,
      params: { id: trip.id },
      query: { preview: false },
      body: { kind: "seats", seats: 5 },
    });
    expect(more.ok).toBe(false);
    expect((await mine(anna, trip.id)).seats).toBe(4);
  });
});
