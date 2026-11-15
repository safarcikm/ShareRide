import { defaultTripSettings } from "@shareride/domain";
import { capitalised, formatShortDay } from "@shareride/i18n";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { Stepper } from "@/components/stepper";
import { Heading, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { dayOf, isoDay } from "@/lib/days";
import {
  clearRecentSearches,
  loadRecentSearches,
  type SearchQuery,
} from "@/search/recent-searches";
import { openSearch, useRouteSearch } from "@/search/route-search";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * The search form (spec 4, 3.1): from, to, an optional date and the seats,
 * with the last five searches for one-tap repeat. Anyone can search.
 */
export default function SearchForm() {
  const { locale, t } = useLanguage();
  const [seats, setSeats] = useState(1);
  const [recent, setRecent] = useState<SearchQuery[]>([]);

  useEffect(() => {
    let current = true;
    void loadRecentSearches(isoDay(dayOf(now()))).then((found) => {
      if (current) setRecent(found);
    });
    return () => {
      current = false;
    };
  }, []);

  const search = async (query: SearchQuery) => {
    setRecent(await openSearch(query, locale));
  };
  const route = useRouteSearch((query) => {
    void search(query);
  });
  if (route.picker !== null) return route.picker;

  return (
    <Screen
      footer={
        <Button
          main
          label={t("search.submit")}
          onPress={() => {
            route.submit(seats);
          }}
        />
      }
    >
      <View style={styles.header}>
        <BackButton />
      </View>
      <Title>{t("search.title")}</Title>
      {route.fields}
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
});
