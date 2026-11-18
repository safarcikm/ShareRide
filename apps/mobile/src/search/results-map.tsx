import type { TripSearchResult } from "@shareride/contracts";
import { useLanguage } from "@/i18n/language";
import { IcelandMap, type MapDot, type MapLine } from "@/maps/iceland-map";

/** A trip's stretch for the passenger: the two meeting points, as one key. */
const stretchOf = (result: TripSearchResult) =>
  `${result.board.meetingPoint.id}>${result.alight.meetingPoint.id}`;

/**
 * The trips found on our map, beside the list on wide screens (spec 18,
 * 3.6): the stretch of the trip `shown`, drawn along the roads with its two
 * meeting points standing out. The stretches of the other trips are there
 * too, muted, so the map shows the same part of Iceland whichever trip is
 * shown and stays still under the pointer. Without a trip, as while the
 * trips load or when nothing matches, the whole of Iceland. The list says
 * everything the map shows.
 */
export function ResultsMap({
  results,
  shown,
}: {
  readonly results: readonly TripSearchResult[];
  /** One of `results`, or none while there are none. */
  readonly shown: TripSearchResult | undefined;
}) {
  const { locale, t } = useLanguage();
  if (shown === undefined) return <IcelandMap label={t("results.map")} dots={[]} />;

  const ends = new Set([shown.board.meetingPoint.id, shown.alight.meetingPoint.id]);
  const dots = new Map<string, MapDot>();
  const lines = new Map<string, MapLine>();
  for (const result of results) {
    for (const { meetingPoint } of [result.board, result.alight]) {
      dots.set(meetingPoint.id, {
        id: meetingPoint.id,
        position: meetingPoint.position,
        look: ends.has(meetingPoint.id) ? "chosen" : "muted",
      });
    }
    lines.set(stretchOf(result), {
      id: stretchOf(result),
      positions: [result.board.meetingPoint.position, result.alight.meetingPoint.position],
      look: "route",
    });
  }
  return (
    <IcelandMap
      label={t("results.mapOf", {
        route: t("search.route", {
          from: shown.board.meetingPoint.name[locale],
          to: shown.alight.meetingPoint.name[locale],
        }),
      })}
      dots={[...dots.values()]}
      lines={[
        ...lines.values(),
        {
          id: "shown",
          positions: [shown.board.meetingPoint.position, shown.alight.meetingPoint.position],
          look: "part",
        },
      ]}
      fit
    />
  );
}
