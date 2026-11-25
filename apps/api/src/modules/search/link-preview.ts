// A shared ride's own link preview (spec 23, 3.10): which trip addresses
// get one, and what its card says. The picture is drawn in ride-picture.ts.
import { createHash } from "node:crypto";
import { icelandDate, type PartState } from "@shareride/domain";
import {
  createTranslator,
  formatClock,
  formatDay,
  formatShortDay,
  type Locale,
} from "@shareride/i18n";
import type { TripDetailsService } from "./details.ts";

/**
 * What a ride's card is made from: the trip page's stops and part, and
 * nothing about the driver (R23.8). A TripDetails fits it.
 */
export interface RideSource {
  readonly id: string;
  readonly stops: readonly {
    readonly meetingPoint: { readonly name: Readonly<Record<Locale, string>> };
    readonly plannedAt: string;
  }[];
  readonly part: { readonly board: number; readonly alight: number; readonly state: PartState };
}

/** A part of a trip that a link shows: its stops from boarding to getting out. */
export interface Ride {
  readonly id: string;
  readonly board: number;
  readonly alight: number;
  readonly stops: readonly {
    readonly name: Readonly<Record<Locale, string>>;
    readonly plannedAt: Date;
  }[];
  /** Whether a seat can be booked on the part now: the picture's "Free seats" tag. */
  readonly bookable: boolean;
}

/** The part states a card is for: the part has not left and is not cancelled (item 1). */
const shownStates: ReadonlySet<PartState> = new Set(["open", "full", "closed"]);

/** The ride a trip page shows, or undefined where the general preview stays. */
export function rideOf(trip: RideSource): Ride | undefined {
  const { board, alight, state } = trip.part;
  if (!shownStates.has(state)) return undefined;
  const stops = trip.stops.slice(board, alight + 1).map((stop) => ({
    name: stop.meetingPoint.name,
    plannedAt: new Date(stop.plannedAt),
  }));
  if (stops.length < 2) return undefined;
  return { id: trip.id, board, alight, stops, bookable: state === "open" };
}

/** The first and the last stop of a ride, and the ones between. */
export function endsOf(ride: Ride) {
  const from = ride.stops[0];
  const to = ride.stops.at(-1);
  if (from === undefined || to === undefined) throw new RangeError("A ride has two stops at least");
  return { from, to, between: ride.stops.slice(1, -1) };
}

/** "Fri 27 Nov at 09:00" for the title, "Friday 27 November at 09:00" for the picture. */
export function whenOf(ride: Ride, locale: Locale, long: boolean): string {
  const t = createTranslator(locale);
  const leaves = endsOf(ride).from.plannedAt;
  const day = long ? formatDay(leaves, locale) : formatShortDay(icelandDate(leaves), locale);
  return t("trip.mine.when", { day, time: formatClock(leaves) });
}

export interface RideCard {
  readonly title: string;
  readonly description: string;
  /** The picture's alt text (`og:image:alt`). */
  readonly imageAlt: string;
  /** The picture's address on this origin, with `v` from what it shows (item 4). */
  readonly imagePath: string;
}

/**
 * The drawing's own version: raise it when the picture's look or its words
 * change, so sites that kept a card read the new picture (item 4).
 */
const drawingVersion = 1;

/** The card's title: the part's route and when it leaves. */
function titleOf(ride: Ride, locale: Locale): string {
  const t = createTranslator(locale);
  const { from, to } = endsOf(ride);
  const route = t("search.route", { from: from.name[locale], to: to.name[locale] });
  return t("seo.tripTitle", { route, when: whenOf(ride, locale, false) });
}

/** A short fingerprint of everything the picture shows, for its address and the API's copy (item 4). */
export function rideVersion(ride: Ride, locale: Locale): string {
  const shown = [
    String(drawingVersion),
    locale,
    titleOf(ride, locale),
    ...endsOf(ride).between.map((stop) => stop.name[locale]),
    String(ride.bookable),
  ];
  return createHash("sha256").update(shown.join("\n")).digest("hex").slice(0, 12);
}

/** The card's texts and the picture's address, in one language (item 2). */
export function rideCard(ride: Ride, locale: Locale): RideCard {
  const t = createTranslator(locale);
  const { from, to } = endsOf(ride);
  const route = t("search.route", { from: from.name[locale], to: to.name[locale] });
  const title = titleOf(ride, locale);
  const query = new URLSearchParams({
    fromStop: String(ride.board),
    toStop: String(ride.alight),
    lang: locale,
    v: rideVersion(ride, locale),
  });
  return {
    title,
    description: t("seo.tripDescription"),
    imageAlt: t("seo.tripImage", { route, when: whenOf(ride, locale, true) }),
    imagePath: `/v1/trips/${ride.id}/preview.png?${query.toString()}`,
  };
}

/** Looks up the ride a web app address shows, if it gets a card of its own. */
export type FindRide = (
  path: string,
  query: (name: string) => string | undefined,
) => Promise<Ride | undefined>;

const tripPage = /^\/trips\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** A stop position as an address writes it, or undefined for anything else. */
export function stopPosition(value: string | undefined): number | undefined {
  return value !== undefined && /^\d{1,2}$/.test(value) ? Number(value) : undefined;
}

/**
 * Finds a trip page's ride the way the page shows it to someone not signed
 * in: `/trips/<id>?from=1&to=3`, as the Share button gives it (item 1). When
 * the trip cannot be read just now, the page keeps the general card: the app
 * still loads, and `onError` hears why.
 */
export function rideFinder(
  details: TripDetailsService,
  onError: (error: unknown) => void = () => undefined,
): FindRide {
  return async (path, query) => {
    const id = tripPage.exec(path)?.[1];
    if (id === undefined) return undefined;
    try {
      const found = await details.details(
        id.toLowerCase(),
        { board: stopPosition(query("from")), alight: stopPosition(query("to")), seats: 1 },
        null,
      );
      return found.ok ? rideOf(found.value) : undefined;
    } catch (error) {
      onError(error);
      return undefined;
    }
  };
}
