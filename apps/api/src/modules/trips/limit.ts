// The trip limit after money stays with the driver for a seat that is free
// again (rule P3, spec 17): a no-show or a late cancellation keeps its
// price while its seat can be sold once more, so the level for new bookings
// falls to what still fits.
import { schema } from "@shareride/db";
import {
  defaultTripSettings,
  fitLevelWithin,
  segmentPrice,
  type PriceSettings,
} from "@shareride/domain";
import { and, asc, eq } from "drizzle-orm";
import { takingsOfTrip, type Transaction } from "../bookings/seats.ts";

const { segments, tripChanges, trips } = schema;

/**
 * Lowers the trip's price level, and each stretch's price for new bookings,
 * to the highest that keeps a full car within the trip limit, when what is
 * booked no longer leaves room at the level it has. It is recorded as a
 * price level change with its reason; nobody is told, as for any price
 * change (spec 7, 3.3). Call it with the trip locked, after the booking's
 * status and its seats are stored. Settings are the defaults until
 * operators can change them (feature H4).
 */
export async function refitToTripLimit(
  tx: Transaction,
  tripId: string,
  now: Date,
  settings: PriceSettings = defaultTripSettings,
): Promise<void> {
  const [trip] = await tx
    .select({ status: trips.status, seats: trips.capacity, priceLevel: trips.priceLevel })
    .from(trips)
    .where(eq(trips.id, tripId));
  if (trip === undefined || trip.status === "draft" || trip.status === "cancelled") return;
  const stretches = await tx
    .select({
      position: segments.position,
      distanceM: segments.distanceM,
      occupancy: segments.occupancy,
    })
    .from(segments)
    .where(eq(segments.tripId, tripId))
    .orderBy(asc(segments.position));
  const fitted = fitLevelWithin(
    trip.priceLevel,
    {
      distancesM: stretches.map((stretch) => stretch.distanceM),
      occupancy: stretches.map((stretch) => stretch.occupancy),
      seats: trip.seats,
      takings: (await takingsOfTrip(tx, tripId)).amount,
    },
    settings,
  );
  if (!fitted.lowered) return;

  await tx
    .update(trips)
    .set({ priceLevel: fitted.level, updatedAt: now })
    .where(eq(trips.id, tripId));
  for (const stretch of stretches) {
    await tx
      .update(segments)
      .set({ price: segmentPrice(stretch.distanceM, fitted.level, trip.seats, settings).amount })
      .where(and(eq(segments.tripId, tripId), eq(segments.position, stretch.position)));
  }
  await tx.insert(tripChanges).values({
    tripId,
    kind: "priceLevel",
    before: { priceLevel: trip.priceLevel },
    after: { priceLevel: fitted.level, reason: "trip_limit" },
    changedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}
