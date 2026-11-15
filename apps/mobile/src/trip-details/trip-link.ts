import type { Href } from "expo-router";
import { Platform } from "react-native";
import { apiBaseUrl } from "@/auth/api";

/** The stops a passenger gets in and out at, by position on the trip. */
export interface Part {
  readonly board: number;
  readonly alight: number;
}

/** The trip page for a part: `/trips/{id}?from=1&to=2&seats=2`. */
function tripPath(id: string, part: Part, seats = 1): string {
  const query = new URLSearchParams({ from: String(part.board), to: String(part.alight) });
  if (seats > 1) query.set("seats", String(seats));
  return `/trips/${id}?${query.toString()}`;
}

/** The trip page for a part, as the app opens it. */
export const tripHref = (id: string, part: Part, seats = 1): Href => tripPath(id, part, seats);

/**
 * The trip page's public web address (spec 4, 3.7), for the part but not
 * the seats: those are for whoever opens it to choose. The web app is
 * served by the API on one origin, so phones use the API's address.
 */
export function tripWebAddress(id: string, part: Part): string {
  const origin = Platform.OS === "web" ? window.location.origin : apiBaseUrl();
  return `${origin}${tripPath(id, part)}`;
}

/**
 * The part a link asks for: stop positions as whole numbers, or undefined
 * for a value left out or changed by hand into something else. The server
 * checks they fit the trip.
 */
export function positionParam(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d{1,2}$/.test(value)) return undefined;
  return Number(value);
}
