import type { TripDetails } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  err,
  ok,
  tripPart,
  type CarColour,
  type InvalidPart,
  type PartChoice,
  type Result,
  type SearchSettings,
  type TripStatus,
} from "@shareride/domain";
import { and, asc, eq, ne } from "drizzle-orm";
import { toSummary } from "../meeting-points/service.ts";
import { choicesOf } from "../trips/drafts.ts";

const { meetingPoints, segments, trips, tripStops, users, vehicles } = schema;

export type TripDetailsError = { readonly code: "not_found" } | InvalidPart;

export interface TripDetailsService {
  /** A trip anyone can open by link (R4.6), for one part of it; drafts are nobody's to see. */
  details(
    id: string,
    choice: PartChoice,
    viewerId: string | null,
  ): Promise<Result<TripDetails, TripDetailsError>>;
}

export function createTripDetailsService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly settings: Pick<SearchSettings, "bookingCutoffMinutes">;
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
      if (found === undefined) return err({ code: "not_found" });
      const { trip } = found;

      const [stopRows, segmentRows] = await Promise.all([
        db
          .select({ stop: tripStops, point: meetingPoints })
          .from(tripStops)
          .innerJoin(meetingPoints, eq(meetingPoints.id, tripStops.meetingPointId))
          .where(eq(tripStops.tripId, id))
          .orderBy(asc(tripStops.position)),
        db.select().from(segments).where(eq(segments.tripId, id)).orderBy(asc(segments.position)),
      ]);
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
          segments: segmentRows.map((row) => ({ price: row.price, occupancy: row.occupancy })),
        },
        choice,
        viewerId,
        clock(),
        settings,
      );
      if (!part.ok) return part;

      const { car } = found;
      const choices = choicesOf(trip);
      return ok({
        id: trip.id,
        stops: stopRows.map((row, position) => ({
          position,
          meetingPoint: toSummary(row.point),
          plannedAt: (stops[position]?.plannedAt ?? new Date(0)).toISOString(),
        })),
        part: part.value,
        seatsOffered: trip.capacity,
        driver: { firstName: found.firstName ?? "" },
        car:
          car === null
            ? null
            : { make: car.make, model: car.model, colour: car.colour as CarColour },
        preferences: choices.preferences,
        note: trip.note,
        bookingMode: choices.bookingMode,
      });
    },
  };
}
