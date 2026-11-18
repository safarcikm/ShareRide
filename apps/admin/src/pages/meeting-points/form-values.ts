// The meeting point form's values as typed, and what the API takes from
// them. The form checks them with the domain's own rules before sending
// (`validateMeetingPointDraft`), and the API checks them again.
import type { AdminMeetingPoint, AdminMeetingPointInput } from "@shareride/contracts";
import {
  amenities as allAmenities,
  daysInWeek,
  parseCoordinates,
  validateMeetingPointDraft,
  type Amenity,
  type MeetingPointType,
  type Position,
  type Region,
} from "@shareride/domain";
import type { FieldIssue } from "./texts.ts";

export interface DayHours {
  readonly opens: string;
  readonly closes: string;
  readonly closed: boolean;
}

export interface FormValues {
  readonly nameIs: string;
  readonly nameEn: string;
  /** One a line. */
  readonly aliases: string;
  /** Coordinates or a map link, as pasted. */
  readonly spot: string;
  readonly region: string;
  readonly municipality: string;
  readonly type: string;
  readonly amenities: readonly Amenity[];
  readonly amenitiesReviewed: boolean;
  readonly whereToStandIs: string;
  readonly whereToStandEn: string;
  readonly giveHours: boolean;
  readonly hours: readonly DayHours[];
  readonly shelterNoteIs: string;
  readonly shelterNoteEn: string;
  readonly seasonal: boolean;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly seasonReviewed: boolean;
  readonly lastCheckedOn: string;
}

export interface FieldProblem {
  readonly field: string;
  readonly issue: FieldIssue;
}

const openDay: DayHours = { opens: "", closes: "", closed: false };

/**
 * Closing at midnight. A browser's time field cannot hold 24:00, so the form
 * shows it as 00:00 and sends a closing time of 00:00 as 24:00: then 00:00
 * to 00:00 is open all day.
 */
const midnight = "24:00";

export const emptyValues: FormValues = {
  nameIs: "",
  nameEn: "",
  aliases: "",
  spot: "",
  region: "",
  municipality: "",
  type: "",
  amenities: [],
  amenitiesReviewed: false,
  whereToStandIs: "",
  whereToStandEn: "",
  giveHours: false,
  hours: Array.from({ length: daysInWeek }, () => openDay),
  shelterNoteIs: "",
  shelterNoteEn: "",
  seasonal: false,
  startMonth: "",
  endMonth: "",
  seasonReviewed: false,
  lastCheckedOn: "",
};

/** The spot on OpenStreetMap, to check it before saving or moving. */
export const osmLink = (latitude: number, longitude: number) =>
  `https://www.openstreetmap.org/?mlat=${String(latitude)}&mlon=${String(longitude)}#map=17/${String(latitude)}/${String(longitude)}`;

/** "64.5383, -21.9206": how the form shows a saved spot. */
export const spotText = ({ latitude, longitude }: Position) =>
  `${String(latitude)}, ${String(longitude)}`;

export function valuesOf(point: AdminMeetingPoint): FormValues {
  return {
    nameIs: point.nameIs,
    nameEn: point.nameEn ?? "",
    aliases: point.aliases.join("\n"),
    spot: spotText(point.position),
    region: point.region,
    municipality: point.municipality,
    type: point.type,
    amenities: point.amenities,
    amenitiesReviewed: point.amenitiesReviewedOn !== null,
    whereToStandIs: point.whereToStandIs ?? "",
    whereToStandEn: point.whereToStandEn ?? "",
    giveHours: point.shelterHours !== null,
    hours:
      point.shelterHours?.map((day) =>
        day === null
          ? { ...openDay, closed: true }
          : { ...day, closes: day.closes === midnight ? "00:00" : day.closes, closed: false },
      ) ?? emptyValues.hours,
    shelterNoteIs: point.shelterNoteIs ?? "",
    shelterNoteEn: point.shelterNoteEn ?? "",
    seasonal: point.season !== null,
    startMonth: point.season === null ? "" : String(point.season.startMonth),
    endMonth: point.season === null ? "" : String(point.season.endMonth),
    seasonReviewed: point.seasonReviewedOn !== null,
    lastCheckedOn: point.lastCheckedOn ?? "",
  };
}

/** The spot read from what was pasted, or why not. */
export function readSpot(
  spot: string,
): { readonly position: Position } | { readonly problem: FieldIssue | null } {
  if (spot.trim() === "") return { problem: null };
  const result = parseCoordinates(spot);
  return result.ok ? { position: result.position } : { problem: result.problem };
}

const orNull = (text: string) => (text.trim() === "" ? null : text);

/** The fields, as the problems name them, whose problems a change to each value may fix. */
const problemFields: Record<keyof FormValues, readonly string[]> = {
  nameIs: ["nameIs"],
  nameEn: ["nameEn"],
  aliases: ["aliases"],
  spot: ["position"],
  region: ["region"],
  municipality: ["municipality"],
  type: ["type"],
  // Ticking Shelter, or taking it away, settles what needed it.
  amenities: ["amenities", "shelterHours", "shelterNoteIs", "shelterNoteEn"],
  amenitiesReviewed: [],
  whereToStandIs: ["whereToStandIs"],
  whereToStandEn: ["whereToStandEn"],
  giveHours: ["shelterHours"],
  hours: ["shelterHours"],
  shelterNoteIs: ["shelterNoteIs"],
  shelterNoteEn: ["shelterNoteEn"],
  seasonal: ["season"],
  startMonth: ["season"],
  endMonth: ["season"],
  seasonReviewed: [],
  lastCheckedOn: ["lastCheckedOn"],
};

/** The fields a change touches, so their errors go until the form is checked again. */
export const problemFieldsOf = (change: Partial<FormValues>): readonly string[] =>
  (Object.keys(change) as (keyof FormValues)[]).flatMap((key) => problemFields[key]);

/** "shelterHours" for "shelterHours.3". */
export const baseField = (field: string) => field.split(".")[0] ?? field;

/** The fields in the form's order, so problems are listed as the form reads. */
const fieldOrder = [
  "nameIs",
  "nameEn",
  "aliases",
  "position",
  "region",
  "municipality",
  "type",
  "amenities",
  "whereToStandIs",
  "whereToStandEn",
  "shelterHours",
  "shelterNoteIs",
  "shelterNoteEn",
  "season",
  "lastCheckedOn",
];

const placeOf = (field: string) => {
  const [base = "", index = "-1"] = field.split(".");
  return fieldOrder.indexOf(base) * 100 + Number(index);
};

/** Any spot in Iceland, to check the other fields while the spot is missing. */
const somewhere: Position = { latitude: 64.1371, longitude: -21.9337 };

/**
 * What the API takes from the form, or each field's problem first. `today`
 * is the date in Iceland.
 */
export function inputOf(
  values: FormValues,
  today: string,
): { readonly input: AdminMeetingPointInput } | { readonly problems: readonly FieldProblem[] } {
  const spot = readSpot(values.spot);
  const hasShelter = values.amenities.includes("shelter");
  const draft = {
    nameIs: values.nameIs,
    nameEn: orNull(values.nameEn),
    aliases: values.aliases
      .split("\n")
      .map((alias) => alias.trim())
      .filter((alias) => alias !== ""),
    position: "position" in spot ? spot.position : somewhere,
    region: values.region,
    municipality: values.municipality,
    type: values.type,
    amenities: allAmenities.filter((amenity) => values.amenities.includes(amenity)),
    whereToStandIs: orNull(values.whereToStandIs),
    whereToStandEn: orNull(values.whereToStandEn),
    shelterHours:
      hasShelter && values.giveHours
        ? values.hours.map((day) =>
            day.closed
              ? null
              : { opens: day.opens, closes: day.closes === "00:00" ? midnight : day.closes },
          )
        : null,
    shelterNoteIs: hasShelter ? orNull(values.shelterNoteIs) : null,
    shelterNoteEn: hasShelter ? orNull(values.shelterNoteEn) : null,
    season: values.seasonal
      ? { startMonth: Number(values.startMonth), endMonth: Number(values.endMonth) }
      : null,
    lastCheckedOn: orNull(values.lastCheckedOn),
  };

  const problems: FieldProblem[] = [];
  if ("problem" in spot) problems.push({ field: "position", issue: spot.problem ?? "required" });
  const checked = validateMeetingPointDraft(draft, today);
  if (!checked.ok) {
    for (const problem of checked.error) {
      // An option not chosen yet is a field to fill in.
      const empty =
        (problem.field === "region" && values.region === "") ||
        (problem.field === "type" && values.type === "");
      problems.push(empty ? { field: problem.field, issue: "required" } : problem);
    }
  }
  if (problems.length > 0) {
    return { problems: problems.sort((a, b) => placeOf(a.field) - placeOf(b.field)) };
  }
  return {
    input: {
      ...draft,
      region: values.region as Region,
      type: values.type as MeetingPointType,
      amenitiesReviewed: values.amenitiesReviewed,
      seasonReviewed: values.seasonReviewed,
    },
  };
}
