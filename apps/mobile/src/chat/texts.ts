import type { Booking, ChatMessage } from "@shareride/contracts";
import { formatClock, quickMessageText, systemLineText, type Translate } from "@shareride/i18n";
import type { Outgoing } from "./messages";

/** The other person in a booking's conversation. */
export function otherPerson(booking: Booking) {
  return booking.viewer === "passenger" ? booking.driver : booking.passenger;
}

/** A message in the reader's language: text as written, quick messages and system lines translated (R7.2). */
export function messageText(t: Translate, message: ChatMessage | Outgoing): string {
  if ("kind" in message) {
    if (message.system !== null) return systemLineText(t, message.system.key);
    if (message.quick !== null) return quickMessageText(t, message.quick);
    return message.text ?? "";
  }
  return "quick" in message ? quickMessageText(t, message.quick) : message.text;
}

/** "Anna, 08:12: I'm on my way. Seen": one message as a screen reader says it (plan 4.3). */
export function spokenMessage(
  t: Translate,
  message: ChatMessage,
  other: string,
  seen: boolean,
): string {
  const who = message.from === "me" ? t("chat.you") : other;
  const said = `${who}, ${formatClock(new Date(message.sentAt))}: ${messageText(t, message)}`;
  if (!seen) return said;
  // "Thank you! Seen" and "Where are you? Seen", but "I'm on my way. Seen".
  return `${said}${/[.!?…]$/u.test(said) ? "" : "."} ${t("chat.seen")}`;
}

/** The last message in the conversations list: "You: See you at 9" for mine. */
export function previewText(t: Translate, message: ChatMessage): string {
  const text = messageText(t, message);
  return message.from === "me" ? t("chat.fromYou", { text }) : text;
}
