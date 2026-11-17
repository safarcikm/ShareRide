// Creating and editing a meeting point in the operator console (spec 2,
// 3.6.2): what each field takes, tidied for storing. A draft needs only its
// names, spot, region, municipality and type; the rest can come later, and
// the activation checklist (R2.3) says what is still missing.
import { err, ok, type Result } from "../result.ts";
import {
  amenities as allAmenities,
  meetingPointTypes,
  regions,
  type Amenity,
  type MeetingPointType,
  type Region,
} from "./catalogue.ts";
import { withinIceland, type Position } from "./coordinates.ts";
import { normaliseSearchText } from "./search.ts";

export const meetingPointLimits = {
  /** Names, in letters. */
  nameMaxLength: 80,
  aliasesMax: 10,
  aliasMaxLength: 40,
  municipalityMaxLength: 60,
  whereToStandMaxLength: 300,
  shelterNoteMaxLength: 200,
} as const;

/** A day's opening hours, "07:00" to "23:30"; a close before the open is after midnight. */
export interface OpeningHours {
  readonly opens: string;
  readonly closes: string;
}

/** A week of a shelter's opening hours from Monday; null for a day it is closed. */
export type ShelterHours = readonly (OpeningHours | null)[];

export const daysInWeek = 7;

/** Whole months, 1 to 12, possibly across the new year (R2.5). */
export interface SeasonMonths {
  readonly startMonth: number;
  readonly endMonth: number;
}

/** What the operator sends for a meeting point. */
export interface MeetingPointDraft {
  readonly nameIs: string;
  /** None when the English name is the Icelandic one. */
  readonly nameEn: string | null;
  /** Other names people search for, such as "KEF". */
  readonly aliases: readonly string[];
  readonly position: Position;
  readonly region: string;
  readonly municipality: string;
  readonly type: string;
  readonly amenities: readonly string[];
  readonly whereToStandIs: string | null;
  readonly whereToStandEn: string | null;
  readonly shelterHours: ShelterHours | null;
  readonly shelterNoteIs: string | null;
  readonly shelterNoteEn: string | null;
  /** Null for all year. */
  readonly season: SeasonMonths | null;
  /** The day the operator last confirmed the point, from a visit or local knowledge (decision 2). */
  readonly lastCheckedOn: string | null;
}

export interface ValidMeetingPointDraft extends MeetingPointDraft {
  readonly region: Region;
  readonly type: MeetingPointType;
  readonly amenities: readonly Amenity[];
}

export type DraftIssue =
  | "required"
  | "too_long"
  | "too_many"
  | "unknown"
  | "outside_iceland"
  | "invalid"
  | "in_future"
  | "needs_shelter";

/** A field, or an item of one such as "aliases.1" or "shelterHours.0" (Monday), and its problem. */
export interface DraftProblem {
  readonly field: string;
  readonly issue: DraftIssue;
}

/** Trimmed, with each accented letter in one form (NFC); empty is none. */
const tidy = (text: string | null): string | null => {
  const tidied = text?.normalize("NFC").trim() ?? "";
  return tidied === "" ? null : tidied;
};

const letters = (text: string) => Array.from(text).length;

const oneOf = <T extends string>(values: readonly T[], value: string): value is T =>
  values.some((known) => known === value);

const opening = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const closing = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;

const validDay = (day: OpeningHours | null) =>
  day === null || (opening.test(day.opens) && closing.test(day.closes) && day.opens !== day.closes);

const validMonth = (month: number) => Number.isInteger(month) && month >= 1 && month <= 12;

const rounded = (degrees: number) => Math.round(degrees * 1e6) / 1e6;

/**
 * Checks a meeting point the operator creates or edits, and tidies it for
 * storing: every problem at once, so the form can show them all. `today` is
 * the date in Iceland.
 */
export function validateMeetingPointDraft(
  draft: MeetingPointDraft,
  today: string,
): Result<ValidMeetingPointDraft, readonly DraftProblem[]> {
  const problems: DraftProblem[] = [];
  const problem = (field: string, issue: DraftIssue) => {
    problems.push({ field, issue });
  };
  const text = (field: string, value: string | null, maxLength: number, required = false) => {
    const tidied = tidy(value);
    if (tidied === null && required) problem(field, "required");
    if (tidied !== null && letters(tidied) > maxLength) problem(field, "too_long");
    return tidied;
  };

  const nameIs = text("nameIs", draft.nameIs, meetingPointLimits.nameMaxLength, true) ?? "";
  const englishName = text("nameEn", draft.nameEn, meetingPointLimits.nameMaxLength);
  const nameEn = englishName === nameIs ? null : englishName;

  // Repeats of each other or of the names add nothing to search.
  const known = new Set([nameIs, nameEn ?? ""].map(normaliseSearchText));
  const aliases: string[] = [];
  draft.aliases.forEach((alias, index) => {
    const tidied = tidy(alias);
    if (tidied === null) return;
    if (letters(tidied) > meetingPointLimits.aliasMaxLength)
      problem(`aliases.${String(index)}`, "too_long");
    const key = normaliseSearchText(tidied);
    if (known.has(key)) return;
    known.add(key);
    aliases.push(tidied);
  });
  if (aliases.length > meetingPointLimits.aliasesMax) problem("aliases", "too_many");

  const position = {
    latitude: rounded(draft.position.latitude),
    longitude: rounded(draft.position.longitude),
  };
  if (!withinIceland(position)) problem("position", "outside_iceland");

  const region = draft.region;
  if (!oneOf(regions, region)) problem("region", "unknown");
  const municipality =
    text("municipality", draft.municipality, meetingPointLimits.municipalityMaxLength, true) ?? "";
  const type = draft.type;
  if (!oneOf(meetingPointTypes, type)) problem("type", "unknown");

  if (!draft.amenities.every((amenity) => oneOf(allAmenities, amenity))) {
    problem("amenities", "unknown");
  }
  // In the catalogue's order, so the same set is always stored the same way.
  const amenities = allAmenities.filter((amenity) => draft.amenities.includes(amenity));
  const hasShelter = amenities.includes("shelter");

  const whereToStandIs = text(
    "whereToStandIs",
    draft.whereToStandIs,
    meetingPointLimits.whereToStandMaxLength,
  );
  const whereToStandEn = text(
    "whereToStandEn",
    draft.whereToStandEn,
    meetingPointLimits.whereToStandMaxLength,
  );

  const { shelterHours } = draft;
  if (shelterHours !== null) {
    if (!hasShelter) problem("shelterHours", "needs_shelter");
    else if (shelterHours.length !== daysInWeek) problem("shelterHours", "invalid");
    else {
      shelterHours.forEach((day, index) => {
        if (!validDay(day)) problem(`shelterHours.${String(index)}`, "invalid");
      });
    }
  }
  const shelterNoteIs = text(
    "shelterNoteIs",
    draft.shelterNoteIs,
    meetingPointLimits.shelterNoteMaxLength,
  );
  const shelterNoteEn = text(
    "shelterNoteEn",
    draft.shelterNoteEn,
    meetingPointLimits.shelterNoteMaxLength,
  );
  if (!hasShelter && shelterNoteIs !== null) problem("shelterNoteIs", "needs_shelter");
  if (!hasShelter && shelterNoteEn !== null) problem("shelterNoteEn", "needs_shelter");

  const { season } = draft;
  if (season !== null && !(validMonth(season.startMonth) && validMonth(season.endMonth))) {
    problem("season", "invalid");
  }

  const { lastCheckedOn } = draft;
  if (lastCheckedOn !== null && lastCheckedOn > today) problem("lastCheckedOn", "in_future");

  if (problems.length > 0 || !oneOf(regions, region) || !oneOf(meetingPointTypes, type)) {
    return err(problems);
  }
  return ok({
    nameIs,
    nameEn,
    aliases,
    position,
    region,
    municipality,
    type,
    amenities,
    whereToStandIs,
    whereToStandEn,
    shelterHours: shelterHours === null ? null : [...shelterHours],
    shelterNoteIs,
    shelterNoteEn,
    season: season === null ? null : { startMonth: season.startMonth, endMonth: season.endMonth },
    lastCheckedOn,
  });
}

/**
 * When the operator last reviewed a point's amenities or season (R2.3): the
 * first day it was ticked while it stays ticked, none once unticked.
 */
export function reviewedOn(
  previous: string | null,
  reviewed: boolean,
  today: string,
): string | null {
  if (!reviewed) return null;
  return previous ?? today;
}
