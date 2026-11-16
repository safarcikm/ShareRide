import type { Href } from "expo-router";
import { forgetPendingOffer } from "@/drive/pending-offer";
import { readAppData, writeAppData } from "@/lib/app-data";

// The part and seats someone chose before they had an account (spec 5, 3.1,
// item 1): kept on the device while they sign up, so the booking screen
// opens with the same choice afterwards. Only IDs and numbers, never a name,
// in the app's own storage, which goes when the app is deleted.

export interface PendingBooking {
  readonly tripId: string;
  /** Stop positions on the trip. */
  readonly board: number;
  readonly alight: number;
  readonly seats: number;
  /**
   * The meeting points shown at those positions, so a stop added meanwhile
   * cannot shift the part unseen (spec 6, 3.2).
   */
  readonly fromPoint?: string | undefined;
  readonly toPoint?: string | undefined;
}

const key = "pending-booking";

/** Signing up takes a few minutes; a choice older than this is forgotten. */
export const pendingBookingLifetimeMs = 60 * 60 * 1000;

/** Keeps the choice, and forgets an offer to drive kept before it (drive/pending-offer.ts). */
export async function keepPendingBooking(choice: PendingBooking, at: Date): Promise<void> {
  await forgetPendingOffer();
  await writeAppData(key, JSON.stringify({ ...choice, keptAt: at.toISOString() }));
}

/** The choice kept within the last hour, once: taking it forgets it. */
export async function takePendingBooking(at: Date): Promise<PendingBooking | null> {
  const stored = await readAppData(key);
  if (stored === null || stored === "") return null;
  await writeAppData(key, "");
  return parse(stored, at);
}

/** The choice kept within the last hour, left where it is (the sign-up steps show it). */
export async function peekPendingBooking(at: Date): Promise<PendingBooking | null> {
  const stored = await readAppData(key);
  if (stored === null || stored === "") return null;
  return parse(stored, at);
}

function parse(stored: string, at: Date): PendingBooking | null {
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { tripId, board, alight, seats, fromPoint, toPoint, keptAt } = value as Record<
    string,
    unknown
  >;
  const whole = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;
  if (typeof tripId !== "string" || !whole(board) || !whole(alight) || !whole(seats)) return null;
  const age = typeof keptAt === "string" ? at.getTime() - Date.parse(keptAt) : Number.NaN;
  if (!(age >= 0 && age <= pendingBookingLifetimeMs)) return null;
  return {
    tripId,
    board,
    alight,
    seats,
    ...(typeof fromPoint === "string" ? { fromPoint } : {}),
    ...(typeof toPoint === "string" ? { toPoint } : {}),
  };
}

/** The booking screen for a choice. */
export function bookingHref(choice: PendingBooking): Href {
  return {
    pathname: "/trips/[id]/book",
    params: {
      id: choice.tripId,
      from: String(choice.board),
      to: String(choice.alight),
      seats: String(choice.seats),
      ...(choice.fromPoint === undefined ? {} : { fromPoint: choice.fromPoint }),
      ...(choice.toPoint === undefined ? {} : { toPoint: choice.toPoint }),
    },
  };
}
