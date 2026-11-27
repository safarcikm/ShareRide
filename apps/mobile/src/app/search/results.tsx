import type { CallResult } from "@shareride/api-client";
import {
  tripSearchAlternativesRoute,
  tripSearchRoute,
  type TripSearchResult,
} from "@shareride/contracts";
import { timesOfDay, type TimeOfDay } from "@shareride/domain";
import { capitalised, formatDay, formatShortDay, type MessageKey } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { SlidersHorizontal } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSession, useSessionState } from "@/auth/session";
import { useMaxSeats } from "@/beta/config";
import { offerRide } from "@/drive/offer-ride";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Notice } from "@/components/notice";
import { PuffinByPin } from "@/components/puffin-scenes";
import { Screen, useWideScreen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { dayOf, isoDay, showsOtherTime } from "@/lib/days";
import { useLoaded } from "@/lib/use-loaded";
import { failureText } from "@/search/failure-text";
import type { SearchQuery } from "@/search/recent-searches";
import { resultsParams } from "@/search/results-href";
import { useRouteSearch } from "@/search/route-search";
import { ResultTicket, type SearchedNames } from "@/search/result-ticket";
import { ResultsMap } from "@/search/results-map";
import { sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

type Sort = "departure" | "price";

/** The most trips one search answers (the server's limit). */
const resultLimit = 50;

const timeKeys = {
  morning: "results.morning",
  afternoon: "results.afternoon",
  evening: "results.evening",
} as const satisfies Record<TimeOfDay, string>;

/**
 * Search results (spec 4, 3.4 and 3.5; spec 31, 3.6): rides for the
 * passenger's part as tickets, sorted by time or price, filtered by instant
 * booking and time of day, and grouped by day. When nothing matches, the
 * days around the date and rides from meeting points nearby. The header is
 * one button that opens the search in place, filled in (spec 16, 3.8).
 *
 * Under it one row: the order as one chip, one Filters chip that opens the
 * filters under the row and says how many are on, and how many rides there
 * are. One of the two is open at a time. The list ends with a card that
 * says so and leads to All rides.
 *
 * A wide screen (spec 18, 3.6) has our map beside the list, with the ride
 * the pointer or the keyboard came to last, or the first one; that ride's
 * ticket is marked.
 */
export default function SearchResults() {
  const { locale, t } = useLanguage();
  const maxSeats = useMaxSeats();
  const palette = usePalette();
  const session = useSession();
  const wide = useWideScreen();
  const params = useLocalSearchParams<{
    from: string;
    to: string;
    fromName?: string;
    toName?: string;
    date?: string;
    seats?: string;
  }>();
  const { from, to } = params;
  // A link cut short or changed by hand searches any day.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date : undefined;
  const seats = Math.min(Math.max(Number(params.seats) || 1, 1), maxSeats);
  const searched: SearchedNames = { from: params.fromName ?? "", to: params.toName ?? "" };
  const [sort, setSort] = useState<Sort>("departure");
  const [instant, setInstant] = useState(false);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | null>(null);
  const filtered = instant || timeOfDay !== null;
  const filtersOn = (instant ? 1 : 0) + (timeOfDay === null ? 0 : 1);
  const [changing, setChanging] = useState(false);
  // Counts the times the form closed, to give focus back to the header.
  const [closed, setClosed] = useState(0);
  // What the row has open under it: the orders, the filters or neither.
  const [open, setOpen] = useState<"order" | "filters" | null>(null);
  // Counts the orders chosen, to give focus back to the Sort chip.
  const [orderChosen, setOrderChosen] = useState(0);
  // The trip the pointer or the keyboard came to last, for the map.
  const [shownId, setShownId] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      from,
      to,
      seats,
      sort,
      ...(date === undefined ? {} : { date }),
      ...(instant ? { instant: true } : {}),
      ...(timeOfDay === null ? {} : { timeOfDay }),
    }),
    [from, to, date, seats, sort, instant, timeOfDay],
  );
  const load = useCallback(
    () => session.call(tripSearchRoute, { query }).then((answer) => ({ query, answer })),
    [session, query],
  );
  const { value: loaded, reload, pull } = useLoaded(load);
  const result = loaded?.answer;
  const found = result?.ok === true ? result.data.results : undefined;
  const current = loaded?.query === query;
  // The last answer stays on screen while a changed order, filter or day
  // loads, not a changed route or seat count: its totals and places were
  // for another search.
  const sameRoute =
    loaded !== undefined &&
    loaded.query.from === from &&
    loaded.query.to === to &&
    loaded.query.seats === seats;

  // Other days and nearby points: when nothing matches, and other days at
  // the end of a day's list. Asked for once per place, date and seats, and
  // only for the answer to this search without filters.
  const wantAlternatives =
    current && found !== undefined && !filtered && (found.length === 0 || date !== undefined);
  const alternativesKey = JSON.stringify([from, to, date ?? null, seats]);
  const [alternativeAnswers, setAlternativeAnswers] = useState<
    ReadonlyMap<string, CallResult<typeof tripSearchAlternativesRoute>>
  >(new Map());
  const asked = useRef(new Set<string>());
  const [alternativesRound, setAlternativesRound] = useState(0);
  useEffect(() => {
    if (!wantAlternatives || asked.current.has(alternativesKey)) return;
    asked.current.add(alternativesKey);
    void session
      .call(tripSearchAlternativesRoute, {
        query: { from, to, seats, ...(date === undefined ? {} : { date }) },
      })
      .then((answer) => {
        setAlternativeAnswers((answers) => new Map(answers).set(alternativesKey, answer));
      });
  }, [wantAlternatives, alternativesKey, alternativesRound, session, from, to, date, seats]);
  const alternatives = alternativeAnswers.get(alternativesKey);
  const retryAlternatives = () => {
    asked.current.delete(alternativesKey);
    setAlternativeAnswers((answers) => {
      const kept = new Map(answers);
      kept.delete(alternativesKey);
      return kept;
    });
    setAlternativesRound((round) => round + 1);
  };
  // Pulling down searches again, and asks for other days and nearby
  // points again when they show (spec 16, 3.9). What shows stays until
  // each new answer comes, and stays if it fails.
  const refresh = async () => {
    const key = alternativesKey;
    const [search, others] = await Promise.all([
      pull(({ answer }) => answer.ok),
      wantAlternatives
        ? session
            .call(tripSearchAlternativesRoute, {
              query: { from, to, seats, ...(date === undefined ? {} : { date }) },
            })
            .then((answer) => {
              if (answer.ok) {
                setAlternativeAnswers((answers) => new Map(answers).set(key, answer));
              }
              return answer.ok;
            })
        : Promise.resolve(null),
    ]);
    return search === false || others === false ? false : search;
  };
  const otherDays =
    alternatives?.ok === true
      ? alternatives.data.days.filter((day) => day.count > 0 && day.date >= isoDay(dayOf(now())))
      : [];

  const title = t("search.route", { from: searched.from, to: searched.to });
  const summary = t("search.summary", {
    day:
      date === undefined ? t("search.anyDay") : capitalised(formatShortDay(date, locale), locale),
    seats: t("search.seatCount", { count: seats }),
  });

  const otherDayChips =
    otherDays.length === 0 ? null : (
      <View style={styles.wrap}>
        {otherDays.map((day) => (
          <Chip
            key={day.date}
            role="button"
            label={capitalised(
              t("results.otherDay", { day: formatShortDay(day.date, locale), count: day.count }),
              locale,
            )}
            selected={false}
            onToggle={() => {
              router.setParams({ date: day.date });
            }}
          />
        ))}
      </View>
    );

  // An old answer stays while a changed search loads only when it has trips
  // for the same route and seats: "nothing matches" and failures speak about
  // the search they answered.
  const loading =
    result === undefined || (!current && (!sameRoute || found === undefined || found.length === 0));

  // The trips the list shows: those found, or those from nearby points when
  // nothing matches. A wide screen marks the one its map shows.
  const listed: readonly TripSearchResult[] =
    loading || found === undefined
      ? []
      : found.length > 0
        ? found
        : !filtered && alternatives?.ok === true
          ? alternatives.data.nearby
          : [];
  const shown = listed.find((one) => one.tripId === shownId) ?? listed[0];
  const onMap: OnMap | undefined = wide ? { shown: shown?.tripId, onShow: setShownId } : undefined;
  // A wide screen always has the map, without a trip while there is none
  // to show, so the list keeps its place, and what has focus in it, whatever
  // a filter or a changed search finds.
  const map = wide ? <ResultsMap results={listed} shown={shown} /> : undefined;

  let body: ReactNode;
  if (loading) {
    body = <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />;
  } else if (!result.ok) {
    body = (
      <>
        <Notice message={failureText(t, result)} />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </>
    );
  } else if (found !== undefined && found.length > 0) {
    body = (
      <>
        <Found
          results={found}
          searched={searched}
          seats={seats}
          grouped={sort === "departure"}
          onMap={onMap}
        />
        <ListEnd count={found.length} onDay={date !== undefined} />
        {otherDays.length === 0 ? null : (
          <View testID="other-days" style={styles.day}>
            <Heading>{t("results.otherDays")}</Heading>
            {otherDayChips}
          </View>
        )}
      </>
    );
  } else if (filtered) {
    body = (
      <>
        <Heading>{t("results.noneFiltered")}</Heading>
        <Button
          variant="secondary"
          label={t("results.clearFilters")}
          onPress={() => {
            setInstant(false);
            setTimeOfDay(null);
          }}
        />
      </>
    );
  } else {
    body = (
      <NothingMatches
        date={date}
        alternatives={alternatives}
        onRetry={retryAlternatives}
        otherDayChips={otherDayChips}
        searched={searched}
        seats={seats}
        onMap={onMap}
      />
    );
  }

  const close = () => {
    setChanging(false);
    setClosed((count) => count + 1);
  };

  if (changing) {
    return (
      <Screen aside={map}>
        <ChangeSearch
          initial={{
            from: { id: from, name: { is: searched.from, en: searched.from } },
            to: { id: to, name: { is: searched.to, en: searched.to } },
            date: date ?? null,
            seats,
          }}
          onSearch={(query) => {
            // The same screen with the new search; any day clears the date.
            router.setParams(resultsParams(query, locale));
            close();
          }}
          onCancel={close}
        />
      </Screen>
    );
  }

  const sortLabel = sort === "departure" ? t("results.sortEarliest") : t("results.sortCheapest");
  // The rides the list shows, counted once, and said when a filter changes
  // it, also when it leaves none: the count stays, so that is heard too.
  const counted =
    !loading && found !== undefined && (found.length > 0 || filtered) ? found.length : null;
  return (
    <Screen siteFooter aside={map} refresh={refresh}>
      <View style={styles.header}>
        <BackButton fallback="/" />
        {/* The screen's heading, with the button inside it as in an
            accordion: on the web an h1 around the button. */}
        <View testID="results-heading" accessibilityRole="header" style={styles.grow}>
          <TakesFocus key={closed} when={closed > 0}>
            <Card
              accessibilityLabel={t("results.changeSearchLabel", { route: title, summary })}
              onPress={() => {
                setOpen(null);
                setChanging(true);
              }}
            >
              <View style={styles.headerRow}>
                <View style={styles.headerTexts}>
                  <Text style={[typography.bodyStrong, { color: palette.text }]}>{title}</Text>
                  <Text style={[typography.small, { color: palette.textMuted }]}>{summary}</Text>
                </View>
                <Text style={[typography.label, { color: palette.primary }]}>
                  {t("results.change")}
                </Text>
              </View>
            </Card>
          </TakesFocus>
        </View>
      </View>
      <View testID="results-row" style={styles.row}>
        <TakesFocus key={orderChosen} when={orderChosen > 0}>
          <Chip
            role="button"
            label={sortLabel}
            name={t("results.sort", { order: sortLabel })}
            selected={false}
            expanded={open === "order"}
            onToggle={() => {
              setOpen(open === "order" ? null : "order");
            }}
          />
        </TakesFocus>
        <Chip
          role="button"
          icon={SlidersHorizontal}
          label={
            filtersOn === 0 ? t("results.filters") : t("results.filtersOn", { count: filtersOn })
          }
          selected={filtersOn > 0}
          expanded={open === "filters"}
          onToggle={() => {
            setOpen(open === "filters" ? null : "filters");
          }}
        />
        {counted === null ? null : (
          <Text
            testID="results-count"
            accessibilityLiveRegion="polite"
            style={[typography.small, styles.count, { color: palette.textMuted }]}
          >
            {t("results.tripCount", { count: counted })}
          </Text>
        )}
      </View>
      {open === "filters" ? (
        <View
          testID="results-filters"
          role="group"
          aria-label={t("results.filters")}
          style={styles.wrap}
        >
          <Chip
            label={t("results.instantOnly")}
            selected={instant}
            onToggle={() => {
              setInstant(!instant);
            }}
          />
          {timesOfDay.map((time) => (
            <Chip
              key={time}
              label={t(timeKeys[time])}
              selected={timeOfDay === time}
              onToggle={() => {
                setTimeOfDay(timeOfDay === time ? null : time);
              }}
            />
          ))}
        </View>
      ) : null}
      {open === "order" ? (
        <View accessibilityRole="radiogroup" aria-label={t("results.sortBy")} style={styles.chips}>
          {(["departure", "price"] as const).map((order) => (
            <Chip
              key={order}
              role="radio"
              label={order === "departure" ? t("results.sortEarliest") : t("results.sortCheapest")}
              selected={sort === order}
              onToggle={() => {
                setSort(order);
                setOpen(null);
                setOrderChosen((count) => count + 1);
              }}
            />
          ))}
        </View>
      ) : null}
      {showsOtherTime(now()) ? <Notice kind="info" message={t("results.icelandTime")} /> : null}
      {body}
    </Screen>
  );
}

/**
 * The search, filled in, in place of the results (spec 16, 3.8): Find a ride
 * shows the new results, Cancel the ones before.
 */
function ChangeSearch({
  initial,
  onSearch,
  onCancel,
}: {
  readonly initial: SearchQuery;
  readonly onSearch: (query: SearchQuery) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useLanguage();
  const route = useRouteSearch(onSearch, initial);
  return (
    <>
      <TakesFocus>
        <Heading>{t("results.changeSearch")}</Heading>
      </TakesFocus>
      {route.fields(<Button main label={t("welcome.findRide")} onPress={route.submit} />)}
      <Button variant="text" label={t("common.cancel")} onPress={onCancel} />
    </>
  );
}

/**
 * On a wide screen, the map beside the list: the trip it shows, and how a
 * card says that the pointer or the keyboard came to it.
 */
interface OnMap {
  readonly shown: string | undefined;
  readonly onShow: (tripId: string) => void;
}

/** What a trip's card needs for the map: its mark, and to say it is looked at. */
function mapProps(onMap: OnMap | undefined, result: TripSearchResult) {
  if (onMap === undefined) return {};
  return {
    marked: onMap.shown === result.tripId,
    onShow: () => {
      onMap.onShow(result.tripId);
    },
  };
}

/** The trips found: by day when sorted by time, in one list when by price. */
function Found({
  results,
  searched,
  seats,
  grouped,
  onMap,
}: {
  readonly results: readonly TripSearchResult[];
  readonly searched: SearchedNames;
  readonly seats: number;
  readonly grouped: boolean;
  readonly onMap: OnMap | undefined;
}) {
  const { locale } = useLanguage();
  if (!grouped) {
    return results.map((result) => (
      <ResultTicket
        key={result.tripId}
        result={result}
        searched={searched}
        seats={seats}
        dayInName
        {...mapProps(onMap, result)}
      />
    ));
  }
  const days = new Map<string, TripSearchResult[]>();
  for (const result of results) {
    const day = isoDay(dayOf(new Date(result.board.plannedAt)));
    days.set(day, [...(days.get(day) ?? []), result]);
  }
  return [...days].map(([day, onDay]) => (
    <View key={day} style={styles.day}>
      <Heading>
        {capitalised(formatDay(new Date(onDay[0]?.board.plannedAt ?? 0), locale), locale)}
      </Heading>
      {onDay.map((result) => (
        <ResultTicket
          key={result.tripId}
          result={result}
          searched={searched}
          seats={seats}
          {...mapProps(onMap, result)}
        />
      ))}
    </View>
  ));
}

/**
 * What the end of the list says to do next. Cut at the first fifty, a
 * search of any day says to choose one, and a search of one day to filter
 * by time of day; with every ride shown, a search of one day says to try
 * another, which the days under it offer.
 */
function endLine(first: boolean, onDay: boolean): MessageKey {
  if (first) return onDay ? "results.endFirstOnlyDay" : "results.endFirstOnly";
  return onDay ? "results.endOtherDay" : "results.endAnyDay";
}

/**
 * Where the list ends (spec 31, 3.6 item 4): the puffin by its pin, that
 * this is every ride found, or the first fifty, and All rides, which shows
 * every ride leaving soon.
 */
function ListEnd({ count, onDay }: { readonly count: number; readonly onDay: boolean }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const first = count >= resultLimit;
  return (
    <Card>
      <View testID="results-end" style={styles.end}>
        <PuffinByPin height={sizes.scenePuffinSmall} />
        <View style={styles.endTexts}>
          <Text style={[typography.bodyStrong, { color: palette.text }]}>
            {first ? t("results.firstOnly", { count }) : t("results.everyTrip")}
          </Text>
          <Text style={[typography.small, { color: palette.textMuted }]}>
            {t(endLine(first, onDay))}
          </Text>
        </View>
        <Button variant="text" label={t("results.allRides")} href="/rides" />
      </View>
    </Card>
  );
}

/** Spec 4, 3.5: other days, trips from nearby points, or none at all. */
function NothingMatches({
  date,
  alternatives,
  onRetry,
  otherDayChips,
  searched,
  seats,
  onMap,
}: {
  readonly date: string | undefined;
  readonly alternatives: CallResult<typeof tripSearchAlternativesRoute> | undefined;
  readonly onRetry: () => void;
  readonly otherDayChips: ReactNode;
  readonly searched: SearchedNames;
  readonly seats: number;
  readonly onMap: OnMap | undefined;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const state = useSessionState();
  const none =
    date === undefined
      ? t("results.noneAnyDay")
      : t("results.none", { date: formatShortDay(date, locale) });
  if (alternatives === undefined) {
    return (
      <>
        <Heading>{none}</Heading>
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </>
    );
  }
  if (!alternatives.ok) {
    return (
      <>
        <Heading>{none}</Heading>
        <Notice message={failureText(t, alternatives)} />
        <Button variant="secondary" label={t("common.retry")} onPress={onRetry} />
      </>
    );
  }
  const nearby = alternatives.data.nearby;
  const hasOtherDays = otherDayChips !== null;
  if (!hasOtherDays && nearby.length === 0 && date === undefined) {
    return (
      <>
        <Heading>{t("results.noTripsYet")}</Heading>
        <Body>{t("results.noTripsYetHelp")}</Body>
        <Button
          variant="secondary"
          label={t("driver.offerRide")}
          onPress={() => {
            offerRide(state.status === "signedIn" ? state.me : null);
          }}
        />
      </>
    );
  }
  return (
    <>
      <Heading>{none}</Heading>
      {hasOtherDays ? (
        <>
          <Heading>{t("results.otherDays")}</Heading>
          {otherDayChips}
        </>
      ) : null}
      {nearby.length > 0 ? (
        <>
          <Heading>{t("results.nearbyPoints")}</Heading>
          {nearby.map((result) => (
            <ResultTicket
              key={result.tripId}
              result={result}
              searched={searched}
              seats={seats}
              dayInName
              {...mapProps(onMap, result)}
            />
          ))}
        </>
      ) : null}
      {!hasOtherDays && nearby.length === 0 ? (
        <>
          <Body>{t("results.noneAround")}</Body>
          <Button
            variant="secondary"
            label={t("results.searchAnyDay")}
            onPress={() => {
              router.setParams({ date: undefined });
            }}
          />
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerTexts: { flex: 1 },
  // The order, Filters and the count: one row, which wraps where large
  // text leaves no room, so nothing scrolls sideways.
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  // At the right of its row, or of the line it wraps to.
  count: { marginLeft: "auto" },
  chips: { flexDirection: "row", gap: spacing.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  day: { gap: spacing.ms },
  grow: { flex: 1 },
  // The puffin, the two lines, then the link; the link goes under them
  // where they leave it no room.
  end: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.ms },
  endTexts: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: sizes.wordsBeside },
});
