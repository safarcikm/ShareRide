// The console's Disputes page (spec 8, 3.5; milestone 7, PR 5c): the
// contested reports, what the system knows about each, the operator's
// decision through `decideDispute`, and the booking's conversation through
// `readConversationAsOperator`, which logs each opening (R9.6).
import type {
  AdminConversationMessage,
  AdminDecideDisputeBody,
  AdminDispute,
  AdminDisputeListItem,
} from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  decidableOutcomes,
  ok,
  type DisputeAnswer,
  type DisputeKind,
  type DisputeOutcome,
  type Result,
  type TripDaySettings,
} from "@shareride/domain";
import { and, asc, desc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AuditEntry } from "../admin/audit.ts";
import { readConversationAsOperator, type ReadingRefused } from "../chat/operator.ts";
import { decideDispute, type DecideError } from "./decide.ts";
import { answerByOf, asRule } from "./disputes.ts";

const { bookings, checkIns, disputes, meetingPoints, tripStops, trips, users } = schema;

/** The last decided reports the list shows. */
const decidedShown = 50;

/** Who acts in the console, for the audit log. */
export interface ConsoleActor {
  readonly operator: AuditEntry["operator"];
  readonly request: AuditEntry["request"];
}

export interface DisputeAdminService {
  list(state: "waiting" | "decided"): Promise<readonly AdminDisputeListItem[]>;
  get(id: string): Promise<AdminDispute | undefined>;
  decide(
    id: string,
    body: AdminDecideDisputeBody,
    actor: ConsoleActor,
  ): Promise<Result<AdminDispute, DecideError>>;
  /** The booking's messages, for a contested report only (R9.6). */
  conversation(
    id: string,
    actor: ConsoleActor,
  ): Promise<Result<readonly AdminConversationMessage[], ReadingRefused>>;
}

const driver = alias(users, "driver");
const passenger = alias(users, "passenger");
const fromStop = alias(tripStops, "from_stop");
const toStop = alias(tripStops, "to_stop");
const fromPoint = alias(meetingPoints, "from_point");
const toPoint = alias(meetingPoints, "to_point");

const nameOf = (point: { nameIs: string; nameEn: string | null }) => ({
  is: point.nameIs,
  en: point.nameEn ?? point.nameIs,
});

const iso = (at: Date | null) => at?.toISOString() ?? null;

export function createDisputeAdminService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly settings: TripDaySettings;
}): DisputeAdminService {
  const { db, clock, settings } = dependencies;

  /** Reports with their people and the passenger's stops. */
  function reports(where: SQL | undefined) {
    return db
      .select({
        dispute: disputes,
        tripId: bookings.tripId,
        arrivesAt: trips.arrivesAt,
        seats: bookings.seats,
        driver: { userId: driver.id, firstName: driver.firstName },
        passenger: { userId: passenger.id, firstName: passenger.firstName },
        from: { nameIs: fromPoint.nameIs, nameEn: fromPoint.nameEn, plannedAt: fromStop.plannedAt },
        to: { nameIs: toPoint.nameIs, nameEn: toPoint.nameEn, plannedAt: toStop.plannedAt },
        fromStopId: bookings.fromStopId,
        toStopId: bookings.toStopId,
      })
      .from(disputes)
      .innerJoin(bookings, eq(bookings.id, disputes.bookingId))
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .innerJoin(driver, eq(driver.id, trips.driverId))
      .innerJoin(passenger, eq(passenger.id, bookings.passengerId))
      .innerJoin(fromStop, eq(fromStop.id, bookings.fromStopId))
      .innerJoin(fromPoint, eq(fromPoint.id, fromStop.meetingPointId))
      .innerJoin(toStop, eq(toStop.id, bookings.toStopId))
      .innerJoin(toPoint, eq(toPoint.id, toStop.meetingPointId))
      .where(where)
      .$dynamic();
  }

  type Found = Awaited<ReturnType<ReturnType<typeof reports>["execute"]>>[number];

  function listItem(found: Found): AdminDisputeListItem {
    const { dispute } = found;
    return {
      id: dispute.id,
      kind: dispute.kind as DisputeKind,
      raisedAt: dispute.raisedAt.toISOString(),
      answeredAt: iso(dispute.answeredAt),
      outcome: dispute.outcome as DisputeOutcome | null,
      decidedAt: iso(dispute.decidedAt),
      driver: found.driver,
      passenger: found.passenger,
      from: { name: nameOf(found.from), plannedAt: iso(found.from.plannedAt) },
      to: { name: nameOf(found.to), plannedAt: iso(found.to.plannedAt) },
    };
  }

  async function get(id: string): Promise<AdminDispute | undefined> {
    const [found] = await reports(eq(disputes.id, id));
    if (found === undefined) return undefined;
    const { dispute } = found;
    const stops = await db
      .select({
        id: tripStops.id,
        nameIs: meetingPoints.nameIs,
        nameEn: meetingPoints.nameEn,
        plannedAt: tripStops.plannedAt,
      })
      .from(tripStops)
      .innerJoin(meetingPoints, eq(meetingPoints.id, tripStops.meetingPointId))
      .where(and(eq(tripStops.tripId, found.tripId), isNull(tripStops.removedAt)))
      .orderBy(asc(tripStops.position));
    const said = await db
      .select({
        tripStopId: checkIns.tripStopId,
        bookingId: checkIns.bookingId,
        checkedInAt: checkIns.checkedInAt,
      })
      .from(checkIns)
      .where(
        inArray(
          checkIns.tripStopId,
          stops.map((stop) => stop.id),
        ),
      );
    const driverHere = new Map(
      said.filter((one) => one.bookingId === null).map((one) => [one.tripStopId, one.checkedInAt]),
    );
    const passengerHere = said.find((one) => one.bookingId === dispute.bookingId);
    return {
      ...listItem(found),
      bookingId: dispute.bookingId,
      tripId: found.tripId,
      seats: found.seats,
      note: dispute.note,
      answer: dispute.answer as DisputeAnswer | null,
      answerNote: dispute.answerNote,
      // As the two sides see it: a booked trip's last stop has its time.
      answerBy: answerByOf(dispute, found.arrivesAt ?? new Date(0), settings).toISOString(),
      decidedBy: dispute.decidedBy as "system" | "operator" | null,
      decisionNote: dispute.decisionNote,
      passengerHereAt: iso(passengerHere?.checkedInAt ?? null),
      stops: stops.map((stop) => ({
        name: nameOf(stop),
        plannedAt: iso(stop.plannedAt),
        driverHereAt: iso(driverHere.get(stop.id) ?? null),
        boards: stop.id === found.fromStopId,
        alights: stop.id === found.toStopId,
      })),
      outcomes: [...decidableOutcomes(asRule(dispute))],
    };
  }

  return {
    async list(state) {
      // Waiting is as `decidableOutcomes` has it: contested and still open.
      const found =
        state === "waiting"
          ? await reports(and(eq(disputes.answer, "contested"), isNull(disputes.outcome))).orderBy(
              asc(disputes.raisedAt),
              asc(disputes.id),
            )
          : await reports(eq(disputes.decidedBy, "operator"))
              .orderBy(desc(disputes.decidedAt), desc(disputes.id))
              .limit(decidedShown);
      return found.map(listItem);
    },

    get,

    async decide(id, body, actor) {
      const decided = await decideDispute(
        db,
        { ...actor, disputeId: id, outcome: body.outcome, note: body.note },
        clock(),
      );
      if (!decided.ok) return decided;
      const shown = await get(id);
      if (shown === undefined) throw new Error("A decided report stays.");
      return ok(shown);
    },

    conversation(id, actor) {
      return readConversationAsOperator(db, { subject: { type: "dispute", id }, ...actor });
    },
  };
}
