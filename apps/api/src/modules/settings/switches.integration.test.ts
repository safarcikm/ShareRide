import {
  acceptRequestRoute,
  bookingRoute,
  changeTripRoute,
  configRoute,
  sendConfirmCodeRoute,
  startPaymentRoute,
  startPhoneSignInRoute,
  verifyPhoneCodeRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { and, eq, max } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import { createOperatorSessionService, operatorCookie } from "../admin/index.ts";
import { pausedHeldIn } from "./index.ts";
import { expireAllDueBookings } from "../bookings/index.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
} from "../bookings/testing.ts";

// The switches for emergencies (spec 10, 3.3; R10.5; milestone 11, PR 7),
// turned on the console as the operator turns them. One database for the
// whole file: the history cannot be emptied, so every test turns back on
// what it turned off.

let api: TestApi;
let operatorId: string;

const device = { platform: "ios", name: "Test phone", appVersion: "1.0.0" } as const;
const { north } = sampleTrip;
const minutes = (count: number) => count * 60;
const { newMember, later, rewind, driverOf, booked, paid } = bookingHelpers(() => api);

beforeAll(async () => {
  api = await startTestApi();
  operatorId = (await api.signInOperator()).userId;
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

/**
 * Turns a switch on the console's Settings page. A new console session each
 * time, as the tests move the clock past a session's life.
 */
async function turn(key: string, to: "on" | "off") {
  const session = await createOperatorSessionService(api.features).start({
    userId: operatorId,
    device: "Test browser",
  });
  const headers = {
    cookie: `${operatorCookie.name}=${session.token}`,
    "content-type": "application/json",
  };
  const shown = await api.request("/admin/v1/settings", { headers });
  const { version } = (await shown.json()) as { version: number };
  const changed = await api.request(`/admin/v1/settings/${key}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ value: to === "on" ? 1 : 0, reason: "For a test", version }),
  });
  expect(changed.status).toBe(200);
}

async function paused() {
  const config = await api.client.call(configRoute, {});
  if (!config.ok) throw new Error(config.error.code);
  return config.data.paused;
}

let addresses = 0;

/**
 * Asks for a sign-in code from a new address, 31 seconds later, for a
 * waiting email sign-in (spec 26): a new one unless one is given.
 */
async function start(phoneNumber: string, waiting?: string) {
  const pendingSignIn = waiting ?? (await api.waitingEmailSignIn());
  api.advance(31);
  addresses += 1;
  api.ip = `203.0.113.${String(addresses % 250)}`;
  const started = await api.client.call(startPhoneSignInRoute, {
    body: { phoneNumber, locale: "en", pendingSignIn },
  });
  return { started, pendingSignIn };
}

const verify = (phoneNumber: string, code: string, pendingSignIn: string) =>
  api.client.call(verifyPhoneCodeRoute, {
    body: { phoneNumber, code, locale: "en", device, pendingSignIn },
  });

const stored = async (bookingId: string) => {
  const [row] = await api.connection.db
    .select()
    .from(schema.bookings)
    .where(eq(schema.bookings.id, bookingId));
  if (row === undefined) throw new Error("No such booking.");
  return row;
};

const accept = (accessToken: string, id: string) =>
  api.client.call(acceptRequestRoute, { accessToken, params: { id }, body: {} });

const pay = (accessToken: string, id: string) =>
  api.client.call(startPaymentRoute, { accessToken, params: { id }, body: {} });

describe("the switches", () => {
  it("are all on at first, and the apps are told of nothing paused", async () => {
    expect(await paused()).toEqual([]);
  });

  it("tell the apps what is paused, and write `switch.changed` in the audit log", async () => {
    await turn("trips_open", "off");
    await turn("email_sending", "off");
    // Only what the app shows a banner for: email waits without one.
    expect(await paused()).toEqual(["trips"]);
    const logged = await api.connection.db
      .select({ subjectId: schema.auditLog.subjectId, after: schema.auditLog.after })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "switch.changed"));
    expect(logged).toHaveLength(2);
    expect(logged.map((entry) => entry.subjectId).sort()).toEqual(["email_sending", "trips_open"]);
    expect(logged[0]?.after).toMatchObject({ value: 0, reason: "For a test" });
    await turn("trips_open", "on");
    await turn("email_sending", "on");
    expect(await paused()).toEqual([]);
  });
});

describe("new sign-ups paused", () => {
  it("refuses a number with no account and keeps its code, while members sign in", async () => {
    const member = api.newPhoneNumber();
    await api.signIn(member);
    await turn("signups_open", "off");
    expect(await paused()).toEqual(["signups"]);

    const newcomer = api.newPhoneNumber();
    const { started, pendingSignIn } = await start(newcomer);
    expect(started.ok).toBe(true);
    const code = api.lastCode(newcomer);
    const refused = await verify(newcomer, code, pendingSignIn);
    expect(refused).toMatchObject({ ok: false, status: 503, error: { code: "signups_paused" } });
    const accounts = await api.connection.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.phoneE164, newcomer));
    expect(accounts).toEqual([]);

    const memberStep = await start(member);
    expect(memberStep.started.ok).toBe(true);
    expect(await verify(member, api.lastCode(member), memberStep.pendingSignIn)).toMatchObject({
      ok: true,
      data: { isNewUser: false },
    });

    // Back on: the same code still works, as no try was counted or used.
    await turn("signups_open", "on");
    expect(await verify(newcomer, code, pendingSignIn)).toMatchObject({
      ok: true,
      data: { isNewUser: true },
    });
  });
});

describe("text messages paused", () => {
  it("sends no sign-in or confirm code, and says so", async () => {
    const member = await api.signIn(api.newPhoneNumber());
    await turn("sms_sending", "off");
    expect(await paused()).toEqual(["sms"]);
    const waiting = await api.waitingEmailSignIn();
    const sentBefore = api.sms.outbox.length;
    const limitEvents = () => api.connection.db.$count(schema.rateLimitEvents);
    const countedBefore = await limitEvents();

    const { started: refused } = await start(api.newPhoneNumber(), waiting);
    expect(refused).toMatchObject({ ok: false, status: 503, error: { code: "sms_paused" } });
    const confirm = await api.client.call(sendConfirmCodeRoute, {
      accessToken: member.accessToken,
      body: {},
    });
    expect(confirm).toMatchObject({ ok: false, status: 503, error: { code: "sms_paused" } });
    expect(api.sms.outbox).toHaveLength(sentBefore);
    // Nothing was counted against the limits either.
    expect(await limitEvents()).toBe(countedBefore);

    await turn("sms_sending", "on");
    expect((await start(api.newPhoneNumber(), waiting)).started.ok).toBe(true);
  });
});

describe("new bookings and payments paused", () => {
  it("refuses a new booking and a payment, and lets the driver still accept", async () => {
    const anna = await driverOf(north);
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 1, toStop: 3 });
    await turn("bookings_open", "off");
    expect(await paused()).toEqual(["bookings"]);

    const sara = await newMember("Sara");
    await expect(booked(sara.accessToken, north, { fromStop: 1, toStop: 3 })).rejects.toThrow(
      "503 bookings_paused",
    );
    const mine = await api.connection.db
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(eq(schema.bookings.passengerId, sara.userId));
    expect(mine).toEqual([]);

    // Accepted during the pause: it waits until the booking cut-off, 15
    // minutes before Jón gets in, as nobody can pay.
    expect(await accept(anna.accessToken, request.id)).toMatchObject({ ok: true });
    const accepted = await stored(request.id);
    const [boards] = await api.connection.db
      .select({ plannedAt: schema.tripStops.plannedAt })
      .from(schema.tripStops)
      .where(eq(schema.tripStops.id, accepted.fromStopId));
    const cutOff = new Date((boards?.plannedAt?.getTime() ?? 0) - minutes(15) * 1000);
    expect(accepted.paymentDueAt).toEqual(cutOff);
    expect(await pay(jon.accessToken, request.id)).toMatchObject({
      ok: false,
      status: 503,
      error: { code: "bookings_paused" },
    });

    // Open again: 30 minutes to pay from now.
    await later(minutes(90), anna, jon);
    await turn("bookings_open", "on");
    expect((await stored(request.id)).paymentDueAt).toEqual(
      new Date(api.now().getTime() + minutes(30) * 1000),
    );
    await paid(jon.accessToken, request.id);
    expect((await stored(request.id)).status).toBe("confirmed");
  });

  it("keeps a booking that waits for payment through the pause, and gives it its window again", async () => {
    const anna = await driverOf(north);
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 1, toStop: 3 });
    expect(await accept(anna.accessToken, request.id)).toMatchObject({ ok: true });
    const acceptedAt = api.now();
    const asAccepted = new Date(acceptedAt.getTime() + minutes(30) * 1000);
    expect((await stored(request.id)).paymentDueAt).toEqual(asAccepted);
    // The "10 minutes left to pay" reminder, as the worker would have set it.
    const { scheduledNotifications } = schema;
    const reminderKey = `pay_reminder:${request.id}`;
    await api.connection.db.insert(scheduledNotifications).values({
      key: reminderKey,
      kind: "pay_reminder",
      bookingId: request.id,
      runAt: new Date(asAccepted.getTime() - minutes(10) * 1000),
    });
    const reminder = async () =>
      (
        await api.connection.db
          .select({ runAt: scheduledNotifications.runAt, doneAt: scheduledNotifications.doneAt })
          .from(scheduledNotifications)
          .where(eq(scheduledNotifications.key, reminderKey))
      )[0];

    await later(minutes(5), anna, jon);
    await turn("bookings_open", "off");
    // An hour on, well past the 30 minutes: it has not run out.
    await later(minutes(60), anna, jon);
    expect(await expireAllDueBookings(api.connection.db, api.now())).toBe(0);
    const during = await api.client.call(bookingRoute, {
      accessToken: jon.accessToken,
      params: { id: request.id },
    });
    expect(during).toMatchObject({ ok: true, data: { status: "accepted" } });
    expect((await reminder())?.runAt.getTime()).toBeGreaterThan(api.now().getTime());

    await turn("bookings_open", "on");
    const reopenedAt = api.now();
    const due = new Date(reopenedAt.getTime() + minutes(30) * 1000);
    expect((await stored(request.id)).paymentDueAt).toEqual(due);
    expect(await reminder()).toEqual({
      runAt: new Date(due.getTime() - minutes(10) * 1000),
      doneAt: null,
    });

    // The new window runs out as any other.
    await later(minutes(31), anna, jon);
    expect(await expireAllDueBookings(api.connection.db, api.now())).toBe(1);
    expect((await stored(request.id)).status).toBe("expired");
  });

  it("leaves a deadline that is still ahead when the pause ends as it was", async () => {
    const anna = await driverOf(north);
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 1, toStop: 3 });
    expect(await accept(anna.accessToken, request.id)).toMatchObject({ ok: true });
    const asAccepted = (await stored(request.id)).paymentDueAt;
    await later(minutes(5), anna, jon);
    await turn("bookings_open", "off");
    await later(minutes(5), anna, jon);
    await turn("bookings_open", "on");
    expect((await stored(request.id)).paymentDueAt).toEqual(asAccepted);
    // A booking past its deadline before the pause is left to expire.
    const expired = await api.connection.db
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(and(eq(schema.bookings.tripId, north), eq(schema.bookings.status, "expired")));
    expect(expired).toEqual([]);
  });

  // Another server turned the switch: this one's answer is up to 5 seconds
  // old, and a deadline stored by it would be one the pause never moved.
  describe("turned on another server a moment ago", () => {
    async function turnedOffElsewhere() {
      const { settingChanges } = schema;
      const [last] = await api.connection.db
        .select({ version: max(settingChanges.version) })
        .from(settingChanges);
      await api.connection.db.insert(settingChanges).values({
        version: (last?.version ?? 0) + 1,
        key: "bookings_open",
        oldValue: 1,
        newValue: 0,
        reason: "For a test",
        changedBy: operatorId,
        createdAt: api.now(),
        updatedAt: api.now(),
      });
    }

    const cutOffOf = async (bookingId: string) => {
      const [boards] = await api.connection.db
        .select({ plannedAt: schema.tripStops.plannedAt })
        .from(schema.tripStops)
        .innerJoin(schema.bookings, eq(schema.bookings.fromStopId, schema.tripStops.id))
        .where(eq(schema.bookings.id, bookingId));
      return new Date((boards?.plannedAt?.getTime() ?? 0) - minutes(15) * 1000);
    };

    it("gives a request accepted then the deadline of the pause", async () => {
      const anna = await driverOf(north);
      const jon = await newMember("Jón");
      const request = await booked(jon.accessToken, north, { fromStop: 1, toStop: 3 });
      await turnedOffElsewhere();
      // This server has not read it yet.
      expect(await paused()).toEqual([]);

      expect(await accept(anna.accessToken, request.id)).toMatchObject({ ok: true });
      expect((await stored(request.id)).paymentDueAt).toEqual(await cutOffOf(request.id));
      await turn("bookings_open", "on");
    });

    it("gives a booking whose trip's departure moves then the deadline of the pause", async () => {
      const anna = await driverOf(north);
      const jon = await newMember("Jón");
      const request = await booked(jon.accessToken, north, { fromStop: 1, toStop: 3 });
      expect(await accept(anna.accessToken, request.id)).toMatchObject({ ok: true });
      const [trip] = await api.connection.db
        .select({ departsAt: schema.trips.departsAt })
        .from(schema.trips)
        .where(eq(schema.trips.id, north));
      await turnedOffElsewhere();
      expect(await paused()).toEqual([]);

      const moved = await api.client.call(changeTripRoute, {
        accessToken: anna.accessToken,
        params: { id: north },
        query: { preview: false },
        body: {
          kind: "departure",
          departsAt: new Date((trip?.departsAt?.getTime() ?? 0) + minutes(10) * 1000).toISOString(),
        },
      });
      expect(moved).toMatchObject({ ok: true });
      expect((await stored(request.id)).paymentDueAt).toEqual(await cutOffOf(request.id));
      await turn("bookings_open", "on");
    });

    it("makes a turn of the switch wait for a transaction that read it", async () => {
      let turned = false;
      let release = () => {};
      const reading = api.connection.db.transaction(async (tx) => {
        expect(await pausedHeldIn(tx, "bookings")).toBe(false);
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      });
      const turning = turn("bookings_open", "off").then(() => {
        turned = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(turned).toBe(false);
      release();
      await reading;
      await turning;
      expect(turned).toBe(true);
      await turn("bookings_open", "on");
    });
  });
});
