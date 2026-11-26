import type { MyTrip } from "@shareride/contracts";
import {
  capitalised,
  createTranslator,
  formatClock,
  formatDay,
  type Locale,
} from "@shareride/i18n";

/** A driver's post about a trip, in one language (spec 28, 3.4). */
export interface PostText {
  /** The whole post, the link at its end: what is copied. */
  readonly text: string;
  /** The same without the link, for a share window that takes the link apart. */
  readonly withoutLink: string;
  /** "{route} on PuffinRide", for a share window's title. */
  readonly title: string;
}

/**
 * The post a driver pastes into a Facebook group or anywhere else: what and
 * where ("Býð far", as drivers start their posts in Icelandic groups), when,
 * the stops between, and the link, with "Ask for a seat" for a trip where
 * the driver approves each booking. Never a name, the car, a price, a fee or
 * a seat count (R28.2).
 */
export function postText(trip: MyTrip, locale: Locale, url: string): PostText {
  const t = createTranslator(locale);
  const names = trip.stops.map((stop) => stop.meetingPoint.name[locale]);
  const route = t("search.route", { from: names[0] ?? "", to: names.at(-1) ?? "" });
  const between = names.slice(1, -1);
  const departure = trip.departsAt === null ? null : new Date(trip.departsAt);
  const lines = [
    t("shareRide.post.offer", { route }),
    departure === null
      ? null
      : capitalised(
          t("trip.mine.when", { day: formatDay(departure, locale), time: formatClock(departure) }),
          locale,
        ),
    between.length === 0 ? null : t("seo.tripStops", { stops: between.join(", ") }),
  ].filter((line) => line !== null);
  const book = t(trip.bookingMode === "approval" ? "shareRide.post.ask" : "shareRide.post.book");
  return {
    text: [...lines, `${book} ${url}`].join("\n"),
    withoutLink: [...lines, book].join("\n"),
    title: t("trip.shareText", { route }),
  };
}
