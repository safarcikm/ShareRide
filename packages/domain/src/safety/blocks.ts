// Blocking (spec 9, 3.2; rule R9.4): silent, and mutual in effect. Neither
// person sees or books the other's trips, and their chats become read-only.
import { err, ok, type Result } from "../result.ts";

/** One person blocked another. One per pair and direction. */
export interface Block {
  readonly blockerId: string;
  readonly blockedId: string;
}

export type BlockProblem = { readonly code: "self" };

/** Whether a block stands between two people, whichever of them made it. */
export function isBlockedBetween(blocks: readonly Block[], a: string, b: string): boolean {
  return blocks.some(
    (block) =>
      (block.blockerId === a && block.blockedId === b) ||
      (block.blockerId === b && block.blockedId === a),
  );
}

/** Everyone I blocked and everyone who blocked me: we don't see each other. */
export function hiddenFrom(blocks: readonly Block[], me: string): ReadonlySet<string> {
  const hidden = new Set<string>();
  for (const { blockerId, blockedId } of blocks) {
    if (blockerId === blockedId) continue;
    if (blockerId === me) hidden.add(blockedId);
    if (blockedId === me) hidden.add(blockerId);
  }
  return hidden;
}

export function checkBlock(me: string, other: string): Result<void, BlockProblem> {
  return me === other ? err({ code: "self" }) : ok(undefined);
}

/** A trip as blocks need it: its driver and the people booked on it. */
export interface TripPeople {
  readonly driverId: string;
  /** Passengers whose booking holds seats (rule S1). */
  readonly passengerIds: readonly string[];
}

/**
 * Whether a trip is closed to me: its driver, or someone booked on it, is in
 * a block with me. It is then left out of my search and trip pages, and I
 * cannot book it (R9.4; milestone 9 decision 2 adds the passengers). My own
 * trips and bookings stay mine.
 */
export function tripClosedTo(me: string, trip: TripPeople, blocks: readonly Block[]): boolean {
  if (trip.driverId === me) return false;
  const hidden = hiddenFrom(blocks, me);
  return hidden.has(trip.driverId) || trip.passengerIds.some((id) => hidden.has(id));
}
