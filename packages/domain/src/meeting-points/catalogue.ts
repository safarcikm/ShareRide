// The meeting point catalogue (spec 2, ADR 0006): what a point is, where it
// is, and when it can be used.
import { inIceland } from "../time.ts";

/** The eight regions of Iceland, as the list of meeting points groups them. */
export const regions = [
  "capital",
  "southern-peninsula",
  "west",
  "westfjords",
  "northwest",
  "northeast",
  "east",
  "south",
] as const;
export type Region = (typeof regions)[number];

export const meetingPointTypes = [
  "fuel-station",
  "bus-hub",
  "shopping-centre",
  "airport",
  "ferry-terminal",
  "parking",
  "other",
] as const;
export type MeetingPointType = (typeof meetingPointTypes)[number];

export const amenities = ["shelter", "toilets", "shop", "parking", "step-free"] as const;
export type Amenity = (typeof amenities)[number];

/**
 * Draft until the operator activates it; paused while temporarily unusable;
 * retiring until its last future trip, then retired. Never deleted (R2.2).
 */
export const meetingPointStatuses = ["draft", "active", "paused", "retiring", "retired"] as const;
export type MeetingPointStatus = (typeof meetingPointStatuses)[number];

/** Places that are not meeting points, found by place search (spec 2, 3.4). */
export const placeKinds = ["area", "town", "village", "landmark"] as const;
export type PlaceKind = (typeof placeKinds)[number];

/** Shown on the map and in the list: paused ones with their reason (spec 2, 3.1.5). */
export function isVisible(status: MeetingPointStatus): boolean {
  return status === "active" || status === "paused" || status === "retiring";
}

/** May become a new stop on a trip (rule R2.4, and spec 2, 3.6.5 for retiring). */
export function isOfferedForNewTrips(status: MeetingPointStatus): boolean {
  return status === "active";
}

export interface Season {
  /** 1 to 12, or null for all year. */
  readonly seasonStartMonth: number | null;
  readonly seasonEndMonth: number | null;
}

/** In use in this month (1 to 12): seasons are whole months and may cross the new year (R2.5). */
export function isInSeason(season: Season, month: number): boolean {
  const { seasonStartMonth: start, seasonEndMonth: end } = season;
  if (start === null || end === null) return true;
  return start <= end ? month >= start && month <= end : month >= start || month <= end;
}

/** The month (1 to 12) of a moment in Iceland. */
export function monthInIceland(moment: Date): number {
  return inIceland(moment).month;
}
