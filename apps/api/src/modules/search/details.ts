import type { TripDetails } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  err,
  holdsSeats,
  ok,
  peopleColourOf,
  statusAt,
  tripPageOpen,
  tripPart,
  type CarColour,
  type InvalidPart,
  type PartChoice,
  type BookingStatus,
  type Result,
  type SearchSettings,
  type TripStatus,
} from "@shareride/domain";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { occupancyNow } from "../bookings/seats.ts";
import { toSummary } from "../meeting-points/service.ts";
import { closedTrips } from "../safety/blocks.ts";
import { choicesOf } from "../trips/drafts.ts";

const { bookings, meetingPoints, segments, trips, tripStops, users, vehicles } = schema;

export type TripDetailsError = { readonly code: "not_found" } | InvalidPart;

export interface TripDetailsService {
  /**
   * A trip anyone can open by link (R4.6), for one part of it, until a week
   * after its last stop (Q17); drafts are nobody's to see.
   */
  details(
    id: string,
    choice: PartChoice,
    viewerId: string | null,
  ): Promise<Result<TripDetails, TripDetailsError>>;
}

export function createTripDetailsService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly settings: Pick<SearchSettings, "bookingCutoffMinutes" | "tripPageDaysAfter">;
}): TripDetailsService {
  const { db, clock, settings } = dependencies;

  return {
    async details(id, choice, viewerId) {
      const [found] = await db
        .select({
          trip: trips,
          firstName: users.firstName,
          car: { make: vehicles.make, model: vehicles.model, colour: vehicles.colour },
        })
        .from(trips)
        .innerJoin(users, eq(users.id, trips.driverId))
        .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
        .where(and(eq(trips.id, id), ne(trips.status, "draft")));
      const now = clock();
      if (found === undefined) return err({ code: "not_found" });
      const { trip } = found;
      const lastStopAt = trip.arrivesAt ?? trip.departsAt;
      if (
        lastStopAt === null ||
        !tripPageOpen({ status: trip.status as TripStatus, lastStopAt }, now, settings)
      ) {
        return err({ code: "not_found" });
      }
      // Closed by a block: as if it did not exist (R9.4).
      if ((await closedTrips(db, viewerId, [id])).has(id)) return err({ code: "not_found" });

      const [stopRows, segmentRows, mine, asOfNow] = await Promise.all([
        db
          .select({ stop: tripStops, point: meetingPoints })
          .from(tripStops)
          .innerJoin(meetingPoints, eq(meetingPoints.id, tripStops.meetingPointId))
          // A stop removed is no longer the trip's (spec 6, 3.2).
          .where(and(eq(tripStops.tripId, id), isNull(tripStops.removedAt)))
          .orderBy(asc(tripStops.position)),
        db.select().from(segments).where(eq(segments.tripId, id)).orderBy(asc(segments.position)),
        viewerId === null
          ? []
          : db
              .select({
                id: bookings.id,
                status: bookings.status,
                requestExpiresAt: bookings.expiresAt,
                paymentDueAt: bookings.paymentDueAt,
              })
              .from(bookings)
              .innerJoin(tripStops, eq(tripStops.id, bookings.fromStopId))
              .where(
                and(
                  eq(bookings.tripId, id),
                  eq(bookings.passengerId, viewerId),
                  inArray(bookings.status, ["requested", "accepted", "confirmed"]),
                ),
              )
              .orderBy(asc(tripStops.position)),
        occupancyNow(db, [id], now),
      ]);
      // The first stretch the viewer has seats on, if any (spec 5).
      const myBooking = mine
        .map((row) => ({
          id: row.id,
          status: statusAt({ ...row, status: row.status as BookingStatus }, now),
        }))
        .find((booking) => holdsSeats(booking.status));
      const stops = stopRows.map((row) => ({
        meetingPointId: row.point.id,
        // Every stop of a published trip has its time.
        plannedAt: row.stop.plannedAt ?? new Date(0),
      }));

      const part = tripPart(
        {
          id: trip.id,
          driverId: trip.driverId,
          status: trip.status as TripStatus,
          capacity: trip.capacity,
          stops,
          segments: segmentRows.map((row) => ({
            price: row.price,
            occupancy: asOfNow(id, row.position, row.occupancy),
          })),
        },
        choice,
        viewerId,
        now,
        settings,
      );
      if (!part.ok) return part;

      const { car } = found;
      const choices = choicesOf(trip);
      return ok({
        id: trip.id,
        stops: stopRows.map((row, position) => ({
          position,
          meetingPoint: {
            ...toSummary(row.point),
            status: row.point.status as TripDetails["stops"][number]["meetingPoint"]["status"],
          },
          plannedAt: (stops[position]?.plannedAt ?? new Date(0)).toISOString(),
        })),
        part: part.value,
        seatsOffered: trip.capacity,
        driver: { firstName: found.firstName ?? "", colour: peopleColourOf(trip.driverId) },
        car:
          car === null
            ? null
            : { make: car.make, model: car.model, colour: car.colour as CarColour },
        preferences: choices.preferences,
        note: trip.note,
        bookingMode: choices.bookingMode,
        myBooking: myBooking ?? null,
      });
    },
  };
}
