import { defaultTripSettings } from "@shareride/domain";
import { capitalised, formatDay, formatShortDay, type Locale } from "@shareride/i18n";
import { router } from "expo-router";
import { useState, type ReactElement } from "react";
import { StyleSheet, View } from "react-native";
import { Calendar } from "@/components/calendar";
import { Chip } from "@/components/chip";
import { Notice } from "@/components/notice";
import { RouteEnds, type RouteEnd } from "@/components/route-ends";
import { Stepper } from "@/components/stepper";
import { Body, Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { addDays, dayOf, isoDay, noonOf, type Day } from "@/lib/days";
import { PlaceDropdown } from "@/meeting-points/place-dropdown";
import { searchEndOf } from "./search-end";
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
  /**
   * From and to, each with a place search that drops down under it, the
   * date, and a message when a place is missing.
   */
  readonly fields: ReactElement;
  /** Searches, once both places are chosen and differ. */
  readonly submit: () => void;
}

/**
 * From, to, an optional date and the seats (spec 4, 3.1; spec 16, 3.2), for
 * the search form and Find. `onSearch` gets the search once it can be made.
 */
export function useRouteSearch(onSearch: (query: SearchQuery) => void): RouteSearch {
  const { locale, t } = useLanguage();
  const today = dayOf(now());
  const [from, setFrom] = useState<SearchEnd | null>(null);
  const [to, setTo] = useState<SearchEnd | null>(null);
  const [date, setDate] = useState<Day | null>(null);
  const [seats, setSeats] = useState(1);
  const [choosingDay, setChoosingDay] = useState(false);
  const [picking, setPicking] = useState<RouteEnd | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const search =
    picking === null ? null : (
      <PlaceDropdown
        label={picking === "from" ? t("search.from") : t("search.to")}
        placeholder={t("search.typePlace")}
        onClose={() => {
          setPicking(null);
        }}
        onChoose={(result) => {
          setPicking(null);
          setMessage(null);
          if (picking === "from") setFrom(searchEndOf(result));
          else setTo(searchEndOf(result));
        }}
      />
    );

  const submit = () => {
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
        open={picking}
        search={search}
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
    </>
  );

  return { fields, submit };
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
