import { capitalised, formatShortDay } from "@shareride/i18n";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { Heading } from "@/components/text";
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
 * Find a ride (spec 4, 3.1; spec 31, 3.5 item 3): the front page's search
 * card, with its button in it, under the title, and the last five searches
 * for one-tap repeat. There is one search form. Anyone can search.
 */
export default function SearchForm() {
  const { locale, t } = useLanguage();
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

  return (
    <Screen>
      <ScreenHead title={t("search.title")} />
      {route.fields(<Button main label={t("welcome.findRide")} onPress={route.submit} />)}
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
