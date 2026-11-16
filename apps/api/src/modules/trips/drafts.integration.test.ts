import {
  addVehicleRoute,
  cancelTripRoute,
  changeTripRoute,
  copyTripRoute,
  createTripRoute,
  declareLicenceRoute,
  deleteTripRoute,
  listVehiclesRoute,
  myTripRoute,
  myTripsRoute,
  publishTripRoute,
  removeVehicleRoute,
  updateTripRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId, seedSampleMeetingPoints } from "@shareride/db/seed";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import { cleanUpDrafts } from "./clean-up.ts";

let api: TestApi;

const id = (key: string) => sampleId(`point:${key}`);
const kr = (amount: number) => ({ amount, currency: "ISK" });
const hours = (count: number) => count * 3600;

beforeAll(async () => {
  api = await startTestApi();
  await seedSampleMeetingPoints(api.connection.db, api.now());
});

afterAll(async () => {
  await api.close();
});

/** A driver ready to publish: account finished, a car, the licence declared. */
async function newDriver({ ready = true } = {}) {
  const phone = api.newPhoneNumber();
  const signedIn = await api.signIn(phone);
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
  if (ready) await api.client.call(declareLicenceRoute, { accessToken, body: { declared: true } });
  return { ...signedIn, phone, carId: car.data.id };
}

/** Tomorrow at a time of day, in UTC (which is Iceland time). */
function tomorrowAt(time: string): string {
  const day = new Date(api.now().getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  return `${day}T${time}:00.000Z`;
}

const route = [id("bsi"), id("borgarnes"), id("akureyri")];

const publish = (accessToken: string, tripId: string) =>
  api.client.call(publishTripRoute, { accessToken, params: { id: tripId }, body: {} });

async function draft(accessToken: string, body: Record<string, unknown> = {}) {
  const created = await api.client.call(createTripRoute, {
    accessToken,
    body: { stops: route, ...body },
  });
  if (!created.ok) throw new Error(created.error.code);
  return created.data;
}

describe("drafts (spec 3, 3.4 to 3.8)", () => {
  it("starts a draft from the route with a first trip's choices and my car", async () => {
    const { accessToken, carId } = await newDriver();
    const created = await api.client.call(createTripRoute, { accessToken, body: { stops: route } });
    expect(created).toMatchObject({
      status: 201,
      data: {
        status: "draft",
        seats: 3,
        priceLevel: 100,
        bookingMode: "approval",
        vehicleId: carId,
        preferences: {
          luggage: "suitcase",
          pets: "ask",
          smoking: "no",
          childSeat: false,
          chat: "some",
        },
        note: "",
        departsAt: null,
        arrivesAt: null,
        publishedAt: null,
        segments: [],
        openRequests: 0,
      },
    });
    if (!created.ok) return;
    expect(created.data.stops.map((stop) => [stop.meetingPoint.id, stop.plannedAt])).toEqual([
      [id("bsi"), null],
      [id("borgarnes"), null],
      [id("akureyri"), null],
    ]);
  });

  it("plans the times from the departure and keeps times the driver changes", async () => {
    const { accessToken } = await newDriver();
    const trip = await draft(accessToken);
    const departure = tomorrowAt("09:00");
    const planned = await api.client.call(updateTripRoute, {
      accessToken,
      params: { id: trip.id },
      body: { departure },
    });
    if (!planned.ok) throw new Error(planned.error.code);
    const times = planned.data.stops.map((stop) => stop.plannedAt);
    expect(times[0]).toBe(departure);
    expect(times.every((time) => time !== null)).toBe(true);
    expect(planned.data).toMatchObject({ departsAt: departure, arrivesAt: times[2] });

    const changed = [departure, tomorrowAt("10:30"), tomorrowAt("15:00")];
    await api.client.call(updateTripRoute, {
      accessToken,
      params: { id: trip.id },
      body: { plannedTimes: changed },
    });
    const seats = await api.client.call(updateTripRoute, {
      accessToken,
      params: { id: trip.id },
      body: { seats: 4 },
    });
    if (!seats.ok) throw new Error(seats.error.code);
    expect(seats.data.stops.map((stop) => stop.plannedAt)).toEqual(changed);

    // New stops start again from the typical times, from the same departure.
    const shorter = await api.client.call(updateTripRoute, {
      accessToken,
      params: { id: trip.id },
      body: { stops: [id("bsi"), id("akureyri")] },
    });
    if (!shorter.ok) throw new Error(shorter.error.code);
    expect(shorter.data.stops.map((stop) => stop.plannedAt)).toEqual([departure, times[2]]);
  });

  it("refuses a stop not in use or twice, times not one per stop and another person's car", async () => {
    const { accessToken } = await newDriver();
    const other = await newDriver();
    const trip = await draft(accessToken);
    const change = (body: Record<string, unknown>) =>
      api.client.call(updateTripRoute, { accessToken, params: { id: trip.id }, body });
    expect(await change({ stops: [id("bsi"), sampleId("not a point")] })).toMatchObject({
      status: 400,
      error: { code: "stop_unavailable", details: [{ path: "stops.1", issue: "unavailable" }] },
    });
    expect(await change({ stops: [id("bsi"), id("borgarnes"), id("bsi")] })).toMatchObject({
      status: 400,
      error: { code: "validation_failed", details: [{ path: "stops.2", issue: "repeated" }] },
    });
    expect(
      await change({ plannedTimes: [tomorrowAt("09:00"), tomorrowAt("10:00")] }),
    ).toMatchObject({
      status: 400,
      error: { code: "validation_failed", details: [{ path: "plannedTimes" }] },
    });
    expect(await change({ vehicleId: other.carId })).toMatchObject({
      status: 400,
      error: {
        code: "vehicle_unavailable",
        details: [{ path: "vehicleId", issue: "unavailable" }],
      },
    });
  });

  it("keeps times in any order in a draft, and publishing refuses them", async () => {
    const { accessToken } = await newDriver();
    const trip = await draft(accessToken, { departure: tomorrowAt("09:00") });
    const reversed = [tomorrowAt("11:00"), tomorrowAt("10:00"), tomorrowAt("09:00")];
    const changed = await api.client.call(updateTripRoute, {
      accessToken,
      params: { id: trip.id },
      body: { plannedTimes: reversed },
    });
    expect(changed).toMatchObject({
      status: 200,
      data: { departsAt: reversed[0], arrivesAt: reversed[2] },
    });
    const refused = await publish(accessToken, trip.id);
    expect(refused).toMatchObject({
      status: 422,
      error: {
        details: [
          { path: "segments.0", issue: "times_not_increasing" },
          { path: "segments.1", issue: "times_not_increasing" },
        ],
      },
    });
  });

  it("drops a stop whose point was retired the next time the draft changes", async () => {
    const { accessToken } = await newDriver();
    const [borgarnes] = await api.connection.db
      .select()
      .from(schema.meetingPoints)
      .where(eq(schema.meetingPoints.id, id("borgarnes")));
    if (borgarnes === undefined) throw new Error("The sample points are missing.");
    const retiring = sampleId("test:drafts-retiring");
    await api.connection.db
      .insert(schema.meetingPoints)
      .values({ ...borgarnes, id: retiring, nameIs: "Hættir" });
    const trip = await draft(accessToken, { stops: [id("bsi"), retiring, id("akureyri")] });
    await api.connection.db
      .update(schema.meetingPoints)
      .set({ status: "retired" })
      .where(eq(schema.meetingPoints.id, retiring));

    const changed = await api.client.call(updateTripRoute, {
      accessToken,
      params: { id: trip.id },
      body: { departure: tomorrowAt("09:00") },
    });
    expect(changed).toMatchObject({ status: 200 });
    if (!changed.ok) return;
    expect(changed.data.stops.map((stop) => stop.meetingPoint.id)).toEqual([
      id("bsi"),
      id("akureyri"),
    ]);
    const stored = await api.connection.db
      .select({ position: schema.tripStops.position })
      .from(schema.tripStops)
      .where(eq(schema.tripStops.tripId, trip.id))
      .orderBy(schema.tripStops.position);
    expect(stored).toEqual([{ position: 0 }, { position: 1 }]);
    expect(await publish(accessToken, trip.id)).toMatchObject({ status: 200 });
  });

  it("waits for distances not worked out yet", async () => {
    const { accessToken } = await newDriver();
    const [bsi] = await api.connection.db
      .select()
      .from(schema.meetingPoints)
      .where(eq(schema.meetingPoints.id, id("bsi")));
    if (bsi === undefined) throw new Error("The sample points are missing.");
    await api.connection.db
      .insert(schema.meetingPoints)
      .values({ ...bsi, id: sampleId("test:drafts-new"), nameIs: "Nýr staður" });
    const trip = await draft(accessToken, { stops: [id("bsi"), sampleId("test:drafts-new")] });
    const planned = await api.client.call(updateTripRoute, {
      accessToken,
      params: { id: trip.id },
      body: { departure: tomorrowAt("09:00") },
    });
    expect(planned).toMatchObject({ status: 503, error: { code: "distances_pending" } });
  });

  it("keeps my trips to me", async () => {
    const mine = await newDriver();
    const other = await newDriver();
    const trip = await draft(mine.accessToken);
    const read = await api.client.call(myTripRoute, {
      accessToken: other.accessToken,
      params: { id: trip.id },
    });
    expect(read.status).toBe(404);
    const changed = await api.client.call(updateTripRoute, {
      accessToken: other.accessToken,
      params: { id: trip.id },
      body: { seats: 2 },
    });
    expect(changed.status).toBe(404);
    const removed = await api.client.call(deleteTripRoute, {
      accessToken: other.accessToken,
      params: { id: trip.id },
    });
    expect(removed.status).toBe(404);
    const theirs = await api.client.call(myTripsRoute, {
      accessToken: other.accessToken,
      query: {},
    });
    expect(theirs).toMatchObject({ status: 200, data: { trips: [] } });
  });

  it("needs a signed-in person", async () => {
    expect((await api.client.call(myTripsRoute, { query: {} })).status).toBe(401);
    expect((await api.client.call(createTripRoute, { body: { stops: route } })).status).toBe(401);
  });
});

describe("publishing (spec 3, 3.8 and section 4)", () => {
  it("publishes a draft with the prices at publishing", async () => {
    const { accessToken } = await newDriver();
    const trip = await draft(accessToken, { departure: tomorrowAt("09:00") });
    const published = await publish(accessToken, trip.id);
    expect(published).toMatchObject({
      status: 200,
      data: { status: "published", publishedAt: api.now().toISOString() },
    });
    if (!published.ok) return;
    // Bus terminal to Borgarnes 71 km, then 314 km to Akureyri.
    expect(published.data.segments).toEqual([
      expect.objectContaining({ distanceM: 71_000, price: kr(1100), cap: kr(2700) }),
      expect.objectContaining({ distanceM: 314_000, price: kr(4700), suggestedPrice: kr(4700) }),
    ]);
    const stored = await api.connection.db
      .select()
      .from(schema.segments)
      .where(eq(schema.segments.tripId, trip.id));
    expect(stored.map((segment) => [segment.price, segment.capacity, segment.occupancy])).toEqual([
      [1100, 3, 0],
      [4700, 3, 0],
    ]);

    const again = await publish(accessToken, trip.id);
    expect(again).toMatchObject({ status: 409, error: { code: "trip_not_draft" } });
    const changed = await api.client.call(updateTripRoute, {
      accessToken,
      params: { id: trip.id },
      body: { seats: 2 },
    });
    expect(changed).toMatchObject({ status: 409, error: { code: "trip_not_draft" } });
    const removed = await api.client.call(deleteTripRoute, {
      accessToken,
      params: { id: trip.id },
    });
    expect(removed).toMatchObject({ status: 409, error: { code: "trip_not_draft" } });
  });

  it("lists everything to fix instead of publishing", async () => {
    const { accessToken } = await newDriver({ ready: false });
    const trip = await draft(accessToken, { priceLevel: 300, note: "Call me on 555 1234" });
    const refused = await publish(accessToken, trip.id);
    expect(refused).toMatchObject({ status: 422, error: { code: "trip_not_publishable" } });
    if (refused.ok) return;
    expect(refused.error.details).toEqual([
      { path: "driver", issue: "driver_not_ready" },
      { path: "priceLevel", issue: "price_level_invalid" },
      { path: "plannedTimes", issue: "times_missing" },
      { path: "note", issue: "note_has_contact_details" },
    ]);
    const unchanged = await api.client.call(myTripRoute, { accessToken, params: { id: trip.id } });
    expect(unchanged).toMatchObject({ data: { status: "draft" } });
  });

  it("refuses a trip that overlaps another of mine", async () => {
    const { accessToken } = await newDriver();
    const first = await draft(accessToken, { departure: tomorrowAt("09:00") });
    await publish(accessToken, first.id);
    const second = await draft(accessToken, {
      stops: [id("borgarnes"), id("bsi")],
      departure: tomorrowAt("12:00"),
    });
    const refused = await publish(accessToken, second.id);
    expect(refused).toMatchObject({
      status: 422,
      error: { details: [{ path: "plannedTimes", issue: "overlaps_trip" }] },
    });
  });

  it("starts the next draft from my previous trip", async () => {
    const { accessToken } = await newDriver();
    const preferences = {
      luggage: "small_bag",
      pets: "no",
      smoking: "breaks_outside",
      childSeat: true,
      chat: "quiet",
    } as const;
    const trip = await draft(accessToken, {
      departure: tomorrowAt("09:00"),
      seats: 5,
      priceLevel: 80,
      bookingMode: "instant",
      preferences,
    });
    await publish(accessToken, trip.id);
    const next = await draft(accessToken);
    expect(next).toMatchObject({ seats: 5, priceLevel: 80, bookingMode: "instant", preferences });
    const listed = await api.client.call(myTripsRoute, { accessToken, query: {} });
    expect(listed).toMatchObject({
      data: {
        trips: [
          { id: next.id, status: "draft" },
          { id: trip.id, status: "published" },
        ],
      },
    });
  });
});

describe("cars on trips (spec 3, 3.2)", () => {
  it("keeps a car on an upcoming trip, and one a past trip used", async () => {
    const driver = await newDriver();
    const trip = await draft(driver.accessToken, { departure: tomorrowAt("09:00") });
    await publish(driver.accessToken, trip.id);
    const params = { id: driver.carId };
    const refused = await api.client.call(removeVehicleRoute, {
      accessToken: driver.accessToken,
      params,
    });
    expect(refused).toMatchObject({ status: 409, error: { code: "vehicle_in_use" } });

    api.advance(hours(48));
    const { accessToken } = await api.signIn(driver.phone);
    const removed = await api.client.call(removeVehicleRoute, { accessToken, params });
    expect(removed.status).toBe(204);
    const listed = await api.client.call(listVehiclesRoute, { accessToken });
    expect(listed).toMatchObject({ data: { vehicles: [] } });
    const [kept] = await api.connection.db
      .select()
      .from(schema.vehicles)
      .where(eq(schema.vehicles.id, driver.carId));
    expect(kept?.removedAt).toEqual(api.now());
  });

  it("takes a removed car off my drafts", async () => {
    const { accessToken, carId } = await newDriver();
    const trip = await draft(accessToken);
    await api.client.call(removeVehicleRoute, { accessToken, params: { id: carId } });
    const read = await api.client.call(myTripRoute, { accessToken, params: { id: trip.id } });
    expect(read).toMatchObject({ data: { vehicleId: null } });
    const left = await api.connection.db
      .select()
      .from(schema.vehicles)
      .where(eq(schema.vehicles.id, carId));
    expect(left).toEqual([]);
  });
});

describe("post again and post the return (spec 6, 3.6)", () => {
  const preferences = {
    luggage: "small_bag",
    pets: "no",
    smoking: "breaks_outside",
    childSeat: true,
    chat: "quiet",
  } as const;

  /** A published trip from the bus terminal to Akureyri through Borgarnes. */
  async function publishedTrip(accessToken: string, time = "09:00") {
    const trip = await draft(accessToken, {
      departure: tomorrowAt(time),
      seats: 2,
      priceLevel: 120,
      bookingMode: "instant",
      preferences,
      note: "Room for skis.",
    });
    const published = await publish(accessToken, trip.id);
    if (!published.ok) throw new Error(published.error.code);
    return published.data;
  }

  const copy = (accessToken: string, tripId: string, reverse: boolean) =>
    api.client.call(copyTripRoute, {
      accessToken,
      params: { id: tripId },
      query: { reverse },
      body: {},
    });

  it("posts a trip again: a draft with its stops, car, seats, price level, booking mode, preferences and note, without a date", async () => {
    const { accessToken, carId } = await newDriver();
    const trip = await publishedTrip(accessToken);
    // A later trip with other choices and another car, which a new draft
    // would otherwise start from (spec 3, 3.6.3).
    const volvo = await api.client.call(addVehicleRoute, {
      accessToken,
      body: { make: "Volvo", model: "XC40", colour: "red", registration: null },
    });
    if (!volvo.ok) throw new Error(volvo.error.code);
    const later = await draft(accessToken, {
      departure: tomorrowAt("15:00"),
      vehicleId: volvo.data.id,
      seats: 4,
      priceLevel: 100,
      bookingMode: "approval",
      preferences: { ...preferences, pets: "yes", chat: "chatty" },
      note: "",
    });
    expect(await publish(accessToken, later.id)).toMatchObject({ status: 200 });
    await api.connection.db
      .update(schema.trips)
      .set({ publishedAt: new Date(api.now().getTime() + 60_000) })
      .where(eq(schema.trips.id, later.id));
    expect(await draft(accessToken)).toMatchObject({ vehicleId: volvo.data.id, seats: 4 });

    const again = await copy(accessToken, trip.id, false);
    expect(again).toMatchObject({
      status: 201,
      data: {
        trip: {
          status: "draft",
          vehicleId: carId,
          seats: 2,
          priceLevel: 120,
          bookingMode: "instant",
          preferences,
          note: "Room for skis.",
          departsAt: null,
          publishedAt: null,
          segments: [],
        },
        dropped: [],
      },
    });
    if (!again.ok) return;
    expect(again.data.trip.id).not.toEqual(trip.id);
    expect(again.data.trip.stops.map((stop) => [stop.meetingPoint.id, stop.plannedAt])).toEqual(
      route.map((point) => [point, null]),
    );
    // The trip it came from is as it was.
    const original = await api.client.call(myTripRoute, { accessToken, params: { id: trip.id } });
    expect(original).toMatchObject({ data: { status: "published", departsAt: trip.departsAt } });
  });

  it("posts the return with the stops reversed, timed and priced from the legs the other way", async () => {
    const { accessToken } = await newDriver();
    const trip = await publishedTrip(accessToken);
    const back = await copy(accessToken, trip.id, true);
    if (!back.ok) throw new Error(back.error.code);
    expect(back.data.trip.stops.map((stop) => stop.meetingPoint.id)).toEqual([...route].reverse());

    const planned = await api.client.call(updateTripRoute, {
      accessToken,
      params: { id: back.data.trip.id },
      body: { departure: tomorrowAt("17:00") },
    });
    if (!planned.ok) throw new Error(planned.error.code);
    const legsBack = await api.connection.db
      .select()
      .from(schema.legs)
      .where(inArray(schema.legs.fromMeetingPointId, [id("akureyri"), id("borgarnes")]));
    const leg = (from: string, to: string) =>
      legsBack.find((each) => each.fromMeetingPointId === from && each.toMeetingPointId === to);
    const first = leg(id("akureyri"), id("borgarnes"));
    if (first === undefined) throw new Error("The sample legs are missing.");
    expect(planned.data.stops[1]?.plannedAt).not.toBeNull();
    const firstStretchS =
      (new Date(planned.data.stops[1]?.plannedAt ?? 0).getTime() -
        new Date(planned.data.stops[0]?.plannedAt ?? 0).getTime()) /
      1000;
    expect(firstStretchS).toBeGreaterThanOrEqual(first.durationS);
    expect(await publish(accessToken, back.data.trip.id)).toMatchObject({
      status: 200,
      data: {
        segments: [
          expect.objectContaining({ distanceM: first.distanceM }),
          expect.objectContaining({ distanceM: leg(id("borgarnes"), id("bsi"))?.distanceM }),
        ],
      },
    });
  });

  it("leaves out a stop the driver removed, and names a meeting point no longer in use", async () => {
    const { accessToken } = await newDriver();
    const [borgarnes] = await api.connection.db
      .select()
      .from(schema.meetingPoints)
      .where(eq(schema.meetingPoints.id, id("borgarnes")));
    if (borgarnes === undefined) throw new Error("The sample points are missing.");
    const pausing = sampleId("test:copy-pausing");
    await api.connection.db
      .insert(schema.meetingPoints)
      .values({ ...borgarnes, id: pausing, nameIs: "Í hléi", nameEn: "Paused" });
    const legsOf = await api.connection.db
      .select()
      .from(schema.legs)
      .where(inArray(schema.legs.fromMeetingPointId, [id("borgarnes")]));
    await api.connection.db
      .insert(schema.legs)
      .values(legsOf.map((leg) => ({ ...leg, fromMeetingPointId: pausing })));
    const legsTo = await api.connection.db
      .select()
      .from(schema.legs)
      .where(inArray(schema.legs.toMeetingPointId, [id("borgarnes")]));
    await api.connection.db
      .insert(schema.legs)
      .values(legsTo.map((leg) => ({ ...leg, toMeetingPointId: pausing })));
    // Next door to Borgarnes, as the copy of it is.
    const [nextDoor] = legsOf;
    if (nextDoor === undefined) throw new Error("The sample legs are missing.");
    await api.connection.db.insert(schema.legs).values({
      ...nextDoor,
      fromMeetingPointId: id("borgarnes"),
      toMeetingPointId: pausing,
      distanceM: 1000,
      durationS: 60,
    });

    const trip = await draft(accessToken, {
      stops: [id("bsi"), id("borgarnes"), pausing, id("akureyri")],
      departure: tomorrowAt("07:00"),
    });
    const published = await publish(accessToken, trip.id);
    if (!published.ok) throw new Error(published.error.code);
    const removed = await api.client.call(changeTripRoute, {
      accessToken,
      params: { id: trip.id },
      query: { preview: false },
      body: { kind: "removeStop", meetingPointId: id("borgarnes") },
    });
    if (!removed.ok) throw new Error(removed.error.code);
    await api.connection.db
      .update(schema.meetingPoints)
      .set({ status: "paused" })
      .where(eq(schema.meetingPoints.id, pausing));

    const back = await copy(accessToken, trip.id, true);
    expect(back).toMatchObject({
      status: 201,
      data: { dropped: [{ id: pausing, name: { is: "Í hléi", en: "Paused" } }] },
    });
    if (!back.ok) return;
    expect(back.data.trip.stops.map((stop) => stop.meetingPoint.id)).toEqual([
      id("akureyri"),
      id("bsi"),
    ]);
  });

  it("refuses a trip with fewer than two meeting points still in use, and anyone else's trip", async () => {
    const { accessToken } = await newDriver();
    const [bsi] = await api.connection.db
      .select()
      .from(schema.meetingPoints)
      .where(eq(schema.meetingPoints.id, id("bsi")));
    if (bsi === undefined) throw new Error("The sample points are missing.");
    const closing = sampleId("test:copy-closing");
    await api.connection.db
      .insert(schema.meetingPoints)
      .values({ ...bsi, id: closing, nameIs: "Lokar" });
    const trip = await draft(accessToken, { stops: [closing, id("akureyri")] });
    await api.connection.db
      .update(schema.meetingPoints)
      .set({ status: "retired" })
      .where(eq(schema.meetingPoints.id, closing));
    expect(await copy(accessToken, trip.id, false)).toMatchObject({
      status: 422,
      error: { code: "too_few_stops" },
    });

    const other = await newDriver();
    const theirs = await publishedTrip(other.accessToken, "13:00");
    expect(await copy(accessToken, theirs.id, false)).toMatchObject({
      status: 404,
      error: { code: "not_found" },
    });
  });

  it("copies a cancelled trip, with my car if it was removed since", async () => {
    const { accessToken, carId } = await newDriver();
    const trip = await publishedTrip(accessToken);
    const cancelled = await api.client.call(cancelTripRoute, {
      accessToken,
      params: { id: trip.id },
      body: { reason: "weather", countsOnReliability: false },
    });
    if (!cancelled.ok) throw new Error(cancelled.error.code);
    const other = await api.client.call(addVehicleRoute, {
      accessToken,
      body: { make: "Volvo", model: "XC40", colour: "red", registration: null },
    });
    if (!other.ok) throw new Error(other.error.code);
    await api.client.call(removeVehicleRoute, { accessToken, params: { id: carId } });

    expect(await copy(accessToken, trip.id, false)).toMatchObject({
      status: 201,
      data: { trip: { status: "draft", vehicleId: other.data.id, seats: 2 } },
    });
  });

  it("needs a signed-in person", async () => {
    const { accessToken } = await newDriver();
    const trip = await draft(accessToken);
    expect(
      await api.client.call(copyTripRoute, {
        params: { id: trip.id },
        query: { reverse: false },
        body: {},
      }),
    ).toMatchObject({ status: 401 });
  });
});

describe("cleanUpDrafts (R3.11)", () => {
  it("deletes drafts 30 days after their last change or once they would have left", async () => {
    const { accessToken, userId } = await newDriver();
    const old = await draft(accessToken);
    await draft(accessToken, { departure: tomorrowAt("09:00") });
    const recent = await draft(accessToken);
    // A published trip stays however old, and after it has left.
    const trip = await draft(accessToken, { departure: tomorrowAt("12:00") });
    expect(await publish(accessToken, trip.id)).toMatchObject({ status: 200 });
    const monthAgo = new Date(api.now().getTime() - 31 * 24 * 3600 * 1000);
    await api.connection.db
      .update(schema.trips)
      .set({ updatedAt: monthAgo })
      .where(inArray(schema.trips.id, [old.id, trip.id]));
    const later = new Date(api.now().getTime() + 30 * 3600 * 1000);
    expect(await cleanUpDrafts(api.connection.db, later)).toBeGreaterThanOrEqual(2);
    const left = await api.connection.db
      .select({ id: schema.trips.id })
      .from(schema.trips)
      .where(eq(schema.trips.driverId, userId));
    expect(left.map((row) => row.id).sort()).toEqual([recent.id, trip.id].sort());
  });
});
