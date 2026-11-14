import { formatDay, formatMonth, formatWeekdays } from "@shareride/i18n";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/i18n/language";
import { addDays, compareDays, daysInMonth, noonOf, weekdayOf, type Day } from "@/lib/days";
import { radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { IconButton } from "./icon-button";
import { spaceKeyPresses } from "./space-key";

/**
 * A month of days to pick one from, weeks starting on Monday as in Iceland.
 * Days before `first` or after `last` cannot be picked. Each day is a radio
 * whose name is the whole date, such as "Sunday 15 November".
 */
export function Calendar({
  value,
  first,
  last,
  onChange,
}: {
  readonly value: Day | null;
  readonly first: Day;
  readonly last: Day;
  readonly onChange: (day: Day) => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const start = value ?? first;
  const [shown, setShown] = useState({ year: start.year, month: start.month });
  const monthStart: Day = { ...shown, day: 1 };
  const monthEnd: Day = { ...shown, day: daysInMonth(shown.year, shown.month) };
  const move = (months: number) => {
    const next = new Date(Date.UTC(shown.year, shown.month - 1 + months, 1));
    setShown({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 });
  };

  const cells: (Day | null)[] = Array.from({ length: weekdayOf(monthStart) }, () => null);
  for (let day = 1; day <= monthEnd.day; day += 1) cells.push({ ...shown, day });
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, week) =>
    cells.slice(week * 7, week * 7 + 7),
  );

  return (
    <View style={styles.calendar}>
      <View style={styles.header}>
        <IconButton
          icon={ChevronLeft}
          label={t("calendar.previousMonth")}
          disabled={compareDays(addDays(monthStart, -1), first) < 0}
          onPress={() => {
            move(-1);
          }}
        />
        <Text
          accessibilityLiveRegion="polite"
          style={[typography.heading, styles.month, { color: palette.text }]}
        >
          {`${formatMonth(shown.month, locale)} ${String(shown.year)}`}
        </Text>
        <IconButton
          icon={ChevronRight}
          label={t("calendar.nextMonth")}
          disabled={compareDays(addDays(monthEnd, 1), last) > 0}
          onPress={() => {
            move(1);
          }}
        />
      </View>
      <View
        style={styles.week}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      >
        {formatWeekdays(locale).map((name) => (
          <Text
            key={name}
            style={[typography.caption, styles.weekday, { color: palette.textMuted }]}
          >
            {name}
          </Text>
        ))}
      </View>
      <View accessibilityRole="radiogroup" style={styles.days}>
        {weeks.map((week, index) => (
          <View key={index} style={styles.week}>
            {week.map((day, column) =>
              day === null ? (
                <View key={`blank-${String(column)}`} style={styles.cell} />
              ) : (
                <DayButton
                  key={day.day}
                  day={day}
                  label={formatDay(noonOf(day), locale)}
                  selected={value !== null && compareDays(day, value) === 0}
                  allowed={compareDays(day, first) >= 0 && compareDays(day, last) <= 0}
                  onChange={onChange}
                />
              ),
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function DayButton({
  day,
  label,
  selected,
  allowed,
  onChange,
}: {
  readonly day: Day;
  readonly label: string;
  readonly selected: boolean;
  readonly allowed: boolean;
  readonly onChange: (day: Day) => void;
}) {
  const palette = usePalette();
  const choose = () => {
    onChange(day);
  };
  return (
    <View style={styles.cell}>
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={label}
        aria-checked={selected}
        aria-disabled={!allowed}
        disabled={!allowed}
        onPress={choose}
        {...(allowed ? spaceKeyPresses(choose) : {})}
        style={[styles.day, selected && { backgroundColor: palette.primary }]}
      >
        <Text
          style={[
            typography.label,
            {
              color: selected ? palette.onPrimary : allowed ? palette.text : palette.textMuted,
            },
          ]}
        >
          {day.day}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  calendar: { gap: spacing.sm },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  month: { flex: 1, textAlign: "center" },
  days: { gap: spacing.xs },
  week: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center" },
  cell: { flex: 1, alignItems: "center" },
  day: {
    width: sizes.calendarDay,
    height: sizes.calendarDay,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
