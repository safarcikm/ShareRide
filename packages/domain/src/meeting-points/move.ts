// Moving a meeting point in use (spec 2, 3.6.6; rule R2.10): its legs are
// computed again, and when it moved far, the drivers and passengers of the
// trips still to stop there are told. A draft's spot is edited in its form;
// a retired point stays where it was (R2.2).
import { err, ok, type Result } from "../result.ts";
import { metresBetween } from "../roads/road-file.ts";
import { keepsLegs, type MeetingPointStatus } from "./catalogue.ts";
import { withinIceland, type Position } from "./coordinates.ts";

export interface MoveSettings {
  /** Moved further than this, the trips that stop there are told (R2.10, a setting). */
  readonly tellBeyondMetres: number;
}

export const moveSettings: MoveSettings = { tellBeyondMetres: 50 };

/** Whether a point with this status moves with its own step: those in service. */
export function canMove(status: MeetingPointStatus): boolean {
  return keepsLegs(status);
}

/** How far a point moved, in whole metres. */
export function metresMoved(before: Position, after: Position): number {
  return Math.round(metresBetween(before, after));
}

/** Moved far enough that the trips still to stop there are told (R2.10). */
export function pointMovedFar(
  before: Position,
  after: Position,
  settings: MoveSettings = moveSettings,
): boolean {
  return metresBetween(before, after) > settings.tellBeyondMetres;
}

export type MoveIssue = "outside_iceland" | "same_place";

const rounded = (degrees: number) => Math.round(degrees * 1e6) / 1e6;

/**
 * The new spot, kept to six decimals (about ten centimetres) like a
 * draft's: in Iceland, and not where the point is already.
 */
export function validateMove(before: Position, after: Position): Result<Position, MoveIssue> {
  const position = { latitude: rounded(after.latitude), longitude: rounded(after.longitude) };
  if (!withinIceland(position)) return err("outside_iceland");
  if (position.latitude === before.latitude && position.longitude === before.longitude) {
    return err("same_place");
  }
  return ok(position);
}
