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

/** A trip as blocks need it. */
export interface TripPeople {
  readonly driverId: string;
  /** Whether I hold seats on it (rule S1). */
  readonly bookedByMe: boolean;
}

/**
 * Whether a trip is closed to me: its driver is in a block with me (R9.4).
 * It is then left out of my search and trip pages. Only the driver counts:
 * who is booked on a trip is private, and closing a trip because of a
 * passenger would show a blocker which rides the other person booked
 * (milestone 9 decision 2, revised on review). A trip I drive or am booked
 * on stays open for me to read: what happens to a booking we share is my
 * choice (spec 9 decision 1).
 */
export function tripClosedTo(me: string, trip: TripPeople, blocks: readonly Block[]): boolean {
  if (trip.driverId === me || trip.bookedByMe) return false;
  return hiddenFrom(blocks, me).has(trip.driverId);
}

/**
 * Whether booking on a trip driven by `driverId` is closed to me: always
 * when we are in a block, even if I already hold another part of it
 * (R5.10), so neither books the other's trips (R9.4).
 */
export function bookingClosedTo(me: string, driverId: string, blocks: readonly Block[]): boolean {
  return hiddenFrom(blocks, me).has(driverId);
}
