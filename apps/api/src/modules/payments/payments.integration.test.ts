import {
  acceptRequestRoute,
  bookingRoute,
  startPaymentRoute,
  testPaymentRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.ts";
import { createLogger } from "../../logger.ts";
import type { PaymentProvider } from "../../platform/payments.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import { expireAllDueBookings, lockTrip } from "../bookings/index.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  hours,
  sampleTrip,
  seedForBookings,
} from "../bookings/testing.ts";
import { createPaymentService } from "./service.ts";

// Jón's airport trip is instant: a booking waits 30 minutes for payment
// (rule M1). Anna's trip north takes requests.

let api: TestApi;

const { north, airport } = sampleTrip;

beforeAll(async () => {
  api = await startTestApi();
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

const { newMember, later, rewind, driverOf, booked, occupancy } = bookingHelpers(() => api);

async function startPaying(accessToken: string, bookingId: string) {
  return api.client.call(startPaymentRoute, { accessToken, params: { id: bookingId }, body: {} });
}

async function testOutcome(
  accessToken: string,
  paymentId: string,
  outcome: "succeeded" | "failed",
) {
  return api.client.call(testPaymentRoute, {
    accessToken,
    params: { id: paymentId },
    body: { outcome },
  });
}

async function paymentStatus(paymentId: string) {
  const [row] = await api.connection.db
    .select({ status: schema.payments.status })
    .from(schema.payments)
    .where(eq(schema.payments.id, paymentId));
  return row?.status;
}

describe("POST /v1/bookings/{id}/payment (spec 5, 3.5; rule M1)", () => {
  it("starts paying for an accepted booking, and a retry picks up the same payment", async () => {
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 3 });
    const first = await startPaying(gunna.accessToken, booking.id);
    expect(first).toMatchObject({
      status: 200,
      data: { provider: "test", amount: booking.total, dueAt: booking.paymentDueAt },
    });
    const again = await startPaying(gunna.accessToken, booking.id);
    expect(again.ok && first.ok && again.data.paymentId === first.data.paymentId).toBe(true);
  });

  it("refuses a request, a booking already paid and anyone else's booking", async () => {
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    expect(await startPaying(jon.accessToken, request.id)).toMatchObject({
      status: 409,
      error: { code: "booking_not_payable" },
    });
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    expect(await startPaying(jon.accessToken, booking.id)).toMatchObject({ status: 404 });
    const payment = await startPaying(gunna.accessToken, booking.id);
    if (!payment.ok) throw new Error(payment.error.code);
    await testOutcome(gunna.accessToken, payment.data.paymentId, "succeeded");
    expect(await startPaying(gunna.accessToken, booking.id)).toMatchObject({
      status: 409,
      error: { code: "booking_not_payable" },
    });
  });

  it("is unavailable without a payment provider, which has no test route either", async () => {
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    // A payment started while the test provider was on, which only its route could settle.
    const pending = await startPaying(gunna.accessToken, booking.id);
    if (!pending.ok) throw new Error(pending.error.code);
    const { db, sms, hasher, exportCipher, clock, clientAddress, secureCookies } = api.features;
    const app = createApp({
      logger: createLogger({ level: "silent" }),
      checkDatabase: () => Promise.resolve(),
      features: { db, sms, hasher, exportCipher, clock, clientAddress, secureCookies },
    });
    const post = (path: string, body: object) =>
      app.request(path, {
        method: "POST",
        headers: {
          authorization: `Bearer ${gunna.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const started = await post(`/v1/bookings/${booking.id}/payment`, {});
    expect(started.status).toBe(503);
    expect(await started.json()).toMatchObject({ error: { code: "payments_unavailable" } });
    const outcome = await post(`/v1/test-payments/${pending.data.paymentId}`, {
      outcome: "succeeded",
    });
    expect(outcome.status).toBe(404);
    expect(await outcome.json()).toEqual({
      error: { code: "not_found", message: "There is no such endpoint." },
    });
    expect(await paymentStatus(pending.data.paymentId)).toBe("pending");
  });
});

describe("POST /v1/test-payments/{id}: the test provider's outcome (R13.3)", () => {
  it("confirms the booking when paid within the window, once", async () => {
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 3 });
    const payment = await startPaying(gunna.accessToken, booking.id);
    if (!payment.ok) throw new Error(payment.error.code);
    const stranger = await newMember("Óli");
    expect(
      await testOutcome(stranger.accessToken, payment.data.paymentId, "succeeded"),
    ).toMatchObject({ status: 404 });
    expect(await testOutcome(gunna.accessToken, payment.data.paymentId, "succeeded")).toMatchObject(
      {
        status: 200,
        data: { id: booking.id, status: "confirmed", paymentDueAt: null, confirmed: {} },
      },
    );
    expect(await paymentStatus(payment.data.paymentId)).toBe("succeeded");
    expect(await testOutcome(gunna.accessToken, payment.data.paymentId, "failed")).toMatchObject({
      status: 409,
      error: { code: "payment_settled" },
    });
    expect(await occupancy(airport)).toEqual([1, 1, 1]);
  });

  it("takes one outcome when several come at once", async () => {
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 3 });
    const payment = await startPaying(gunna.accessToken, booking.id);
    if (!payment.ok) throw new Error(payment.error.code);
    const outcomes = await Promise.all(
      (["succeeded", "succeeded", "failed", "succeeded"] as const).map((outcome) =>
        testOutcome(gunna.accessToken, payment.data.paymentId, outcome),
      ),
    );
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    const refused = outcomes.flatMap((outcome) => (outcome.ok ? [] : [outcome.error.code]));
    expect(refused).toEqual(["payment_settled", "payment_settled", "payment_settled"]);
    expect(await occupancy(airport)).toEqual([1, 1, 1]);
  });

  it("leaves the booking waiting when a payment fails, so the passenger can pay again", async () => {
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 3 });
    const failing = await startPaying(gunna.accessToken, booking.id);
    if (!failing.ok) throw new Error(failing.error.code);
    expect(await testOutcome(gunna.accessToken, failing.data.paymentId, "failed")).toMatchObject({
      status: 200,
      data: { status: "accepted" },
    });
    expect(await paymentStatus(failing.data.paymentId)).toBe("failed");
    const second = await startPaying(gunna.accessToken, booking.id);
    if (!second.ok) throw new Error(second.error.code);
    expect(second.data.paymentId).not.toBe(failing.data.paymentId);
    expect(await testOutcome(gunna.accessToken, second.data.paymentId, "succeeded")).toMatchObject({
      data: { status: "confirmed" },
    });
  });

  it("refunds a payment that succeeds after the window closed, and the seats stay free", async () => {
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 3 });
    const payment = await startPaying(gunna.accessToken, booking.id);
    if (!payment.ok) throw new Error(payment.error.code);
    await later(30 * 60, gunna);
    expect(await testOutcome(gunna.accessToken, payment.data.paymentId, "succeeded")).toMatchObject(
      {
        status: 200,
        data: { status: "expired", confirmed: null },
      },
    );
    expect(await paymentStatus(payment.data.paymentId)).toBe("refunded");
    expect(await occupancy(airport)).toEqual([0, 0, 0]);
  });

  it("pays for an accepted request the same way", async () => {
    const anna = await driverOf(north);
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 1, toStop: 2 });
    await api.client.call(acceptRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: request.id },
      body: {},
    });
    const payment = await startPaying(jon.accessToken, request.id);
    if (!payment.ok) throw new Error(payment.error.code);
    await testOutcome(jon.accessToken, payment.data.paymentId, "succeeded");
    expect(
      await api.client.call(bookingRoute, {
        accessToken: anna.accessToken,
        params: { id: request.id },
      }),
    ).toMatchObject({ data: { status: "confirmed", viewer: "driver" } });
  });
});

describe("the provider (spec 13)", () => {
  function spyProvider() {
    let checkouts = 0;
    const startCheckout = vi.fn(() => {
      checkouts += 1;
      return Promise.resolve({ providerRef: `checkout_${String(checkouts)}` });
    });
    const refund = vi.fn(() => Promise.resolve());
    const provider: PaymentProvider = { name: "test", startCheckout, refund };
    const payments = createPaymentService({
      db: api.connection.db,
      clock: () => api.now(),
      provider,
    });
    return { startCheckout, refund, payments };
  }

  async function providerRef(paymentId: string) {
    const [row] = await api.connection.db
      .select({ providerRef: schema.payments.providerRef })
      .from(schema.payments)
      .where(eq(schema.payments.id, paymentId));
    return row?.providerRef;
  }

  it("opens one checkout per payment, and refunds a late success in full", async () => {
    const { startCheckout, refund, payments } = spyProvider();
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 2 });
    const first = await payments.start(gunna.userId, booking.id);
    const again = await payments.start(gunna.userId, booking.id);
    if (!first.ok || !again.ok) throw new Error("not started");
    const { paymentId } = first.value;
    expect(again.value.paymentId).toBe(paymentId);
    expect(startCheckout).toHaveBeenCalledExactlyOnceWith({ paymentId, amount: booking.total });

    await later(30 * 60);
    expect(await payments.settle(paymentId, "succeeded")).toEqual({
      ok: true,
      value: { bookingId: booking.id },
    });
    expect(refund).toHaveBeenCalledExactlyOnceWith({
      paymentId,
      providerRef: "checkout_1",
      amount: booking.total,
    });
    expect(await paymentStatus(paymentId)).toBe("refunded");
  });

  it("keeps the first checkout when two starts ask at once", async () => {
    const { startCheckout, payments } = spyProvider();
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 2 });
    // The first call's answer comes last, after the other start has stored its own.
    const slow = Promise.withResolvers<{ providerRef: string }>();
    startCheckout.mockImplementationOnce(() => slow.promise);
    const starts = [
      payments.start(gunna.userId, booking.id),
      payments.start(gunna.userId, booking.id),
    ];
    await Promise.race(starts);
    slow.resolve({ providerRef: "checkout_slow" });
    const [first, second] = await Promise.all(starts);
    if (first?.ok !== true || second?.ok !== true) throw new Error("not started");
    expect(first.value.paymentId).toBe(second.value.paymentId);
    expect(startCheckout).toHaveBeenCalledTimes(2);
    expect(await providerRef(first.value.paymentId)).toBe("checkout_1");
  });

  it("owes a refund the provider failed to take, and asks again until it does", async () => {
    const { refund, payments } = spyProvider();
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 2 });
    const started = await payments.start(gunna.userId, booking.id);
    if (!started.ok) throw new Error(started.error.code);
    const { paymentId } = started.value;
    await later(30 * 60);
    refund.mockRejectedValueOnce(new Error("provider away"));
    await expect(payments.settle(paymentId, "succeeded")).rejects.toThrow("provider away");
    expect(await paymentStatus(paymentId)).toBe("refund_due");
    // The provider's confirmation, sent again, is not a second payment.
    expect(await payments.settle(paymentId, "succeeded")).toEqual({
      ok: false,
      error: { code: "payment_settled" },
    });

    refund.mockRejectedValueOnce(new Error("still away"));
    await expect(payments.refundOwed()).rejects.toThrow("1 owed refunds failed.");
    expect(await paymentStatus(paymentId)).toBe("refund_due");
    expect(await payments.refundOwed()).toBe(1);
    expect(await paymentStatus(paymentId)).toBe("refunded");
    expect(await payments.refundOwed()).toBe(0);
    expect(refund).toHaveBeenCalledTimes(3);
    expect(refund).toHaveBeenLastCalledWith({
      paymentId,
      providerRef: "checkout_1",
      amount: booking.total,
    });
  });
});

describe("the deadline job (R5.5, rule M1)", () => {
  it("stores the expiry of requests and unpaid bookings on every trip, and frees their seats", async () => {
    const jon = await newMember("Jón");
    const gunna = await newMember("Gunna");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 3 });
    const unpaid = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 2 });
    const paid = await booked(jon.accessToken, airport, { fromStop: 2, toStop: 3 });
    const payment = await startPaying(jon.accessToken, paid.id);
    if (!payment.ok) throw new Error(payment.error.code);
    await testOutcome(jon.accessToken, payment.data.paymentId, "succeeded");

    expect(await expireAllDueBookings(api.connection.db, api.now())).toBe(0);
    await later(hours(1));
    // The unpaid booking's 30 minutes are over; the request has 12 hours.
    expect(await expireAllDueBookings(api.connection.db, api.now())).toBe(1);
    expect(await occupancy(airport)).toEqual([0, 0, 1]);
    const [stored] = await api.connection.db
      .select({ status: schema.bookings.status })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, unpaid.id));
    expect(stored?.status).toBe("expired");

    await later(hours(12));
    expect(await expireAllDueBookings(api.connection.db, api.now())).toBe(1);
    expect(await occupancy(north)).toEqual([0, 0, 0]);
    expect(await expireAllDueBookings(api.connection.db, api.now())).toBe(0);
  });

  it("leaves a trip that is being changed for the next run, without waiting", async () => {
    const gunna = await newMember("Gunna");
    await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    await later(hours(1));
    const { db } = api.connection;
    const locked = Promise.withResolvers<undefined>();
    const released = Promise.withResolvers<undefined>();
    const changing = db.transaction(async (tx) => {
      await lockTrip(tx, airport);
      locked.resolve(undefined);
      await released.promise;
    });
    await locked.promise;
    try {
      expect(await expireAllDueBookings(db, api.now())).toBe(0);
    } finally {
      released.resolve(undefined);
      await changing;
    }
    expect(await expireAllDueBookings(db, api.now())).toBe(1);
  });
});
