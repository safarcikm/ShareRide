import { err, ok, type Result } from "../result.ts";

// Announcements (spec 10, 3.5; R10.7; feature H6): the operator's news
// about the beta and the service, never advertising, in both languages,
// to the people who have "Beta news" on.

export const announcementAudiences = ["everyone", "drivers", "passengers", "corridor"] as const;
export type AnnouncementAudience = (typeof announcementAudiences)[number];

export const announcementRules = {
  titleMaxLength: 80,
  messageMaxLength: 1000,
} as const;

/** The four texts, each required: a title and a message in Icelandic and in English. */
export const announcementTexts = ["titleIs", "titleEn", "messageIs", "messageEn"] as const;
export type AnnouncementText = (typeof announcementTexts)[number];

export interface AnnouncementDraft {
  readonly audience: AnnouncementAudience;
  /** The corridor, for that audience; left alone for the others. */
  readonly corridorId: string | null;
  readonly titleIs: string;
  readonly titleEn: string;
  readonly messageIs: string;
  readonly messageEn: string;
}

export type AnnouncementProblem =
  | { readonly code: "text_missing"; readonly field: AnnouncementText }
  | { readonly code: "text_too_long"; readonly field: AnnouncementText }
  | { readonly code: "corridor_missing" };

/**
 * An announcement as stored: its texts trimmed, and a corridor only for
 * the audience that has one. The first problem found is the answer.
 */
export function checkAnnouncement(
  draft: AnnouncementDraft,
): Result<AnnouncementDraft, AnnouncementProblem> {
  const texts = {} as Record<AnnouncementText, string>;
  for (const field of announcementTexts) {
    const text = draft[field].trim();
    const max = field.startsWith("title")
      ? announcementRules.titleMaxLength
      : announcementRules.messageMaxLength;
    if (text.length === 0) return err({ code: "text_missing", field });
    if (text.length > max) return err({ code: "text_too_long", field });
    texts[field] = text;
  }
  if (draft.audience === "corridor" && draft.corridorId === null) {
    return err({ code: "corridor_missing" });
  }
  return ok({
    audience: draft.audience,
    corridorId: draft.audience === "corridor" ? draft.corridorId : null,
    ...texts,
  });
}

/** What the rules need to know of an account, to say whether an announcement is for it. */
export interface AnnouncementReader {
  /** "Beta news" in their settings, on unless they turned it off (decision 3). */
  readonly betaNews: boolean;
  /** Not suspended, and not waiting to be deleted. */
  readonly inGoodStanding: boolean;
  /** They have published a trip. */
  readonly hasPostedTrip: boolean;
  /** They have made a booking or a request. */
  readonly hasBooked: boolean;
  /** They have a trip or a booking on the announcement's corridor. */
  readonly onCorridor: boolean;
}

/** Whether an announcement for an audience goes to this account (3.5.1 and 3.5.4). */
export function receivesAnnouncement(
  audience: AnnouncementAudience,
  reader: AnnouncementReader,
): boolean {
  if (!reader.betaNews || !reader.inGoodStanding) return false;
  switch (audience) {
    case "everyone":
      return true;
    case "drivers":
      return reader.hasPostedTrip;
    case "passengers":
      return reader.hasBooked;
    case "corridor":
      return reader.onCorridor;
  }
}

/** The start of a message, for a push notification's one or two lines. */
export function announcementPreview(message: string, maxLength = 140): string {
  const oneLine = message.replaceAll(/\s+/g, " ").trim();
  return oneLine.length <= maxLength ? oneLine : `${oneLine.slice(0, maxLength - 1).trimEnd()}…`;
}
