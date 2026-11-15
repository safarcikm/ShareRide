import { defaultTripSettings } from "@shareride/domain";
import { capitalised, formatDay, formatShortDay, type Locale } from "@shareride/i18n";
import { router } from "expo-router";
import { useEffect, useState, type ReactElement } from "react";
import { BackHandler, StyleSheet, View } from "react-native";
import { Calendar } from "@/components/calendar";
import { Chip } from "@/components/chip";
import { Notice } from "@/components/notice";
import { RouteEnds, type RouteEnd } from "@/components/route-ends";
import { Body, Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { addDays, dayOf, isoDay, noonOf, type Day } from "@/lib/days";
import { SearchPlacePicker } from "./place-picker";
import { saveRecentSearch, type SearchEnd, type SearchQuery } from "./recent-searches";
import { resultsHref } from "./results-href";
import { spacing } from "@/theme/tokens";

/** Keeps a search among the recent ones and opens its results; resolves to the recent searches. */
export async function openSearch(query: SearchQuery, locale: Locale): Promise<SearchQuery[]> {
  const recent = await saveRecentSearch(query, isoDay(dayOf(now())));
  router.push(resultsHref(query, locale));
  return recent;
}

export interface RouteSearch {
  /** From and to, the date, and a message when a place is missing. */
  readonly fields: ReactElement;
  /** The place search, shown instead of the screen while a place is chosen. */
  readonly picker: ReactElement | null;
  /** Searches for the seats given, once both places are chosen and differ. */
  readonly submit: (seats: number) => void;
}

/**
 * From, to and an optional date (spec 4, 3.1), for the search form and the
 * front page. `onSearch` gets the search once it can be made.
 */
export function useRouteSearch(onSearch: (query: SearchQuery) => void): RouteSearch {
  const { locale, t } = useLanguage();
  const today = dayOf(now());
  const [from, setFrom] = useState<SearchEnd | null>(null);
  const [to, setTo] = useState<SearchEnd | null>(null);
  const [date, setDate] = useState<Day | null>(null);
  const [choosingDay, setChoosingDay] = useState(false);
  const [picking, setPicking] = useState<RouteEnd | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Android's back closes the place search, as it would a screen, rather
  // than leaving the screen under it (or the app, on the front page).
  useEffect(() => {
    if (picking === null) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setPicking(null);
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [picking]);

  const picker =
    picking === null ? null : (
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

  const submit = (seats: number) => {
    if (from === null || to === null) {
      setMessage(t("search.needBoth"));
      return;
    }
    if (from.id === to.id) {
      setMessage(t("search.samePlace"));
      return;
    }
    onSearch({ from, to, date: date === null ? null : isoDay(date), seats });
  };

  const fields = (
    <>
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
    </>
  );

  return { fields, picker, submit };
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
