import type { Payment } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  err,
  nextStatus,
  ok,
  settlePayment,
  type BookingStatus,
  type Money,
  type PaymentOutcome,
  type PaymentStatus,
  type Result,
} from "@shareride/domain";
import { and, eq, isNull } from "drizzle-orm";
import type { PaymentProvider } from "../../platform/payments.ts";
import { bookingConfirmed } from "../bookings/confirmed.ts";
import { expireDueBookings, lockTrip } from "../bookings/seats.ts";

const { bookings, payments } = schema;

export interface NotFound {
  readonly code: "not_found";
}

export type StartPaymentError =
  NotFound | { readonly code: "booking_not_payable" } | { readonly code: "payments_unavailable" };

export type SettleError = NotFound | { readonly code: "payment_settled" };

export interface PaymentService {
  /** Starts paying for the passenger's accepted booking, or picks up the payment already started. */
  start(passengerId: string, bookingId: string): Promise<Result<Payment, StartPaymentError>>;
  /**
   * What the provider's outcome does (R13.3): what its signed confirmation
   * will call (spec 13). `payerId`, when given, must be the booking's
   * passenger, as for the test provider's route. Answers the booking's ID.
   */
  settle(
    paymentId: string,
    outcome: PaymentOutcome,
    payerId?: string,
  ): Promise<Result<{ readonly bookingId: string }, SettleError>>;
  /**
   * Asks the provider again for every refund still owed, such as one whose
   * call failed; returns how many it made. Throws once it has tried them all
   * if any failed. The deadline job runs it every minute.
   */
  refundOwed(): Promise<number>;
}

const isk = (amount: number): Money => ({ amount, currency: "ISK" });

export function createPaymentService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  /** None: paying is unavailable (PAYMENT_PROVIDER=none). */
  readonly provider: PaymentProvider | undefined;
}): PaymentService {
  const { db, clock, provider } = dependencies;

  /**
   * Pays an owed refund back through the provider, then marks it refunded.
   * The status says it is owed until the provider has taken it, so a failed
   * call is retried; the payment's ID keeps a retry from paying twice.
   */
  async function refund(payment: typeof payments.$inferSelect): Promise<void> {
    if (provider === undefined) throw new Error("A refund is owed, and no provider is set up.");
    if (payment.providerRef === null) {
      throw new Error("A refund is owed for a payment the provider has no reference for.");
    }
    await provider.refund({
      paymentId: payment.id,
      providerRef: payment.providerRef,
      amount: isk(payment.amount),
    });
    const now = clock();
    await db
      .update(payments)
      .set({ status: "refunded", updatedAt: now })
      .where(and(eq(payments.id, payment.id), eq(payments.status, "refund_due")));
  }

  return {
    async start(passengerId, bookingId) {
      if (provider === undefined) return err({ code: "payments_unavailable" });
      const [found] = await db
        .select({ tripId: bookings.tripId })
        .from(bookings)
        .where(and(eq(bookings.id, bookingId), eq(bookings.passengerId, passengerId)));
      if (found === undefined) return err({ code: "not_found" });

      const started = await db.transaction(async (tx) => {
        // As every change to the trip's bookings: lock the trip, then store expiries.
        await lockTrip(tx, found.tripId);
        const now = clock();
        await expireDueBookings(tx, found.tripId, now);
        const [booking] = await tx.select().from(bookings).where(eq(bookings.id, bookingId));
        if (booking?.status !== "accepted" || booking.paymentDueAt === null) {
          return err({ code: "booking_not_payable" as const });
        }
        const [pending] = await tx
          .select()
          .from(payments)
          .where(and(eq(payments.bookingId, bookingId), eq(payments.status, "pending")));
        const payment =
          pending ??
          (
            await tx
              .insert(payments)
              .values({
                bookingId,
                provider: provider.name,
                amount: booking.totalPrice,
                createdAt: now,
                updatedAt: now,
              })
              .returning()
          )[0];
        if (payment === undefined) throw new Error("The payment was not stored.");
        return ok({ payment, dueAt: booking.paymentDueAt });
      });
      if (!started.ok) return started;

      const { payment, dueAt } = started.value;
      // The provider is called outside the transaction, so no lock waits on
      // it. Two starts at once both ask; the payment's ID makes it the same
      // checkout, and only the first reference is kept.
      if (payment.providerRef === null) {
        const { providerRef } = await provider.startCheckout({
          paymentId: payment.id,
          amount: isk(payment.amount),
        });
        await db
          .update(payments)
          .set({ providerRef, updatedAt: clock() })
          .where(and(eq(payments.id, payment.id), isNull(payments.providerRef)));
      }
      return ok({
        paymentId: payment.id,
        provider: provider.name,
        amount: isk(payment.amount),
        dueAt: dueAt.toISOString(),
      });
    },

    async settle(paymentId, outcome, payerId) {
      const [found] = await db
        .select({
          bookingId: bookings.id,
          tripId: bookings.tripId,
          passengerId: bookings.passengerId,
        })
        .from(payments)
        .innerJoin(bookings, eq(bookings.id, payments.bookingId))
        .where(eq(payments.id, paymentId));
      if (found === undefined || (payerId !== undefined && payerId !== found.passengerId)) {
        return err({ code: "not_found" });
      }

      const settled = await db.transaction(async (tx) => {
        await lockTrip(tx, found.tripId);
        const now = clock();
        // A deadline that has passed is stored first, so a late payment is refunded.
        await expireDueBookings(tx, found.tripId, now);
        const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId));
        const [booking] = await tx.select().from(bookings).where(eq(bookings.id, found.bookingId));
        if (payment === undefined || booking === undefined) throw new Error("Not stored.");
        const status = booking.status as BookingStatus;
        const result = settlePayment({
          booking: {
            status,
            requestExpiresAt: booking.expiresAt,
            paymentDueAt: booking.paymentDueAt,
          },
          payment: payment.status as PaymentStatus,
          outcome,
          now,
        });
        if (!result.ok) return result;
        await tx
          .update(payments)
          .set({ status: result.value.payment, settledAt: now, updatedAt: now })
          .where(eq(payments.id, paymentId));
        if (result.value.confirm) {
          const next = nextStatus(status, "pay");
          if (!next.ok) throw new Error("Only an accepted booking is paid for.");
          await tx
            .update(bookings)
            .set({ status: next.value, confirmedAt: now, updatedAt: now })
            .where(eq(bookings.id, booking.id));
          await bookingConfirmed(tx, { id: booking.id, tripId: found.tripId }, now);
        }
        return ok({ owed: result.value.payment === "refund_due" ? payment : null });
      });
      if (!settled.ok) return settled;

      // After the commit, so no lock waits on the provider. If it fails, the
      // refund stays owed and the deadline job asks again.
      if (settled.value.owed !== null) await refund(settled.value.owed);
      return ok({ bookingId: found.bookingId });
    },

    async refundOwed() {
      const owed = await db.select().from(payments).where(eq(payments.status, "refund_due"));
      const failures: unknown[] = [];
      for (const payment of owed) {
        try {
          await refund(payment);
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, `${String(failures.length)} owed refunds failed.`);
      }
      return owed.length;
    },
  };
}
