import type { ChatSettings } from "./settings.ts";

/** When a booking's conversation can be written in (R7.1). */
export interface ConversationWindow {
  readonly opensAt: Date;
  /** Read-only from this moment on. */
  readonly closesAt: Date;
}

const dayMs = 24 * 60 * 60_000;

/**
 * A conversation opens when its booking is confirmed and closes a week after
 * the trip's planned arrival (its last stop), whether the trip happened or
 * was cancelled (spec 7, decision 2).
 */
export function conversationWindow(
  booking: { readonly confirmedAt: Date; readonly arrivesAt: Date },
  settings: ChatSettings,
): ConversationWindow {
  return {
    opensAt: booking.confirmedAt,
    closesAt: new Date(booking.arrivesAt.getTime() + settings.closeAfterDays * dayMs),
  };
}

/** Whether a message can be sent now; reading stays possible after closing. */
export function canWrite(window: ConversationWindow, now: Date): boolean {
  return now >= window.opensAt && now < window.closesAt;
}
