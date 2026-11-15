// The values the operator will set for the chat (spec 7, section 6). Until
// the operator settings exist they are these defaults, passed to every rule.

export interface ChatSettings {
  /** A conversation becomes read-only this many days after the trip's planned arrival (`chat_close_after`, R7.1). */
  readonly closeAfterDays: number;
  /** A text message, in characters (R7.2). */
  readonly messageMaxLength: number;
  /** Messages one person may send in a minute (`chat_rate_limit`, R7.5). */
  readonly rateLimitPerMinute: number;
}

/** The starting values (spec 7, approved 2026-11-13). */
export const defaultChatSettings: ChatSettings = {
  closeAfterDays: 7,
  messageMaxLength: 1000,
  rateLimitPerMinute: 10,
};
