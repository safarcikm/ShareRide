import { defaultTripSettings } from "@shareride/domain";
import { capitalised, formatDay, formatShortDay } from "@shareride/i18n";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Calendar } from "@/components/calendar";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Notice } from "@/components/notice";
import { RouteEnds, type RouteEnd } from "@/components/route-ends";
import { Screen } from "@/components/screen";
import { Stepper } from "@/components/stepper";
import { Body, Heading, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { addDays, dayOf, isoDay, noonOf, type Day } from "@/lib/days";
import { SearchPlacePicker } from "@/search/place-picker";
import {
  clearRecentSearches,
  loadRecentSearches,
  saveRecentSearch,
  type SearchEnd,
  type SearchQuery,
} from "@/search/recent-searches";
import { resultsHref } from "@/search/results-href";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * The search form (spec 4, 3.1): from, to, an optional date and the seats,
 * with the last five searches for one-tap repeat. Anyone can search.
 */
export default function SearchForm() {
  const { locale, t } = useLanguage();
  const today = dayOf(now());
  const [from, setFrom] = useState<SearchEnd | null>(null);
  const [to, setTo] = useState<SearchEnd | null>(null);
  const [date, setDate] = useState<Day | null>(null);
  const [choosingDay, setChoosingDay] = useState(false);
  const [seats, setSeats] = useState(1);
  const [picking, setPicking] = useState<RouteEnd | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [recent, setRecent] = useState<SearchQuery[]>([]);

  useEffect(() => {
    let current = true;
    void loadRecentSearches(isoDay(today)).then((found) => {
      if (current) setRecent(found);
    });
    return () => {
      current = false;
    };
    // Once, when the form opens; today does not change while it is open.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const search = async (query: SearchQuery) => {
    setRecent(await saveRecentSearch(query, isoDay(today)));
    router.push(resultsHref(query, locale));
  };

  if (picking !== null) {
    return (
      <SearchPlacePicker
        title={picking === "from" ? t("search.pickFrom") : t("search.pickTo")}
        onCancel={() => {
          setPicking(null);
        }}
        onChoose={(end) => {
          setPicking(null);
          setMessage(null);
          if (picking === "from") setFrom(end);
          else setTo(end);
        }}
      />
    );
  }

  const submit = () => {
    if (from === null || to === null) {
      setMessage(t("search.needBoth"));
      return;
    }
    if (from.id === to.id) {
      setMessage(t("search.samePlace"));
      return;
    }
    void search({ from, to, date: date === null ? null : isoDay(date), seats });
  };

  return (
    <Screen footer={<Button main label={t("search.submit")} onPress={submit} />}>
      <View style={styles.header}>
        <BackButton />
      </View>
      <Title>{t("search.title")}</Title>
      <RouteEnds
        from={from === null ? null : from.name[locale]}
        to={to === null ? null : to.name[locale]}
        labels={{
          from: t("search.from"),
          to: t("search.to"),
          choose: t("search.choose"),
          swap: t("search.swap"),
        }}
        onPick={setPicking}
        onSwap={() => {
          setFrom(to);
          setTo(from);
        }}
      />
      <Notice message={message} />
      <Heading>{t("search.date")}</Heading>
      <View accessibilityRole="radiogroup" style={styles.chips}>
        <Chip
          role="radio"
          label={t("search.anyDay")}
          selected={date === null && !choosingDay}
          onToggle={() => {
            setDate(null);
            setChoosingDay(false);
          }}
        />
        <Chip
          role="radio"
          label={
            date === null
              ? t("search.chooseDay")
              : capitalised(formatShortDay(isoDay(date), locale), locale)
          }
          selected={date !== null || choosingDay}
          onToggle={() => {
            setChoosingDay(true);
          }}
        />
      </View>
      {choosingDay ? (
        <Calendar
          value={date}
          first={today}
          last={addDays(today, defaultTripSettings.maxDaysAhead)}
          onChange={(day) => {
            setDate(day);
          }}
        />
      ) : null}
      {date === null ? null : <Body>{capitalised(formatDay(noonOf(date), locale), locale)}</Body>}
      <Stepper
        label={t("search.seats")}
        value={seats}
        min={1}
        max={defaultTripSettings.maxSeats}
        onChange={setSeats}
        valueText={t("search.seatCount", { count: seats })}
        fewerLabel={t("search.fewerSeats")}
        moreLabel={t("search.moreSeats")}
      />
      {recent.length === 0 ? null : (
        <>
          <Heading>{t("search.recent")}</Heading>
          {recent.map((query) => (
            <RecentSearch
              key={`${query.from.id}-${query.to.id}-${query.date ?? ""}-${String(query.seats)}`}
              query={query}
              onPress={() => {
                void search(query);
              }}
            />
          ))}
          <Button
            variant="text"
            label={t("search.clearRecent")}
            onPress={() => {
              setRecent([]);
              void clearRecentSearches();
            }}
          />
        </>
      )}
    </Screen>
  );
}

function RecentSearch({
  query,
  onPress,
}: {
  readonly query: SearchQuery;
  readonly onPress: () => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const route = t("search.route", { from: query.from.name[locale], to: query.to.name[locale] });
  const summary = t("search.summary", {
    day:
      query.date === null
        ? t("search.anyDay")
        : capitalised(formatShortDay(query.date, locale), locale),
    seats: t("search.seatCount", { count: query.seats }),
  });
  return (
    <Card onPress={onPress} accessibilityLabel={`${route}, ${summary}`}>
      <View>
        <Text style={[typography.bodyStrong, { color: palette.text }]}>{route}</Text>
        <Text style={[typography.small, { color: palette.textMuted }]}>{summary}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
