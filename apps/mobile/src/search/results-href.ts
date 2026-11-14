import type { Locale } from "@shareride/i18n";
import type { Href } from "expo-router";
import type { SearchQuery } from "./recent-searches";

/**
 * The results screen for a search. The names travel with the IDs, in the
 * language of the moment, so the screen can show them after a reload.
 */
export function resultsHref(query: SearchQuery, locale: Locale): Href {
  return {
    pathname: "/search/results",
    params: {
      from: query.from.id,
      to: query.to.id,
      fromName: query.from.name[locale],
      toName: query.to.name[locale],
      seats: String(query.seats),
      ...(query.date === null ? {} : { date: query.date }),
    },
  };
}
