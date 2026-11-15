import type { ChatMessage } from "@shareride/contracts";
import type { QuickMessage } from "@shareride/domain";

/** What the person sends: a text, or a quick message (R7.2). */
export type Outgoing = { readonly text: string } | { readonly quick: QuickMessage };

/** A message of mine on its way, or one that failed and can be sent again. */
export interface Pending {
  readonly clientId: string;
  readonly outgoing: Outgoing;
  readonly state: "sending" | "failed";
}

/** In the order the server keeps them: by the time sent, then by ID. */
export function inOrder(a: ChatMessage, b: ChatMessage): number {
  const byTime = Date.parse(a.sentAt) - Date.parse(b.sentAt);
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The messages known so far with a newer copy of some (such as "Seen") and
 * new ones, oldest first. A message once read stays read, even if an older
 * answer arrives late.
 */
export function merged(
  known: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  const byId = new Map(known.map((message) => [message.id, message]));
  for (const message of incoming) {
    const readAt = message.readAt ?? byId.get(message.id)?.readAt ?? null;
    byId.set(message.id, { ...message, readAt });
  }
  return [...byId.values()].sort(inOrder);
}

/** My last message the other person has read, which shows "Seen" (3.1, item 4). */
export function lastSeenId(messages: readonly ChatMessage[]): string | null {
  return (
    messages.findLast((message) => message.from === "me" && message.readAt !== null)?.id ?? null
  );
}

/** The other person's newest message, to mark the conversation read up to it. */
export function newestTheirs(messages: readonly ChatMessage[]): ChatMessage | null {
  return messages.findLast((message) => message.from === "them") ?? null;
}
