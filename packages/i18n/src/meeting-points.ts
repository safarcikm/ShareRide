import type {
  Amenity,
  MeetingPointIssueReason,
  MeetingPointType,
  PlaceKind,
  Region,
} from "@shareride/domain";
import { formatMonth } from "./format.ts";
import type { Locale } from "./locales.ts";
import type { MessageKey, Translate } from "./translator.ts";

// The names of a meeting point's region, type and amenities, and of a
// place's kind, shared by the app and the operator console (spec 2).

export const regionKeys = {
  capital: "regions.capital",
  "southern-peninsula": "regions.southernPeninsula",
  west: "regions.west",
  westfjords: "regions.westfjords",
  northwest: "regions.northwest",
  northeast: "regions.northeast",
  east: "regions.east",
  south: "regions.south",
} as const satisfies Record<Region, MessageKey>;

export const typeKeys = {
  "fuel-station": "meetingPoints.type.fuelStation",
  "bus-hub": "meetingPoints.type.busHub",
  "shopping-centre": "meetingPoints.type.shoppingCentre",
  airport: "meetingPoints.type.airport",
  "ferry-terminal": "meetingPoints.type.ferryTerminal",
  parking: "meetingPoints.type.parking",
  other: "meetingPoints.type.other",
} as const satisfies Record<MeetingPointType, MessageKey>;

export const amenityKeys = {
  shelter: "amenities.shelter",
  toilets: "amenities.toilets",
  shop: "amenities.shop",
  parking: "amenities.parking",
  "step-free": "amenities.stepFree",
} as const satisfies Record<Amenity, MessageKey>;

export const issueReasonKeys = {
  closed_or_moved: "meetingPoints.issue.reason.closedOrMoved",
  unsafe: "meetingPoints.issue.reason.unsafe",
  wrong_location: "meetingPoints.issue.reason.wrongLocation",
  wrong_information: "meetingPoints.issue.reason.wrongInformation",
  other: "meetingPoints.issue.reason.other",
} as const satisfies Record<MeetingPointIssueReason, MessageKey>;

export const placeKindKeys = {
  area: "places.kind.area",
  town: "places.kind.town",
  village: "places.kind.village",
  landmark: "places.kind.landmark",
} as const satisfies Record<PlaceKind, MessageKey>;

/** "In use all year", or "In use from May to September" (spec 2, 3.2). */
export function seasonText(
  t: Translate,
  locale: Locale,
  season: { readonly startMonth: number; readonly endMonth: number } | null,
): string {
  if (season === null) return t("meetingPoints.inUseAllYear");
  return t("meetingPoints.inUseMonths", {
    from: formatMonth(season.startMonth, locale),
    to: formatMonth(season.endMonth, locale),
  });
}
