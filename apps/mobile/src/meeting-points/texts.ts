import type { MeetingPointSummary } from "@shareride/contracts";
import type { Amenity, MeetingPointType, PlaceKind, Region } from "@shareride/domain";
import { formatMonth, type Locale, type MessageKey, type Translate } from "@shareride/i18n";

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
  season: MeetingPointSummary["season"],
): string {
  if (season === null) return t("meetingPoints.inUseAllYear");
  return t("meetingPoints.inUseMonths", {
    from: formatMonth(season.startMonth, locale),
    to: formatMonth(season.endMonth, locale),
  });
}
