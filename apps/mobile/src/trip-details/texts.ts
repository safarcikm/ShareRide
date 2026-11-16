import type { TripDetails } from "@shareride/contracts";
import type { MessageKey } from "@shareride/i18n";

type Preferences = TripDetails["preferences"];

/** The driver's preferences as a passenger reads them (spec 4, 3.6.5). */
export const needKeys = {
  luggage: {
    small_bag: "trip.needs.luggage.small_bag",
    suitcase: "trip.needs.luggage.suitcase",
    by_arrangement: "trip.needs.luggage.by_arrangement",
  },
  pets: { no: "trip.needs.pets.no", ask: "trip.needs.pets.ask", yes: "trip.needs.pets.yes" },
  smoking: { no: "trip.needs.smoking.no", breaks_outside: "trip.needs.smoking.breaks_outside" },
  chat: {
    quiet: "trip.needs.chat.quiet",
    some: "trip.needs.chat.some",
    chatty: "trip.needs.chat.chatty",
  },
} as const satisfies {
  readonly [K in Exclude<keyof Preferences, "childSeat">]: Record<Preferences[K], MessageKey>;
};

export const childSeatNeedKey = (childSeat: boolean): MessageKey =>
  childSeat ? "trip.needs.childSeat.yes" : "trip.needs.childSeat.no";

/** "White Toyota Yaris"; shared with the reminders the API sends. */
export { carText } from "@shareride/i18n";
