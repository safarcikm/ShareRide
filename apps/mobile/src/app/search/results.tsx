import type { CallFailure, CallResult } from "@shareride/api-client";
import {
  tripSearchAlternativesRoute,
  tripSearchRoute,
  type TripSearchResult,
} from "@shareride/contracts";
import { defaultTripSettings, timesOfDay, type TimeOfDay } from "@shareride/domain";
import { capitalised, formatDay, formatShortDay, type Translate } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { errorText, formatWait } from "@/auth/errors";
import { useSession, useSessionState } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Heading, sectionLevel } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { dayOf, isoDay, showsOtherTime } from "@/lib/days";
import { useLoaded } from "@/lib/use-loaded";
import { ResultCard, type SearchedNames } from "@/search/result-card";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

type Sort = "departure" | "price";

/** The most trips one search answers (the server's limit). */
const resultLimit = 50;

const timeKeys = {
  morning: "results.morning",
  afternoon: "results.afternoon",
  evening: "results.evening",
} as const satisfies Record<TimeOfDay, string>;

function failureText(t: Translate, failure: CallFailure): string {
  if (failure.error.code === "rate_limited") {
    return t("results.rateLimited", {
      wait: formatWait(t, failure.error.retryAfterSeconds ?? 60),
    });
  }
  return failure.error.code === "network_error" ? errorText(t, failure) : t("results.failed");
}

/**
 * Search results (spec 4, 3.4 and 3.5): trips for the passenger's part,
 * sorted by time or price, filtered by instant booking and time of day, and
 * grouped by day. When nothing matches, the days around the date and trips
 * from meeting points nearby.
 */
export default function SearchResults() {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
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
  const seats = Math.min(Math.max(Number(params.seats) || 1, 1), defaultTripSettings.maxSeats);
  const searched: SearchedNames = { from: params.fromName ?? "", to: params.toName ?? "" };
  const [sort, setSort] = useState<Sort>("departure");
  const [instant, setInstant] = useState(false);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | null>(null);
  const filtered = instant || timeOfDay !== null;

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
  const { value: loaded, reload } = useLoaded(load);
  // The last answer stays on screen while a changed search loads.
  const result = loaded?.answer;
  const found = result?.ok === true ? result.data.results : undefined;
  const current = loaded?.query === query;

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

  let body: ReactNode;
  // An old answer stays while a changed search loads only when it has trips:
  // "nothing matches" and failures speak about the search they answered.
  if (result === undefined || (!current && (found === undefined || found.length === 0))) {
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
        <Found results={found} searched={searched} seats={seats} grouped={sort === "departure"} />
        <Body>
          {found.length >= resultLimit
            ? t("results.firstOnly", { count: found.length })
            : t("results.everyTrip")}
        </Body>
        {otherDays.length === 0 ? null : (
          <>
            <Heading>{t("results.otherDays")}</Heading>
            {otherDayChips}
          </>
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
      />
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <BackButton fallback="/search" />
        <View style={styles.headerTexts}>
          <Text accessibilityRole="header" style={[typography.heading, { color: palette.text }]}>
            {title}
          </Text>
          <Text style={[typography.small, { color: palette.textMuted }]}>{summary}</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        <View style={styles.chips}>
          <View accessibilityRole="radiogroup" style={styles.chips}>
            <Chip
              role="radio"
              label={t("results.sortEarliest")}
              selected={sort === "departure"}
              onToggle={() => {
                setSort("departure");
              }}
            />
            <Chip
              role="radio"
              label={t("results.sortCheapest")}
              selected={sort === "price"}
              onToggle={() => {
                setSort("price");
              }}
            />
          </View>
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
      </ScrollView>
      {showsOtherTime(now()) ? <Notice kind="info" message={t("results.icelandTime")} /> : null}
      {body}
    </Screen>
  );
}

/** The trips found: by day when sorted by time, in one list when by price. */
function Found({
  results,
  searched,
  seats,
  grouped,
}: {
  readonly results: readonly TripSearchResult[];
  readonly searched: SearchedNames;
  readonly seats: number;
  readonly grouped: boolean;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  if (!grouped) {
    return results.map((result) => (
      <ResultCard key={result.tripId} result={result} searched={searched} seats={seats} showDay />
    ));
  }
  const days = new Map<string, TripSearchResult[]>();
  for (const result of results) {
    const day = isoDay(dayOf(new Date(result.board.plannedAt)));
    days.set(day, [...(days.get(day) ?? []), result]);
  }
  return [...days].map(([day, onDay]) => (
    <View key={day} style={styles.day}>
      <View style={styles.dayHeader}>
        <Text
          accessibilityRole="header"
          {...sectionLevel}
          style={[typography.heading, styles.grow, { color: palette.text }]}
        >
          {capitalised(formatDay(new Date(onDay[0]?.board.plannedAt ?? 0), locale), locale)}
        </Text>
        <Text style={[typography.small, { color: palette.textMuted }]}>
          {t("results.tripCount", { count: onDay.length })}
        </Text>
      </View>
      {onDay.map((result) => (
        <ResultCard key={result.tripId} result={result} searched={searched} seats={seats} />
      ))}
    </View>
  ));
}

/** Spec 4, 3.5: other days, trips from nearby points, or none at all. */
function NothingMatches({
  date,
  alternatives,
  onRetry,
  otherDayChips,
  searched,
  seats,
}: {
  readonly date: string | undefined;
  readonly alternatives: CallResult<typeof tripSearchAlternativesRoute> | undefined;
  readonly onRetry: () => void;
  readonly otherDayChips: ReactNode;
  readonly searched: SearchedNames;
  readonly seats: number;
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
            router.push(state.status === "signedIn" ? "/drive" : "/sign-in");
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
            <ResultCard
              key={result.tripId}
              result={result}
              searched={searched}
              seats={seats}
              showDay
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
  headerTexts: { flex: 1 },
  // A row of chips that scrolls sideways; it must not grow to fill the screen.
  chipRow: { flexGrow: 0 },
  chips: { flexDirection: "row", gap: spacing.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  day: { gap: spacing.ms },
  dayHeader: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  grow: { flex: 1 },
});
