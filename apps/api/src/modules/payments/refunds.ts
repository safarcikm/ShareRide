import { schema } from "@shareride/db";
import type { Money } from "@shareride/domain";
import { and, eq } from "drizzle-orm";
import type { Transaction } from "../bookings/seats.ts";

const { payments } = schema;

/**
 * Owes the passenger back what they paid for a cancelled booking (rule M2):
 * its payment becomes `refund_due` in the transaction that cancels, and the
 * refund job pays it back through the provider, once.
 */
export async function oweRefund(
  tx: Transaction,
  bookingId: string,
  refund: Money,
  now: Date,
): Promise<void> {
  const owed = await tx
    .update(payments)
    .set({ status: "refund_due", updatedAt: now })
    .where(and(eq(payments.bookingId, bookingId), eq(payments.status, "succeeded")))
    .returning({ amount: payments.amount });
  // Refunds are all or nothing, and a confirmed booking was paid once, in full.
  if (owed.length !== 1 || owed[0]?.amount !== refund.amount) {
    throw new Error("A refund is owed that is not the booking's one payment.");
  }
}
