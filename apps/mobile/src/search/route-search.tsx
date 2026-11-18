import { defaultTripSettings } from "@shareride/domain";
import { capitalised, formatDay, formatShortDay, type Locale } from "@shareride/i18n";
import { router } from "expo-router";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import {
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactElement,
  type RefObject,
} from "react";
import {
  AccessibilityInfo,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMaxSeats } from "@/beta/config";
import { Calendar } from "@/components/calendar";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Icon } from "@/components/icon";
import { Notice } from "@/components/notice";
import { RouteEnds, type RouteEnd } from "@/components/route-ends";
import { Stepper } from "@/components/stepper";
import { Body, Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { addDays, dayOf, isoDay, noonOf, type Day } from "@/lib/days";
import { escapeOnWeb } from "@/lib/escape-on-web";
import { PlaceDropdown } from "@/meeting-points/place-dropdown";
import { searchEndOf } from "./search-end";
import { saveRecentSearch, type SearchEnd, type SearchQuery } from "./recent-searches";
import { resultsHref } from "./results-href";
import { useHover } from "@/theme/hover";
import { iconSizes, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

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
  /**
   * The same search as one row in a card, for a wide page (spec 18, 3.5):
   * From, the swap button, To, the date, the seats and `action`, the button
   * that searches. From, To and the date open their choices under
   * themselves, in their own part of the row. It reads the same state as
   * `fields`, so a window that turns narrow or wide keeps what was chosen.
   */
  readonly row: (action: ReactElement) => ReactElement;
  /** Searches, once both places are chosen and differ. */
  readonly submit: () => void;
}

/**
 * From, to, an optional date and the seats (spec 4, 3.1; spec 16, 3.2), for
 * the search form, Find and changing a search from its results (spec 16,
 * 3.8), which starts it filled in with `initial`. `onSearch` gets the search
 * once it can be made.
 */
export function useRouteSearch(
  onSearch: (query: SearchQuery) => void,
  initial?: SearchQuery,
): RouteSearch {
  const { locale, t } = useLanguage();
  const maxSeats = useMaxSeats();
  const today = dayOf(now());
  const [from, setFrom] = useState<SearchEnd | null>(initial?.from ?? null);
  const [to, setTo] = useState<SearchEnd | null>(initial?.to ?? null);
  const [date, setDate] = useState<Day | null>(() => dayFromIso(initial?.date ?? null));
  const [seats, setSeats] = useState(initial?.seats ?? 1);
  const [choosingDay, setChoosingDay] = useState(false);
  const [picking, setPicking] = useState<RouteEnd | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // In the row, once the calendar closes, focus goes back to the date it
  // was for, rather than to the top of the page on the web.
  const dateField = useRef<DateFieldRef>(null);
  const wasChoosingDay = useRef(choosingDay);
  useEffect(() => {
    const closed = wasChoosingDay.current && !choosingDay;
    wasChoosingDay.current = choosingDay;
    const field = dateField.current;
    if (!closed || field === null) return;
    if (Platform.OS === "web") (field as unknown as { focus: () => void }).focus();
    else AccessibilityInfo.sendAccessibilityEvent(field, "focus");
  }, [choosingDay]);

  // In the row, Android's back closes the calendar, as it does a list of
  // places, rather than leaving the screen. In `fields` the calendar is a
  // part of the form and stays.
  useEffect(() => {
    if (!choosingDay) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (dateField.current === null) return false;
      setChoosingDay(false);
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [choosingDay]);

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

  const ends = (direction: "column" | "row") => (
    <RouteEnds
      direction={direction}
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
  );
  const calendar = (onChange: (day: Day) => void) => (
    <Calendar
      value={date}
      first={today}
      last={addDays(today, defaultTripSettings.maxDaysAhead)}
      onChange={onChange}
    />
  );
  const seatsStepper = (caption: boolean) => (
    <Stepper
      caption={caption}
      label={t("search.seats")}
      value={seats}
      min={1}
      max={maxSeats}
      onChange={setSeats}
      valueText={t("search.seatCount", { count: seats })}
      fewerLabel={t("search.fewerSeats")}
      moreLabel={t("search.moreSeats")}
    />
  );
  const shortDay = date === null ? null : capitalised(formatShortDay(isoDay(date), locale), locale);

  const fields = (
    <>
      {ends("column")}
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
          label={shortDay ?? t("search.chooseDay")}
          selected={date !== null || choosingDay}
          onToggle={() => {
            setChoosingDay(true);
          }}
        />
      </View>
      {choosingDay ? calendar(setDate) : null}
      {date === null ? null : <Body>{capitalised(formatDay(noonOf(date), locale), locale)}</Body>}
      {seatsStepper(false)}
    </>
  );

  const row = (action: ReactElement) => (
    <>
      <Card>
        <View testID="search-row" style={styles.row}>
          {ends("row")}
          {/* Escape closes the calendar from the date itself and from inside it. */}
          <View
            style={styles.rest}
            {...(choosingDay
              ? escapeOnWeb(() => {
                  setChoosingDay(false);
                })
              : {})}
          >
            <View style={styles.restRow}>
              <DateField
                fieldRef={dateField}
                label={t("search.date")}
                value={shortDay ?? t("search.anyDay")}
                chosen={date !== null}
                open={choosingDay}
                onPress={() => {
                  setChoosingDay(!choosingDay);
                }}
              />
              {seatsStepper(true)}
              <View style={styles.action}>{action}</View>
            </View>
            {choosingDay ? (
              <View style={styles.day}>
                {/* One choice with the days of the calendar, so a radio like them. */}
                <Chip
                  role="radio"
                  label={t("search.anyDay")}
                  selected={date === null}
                  onToggle={() => {
                    setDate(null);
                    setChoosingDay(false);
                  }}
                />
                {calendar((day) => {
                  setDate(day);
                  setChoosingDay(false);
                })}
              </View>
            ) : null}
          </View>
        </View>
      </Card>
      <Notice message={message} />
    </>
  );

  return { fields, row, submit };
}

type DateFieldRef = ComponentRef<typeof View>;

/**
 * The date in the search row: its caption over the day, or "Any day", with
 * a chevron. Pressing it opens and closes the calendar under it.
 */
function DateField({
  fieldRef,
  label,
  value,
  chosen,
  open,
  onPress,
}: {
  readonly fieldRef: RefObject<DateFieldRef | null>;
  readonly label: string;
  readonly value: string;
  /** A day is chosen: it shows in `bodyStrong`, as a chosen place does. */
  readonly chosen: boolean;
  readonly open: boolean;
  readonly onPress: () => void;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const [hovered, hover] = useHover();
  return (
    <Pressable
      ref={fieldRef}
      accessibilityRole="button"
      accessibilityLabel={t("trip.route.field", { field: label, value })}
      aria-expanded={open}
      onPress={onPress}
      {...hover}
      style={[styles.dateField, hovered && { backgroundColor: palette.primarySoft }]}
    >
      <Text style={[typography.caption, { color: palette.textMuted }]}>{label}</Text>
      <View style={styles.dateValue}>
        <Text style={[chosen ? typography.bodyStrong : typography.body, { color: palette.text }]}>
          {value}
        </Text>
        <Icon
          icon={open ? ChevronUp : ChevronDown}
          color={palette.textMuted}
          size={iconSizes.inline}
        />
      </View>
    </Pressable>
  );
}

/** "2026-11-15" as a day, or null. */
function dayFromIso(date: string | null): Day | null {
  const match = date === null ? null : /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match === null) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  // The two ends grow; the date, the seats and the button keep their size
  // and, where the row is too narrow for all, go to a second line together,
  // at the right. A part that opens grows downwards and the rest stay put.
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "flex-end",
    columnGap: spacing.lg,
    rowGap: spacing.md,
  },
  rest: { gap: spacing.md },
  restRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.lg },
  // Beside the values, under the captions.
  action: { marginTop: typography.caption.lineHeight + spacing.xs },
  // The tint under the pointer reaches a little past the text, as a `Row`'s does.
  dateField: {
    gap: spacing.xs,
    borderRadius: radii.control,
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
  },
  dateValue: {
    minHeight: sizes.buttonHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  day: { gap: spacing.md },
});
