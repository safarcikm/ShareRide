import { updateTripRoute, type MyTrip } from "@shareride/contracts";
import {
  checkTimes,
  defaultTripSettings,
  plannedTimes,
  type TimeProblem,
  type TimeWarning,
} from "@shareride/domain";
import { formatClock, formatDay, formatDuration } from "@shareride/i18n";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Calendar } from "@/components/calendar";
import { Card } from "@/components/card";
import { FieldError } from "@/components/field-error";
import { Notice } from "@/components/notice";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Heading } from "@/components/text";
import { TimeField } from "@/components/time-field";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { minuteStep, roundUpClock } from "@/lib/clock-time";
import { addDays, compareDays, dayOf, showsOtherTime, type Day } from "@/lib/days";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { at, clockOf, earliestDeparture, onOrAfter, type Clock } from "@/trips/clock-input";
import { StepScreen } from "@/trips/step-screen";
import { goOn } from "@/trips/steps";
import { Loading, useDraftOnFocus } from "@/trips/use-draft";
import { useQuote } from "@/trips/use-quote";

/** Step 2, date and times (spec 3, 3.5). */
export default function TimeStepScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const { t } = useLanguage();
  const { value: result, reload } = useDraftOnFocus(id);
  if (result === undefined || !result.ok) {
    return (
      <StepScreen step="time" title={t("trip.time.title")}>
        <Loading failure={result} onRetry={reload} />
      </StepScreen>
    );
  }
  // A step left in the stack starts again from the draft when another step
  // changed it, so going back never saves an old copy over newer choices.
  return <TimeStep key={result.data.updatedAt} trip={result.data} fromReview={from === "review"} />;
}

function TimeStep({ trip, fromReview }: { readonly trip: MyTrip; readonly fromReview: boolean }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const today = dayOf(now());
  const names = trip.stops.map((stop) => stop.meetingPoint.name[locale]);
  const departsAt = trip.departsAt === null ? null : new Date(trip.departsAt);
  const [date, setDate] = useState<Day | null>(departsAt === null ? null : dayOf(departsAt));
  // Times not on 5 minutes, from before the wheel, show rounded up; the
  // departure stays on its day.
  const [chosen, setChosen] = useState<readonly (Clock | null)[]>(() =>
    trip.stops.map((stop, index) =>
      stop.plannedAt === null ? null : clockOf(new Date(stop.plannedAt), index === 0),
    ),
  );
  // Once the driver chooses a stop's time, the others are not planned again
  // until the departure changes.
  const [ownTimes, setOwnTimes] = useState(() =>
    trip.stops.slice(1).some((stop) => stop.plannedAt !== null),
  );
  /** The time whose wheel is open, by stop; one at a time. */
  const [open, setOpen] = useState<number | null>(null);
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const quoted = useQuote({
    stops: trip.stops.map((stop) => stop.meetingPoint.id),
    seats: trip.seats,
    priceLevel: trip.priceLevel,
  });
  const durations =
    quoted.result?.ok === true ? quoted.result.data.segments.map((s) => s.durationS) : null;

  /** The times at the other stops from the typical driving times. */
  const planFrom = (
    day: Day | null,
    departure: Clock | null,
    current: readonly (Clock | null)[],
  ) => {
    if (day === null || departure === null || durations === null) {
      return [departure, ...current.slice(1)];
    }
    const times = plannedTimes(at(day, departure), durations, defaultTripSettings);
    return [departure, ...times.slice(1).map((moment) => clockOf(moment))];
  };

  // Times not planned yet show as soon as the typical times arrive.
  const clocks =
    !ownTimes && chosen.slice(1).every((clock) => clock === null)
      ? planFrom(date, chosen[0] ?? null, chosen)
      : chosen;

  const moments: Date[] = [];
  if (date !== null) {
    for (const clock of clocks) {
      if (clock === null) break;
      const previous = moments.at(-1);
      moments.push(previous === undefined ? at(date, clock) : onOrAfter(previous, clock));
    }
  }
  const complete = moments.length === clocks.length;
  const checked =
    complete && durations !== null
      ? checkTimes(moments, durations, now(), defaultTripSettings)
      : { problems: [] as TimeProblem[], warnings: [] as TimeWarning[] };

  /** The error under a stop's time, after the first try to continue. */
  const errorAt = (index: number): string | undefined => {
    if (!tried) return undefined;
    if (clocks[index] === null) {
      return index === 0 ? t("trip.time.chooseTime") : t("trip.time.chooseStop");
    }
    for (const problem of checked.problems) {
      if (
        index === 0 &&
        (problem.code === "departure_too_soon" || problem.code === "departure_too_far")
      ) {
        return t(`trip.problem.${problem.code}`);
      }
      if ("segment" in problem && problem.segment + 1 === index) {
        const before = names[index - 1] ?? "";
        return problem.code === "times_not_increasing"
          ? t("trip.time.notIncreasing", { name: before })
          : t("trip.time.tooFast", {
              name: before,
              duration: formatDuration(durations?.[problem.segment] ?? 0, locale),
            });
      }
    }
    return undefined;
  };

  /**
   * The day when a stop falls on a later one, and a long break. Both show
   * together, so a time chosen earlier than the stop before, which moves to
   * the next day, is never hidden behind the break.
   */
  const helpAt = (index: number): string | undefined => {
    const warning = checked.warnings.find((found) => found.segment + 1 === index);
    const duration = formatDuration(durations?.[warning?.segment ?? 0] ?? 0, locale);
    const moment = moments[index];
    const later = moment !== undefined && date !== null && compareDays(dayOf(moment), date) > 0;
    const day = moment === undefined ? "" : formatDay(moment, locale);
    if (later && warning !== undefined) return t("trip.time.onDayLongBreak", { day, duration });
    if (later) return t("trip.time.onDay", { day });
    if (warning !== undefined) return t("trip.time.longBreak", { duration });
    return undefined;
  };

  const save = async () => {
    setTried(true);
    setFailure(null);
    if (date === null || !complete || durations === null || checked.problems.length > 0) return;
    setBusy(true);
    const saved = await session.call(updateTripRoute, {
      params: { id: trip.id },
      body: { plannedTimes: moments.map((moment) => moment.toISOString()) },
    });
    setBusy(false);
    if (!saved.ok) {
      setFailure(
        saved.error.code === "distances_pending" ? t("trip.distancesPending") : errorText(t, saved),
      );
      return;
    }
    goOn(trip.id, "price", fromReview);
  };

  // The times at the stops start folded, worked out for the driver (spec 16,
  // 3.6, item 3). Change unfolds them, and so does a problem with one once
  // the departure is known, or a stop still without a time when the others
  // are. Unfolded, they stay so, even once that stop has a time.
  const [changing, setChanging] = useState(false);
  const [unfoldedBySelf, setUnfoldedBySelf] = useState(false);
  const stopsKnown = clocks.slice(1).every((clock) => clock !== null);
  // "Worked out" only while the stops show what the typical driving times
  // give, never for times the driver chose.
  const planned = planFrom(date, clocks[0] ?? null, clocks);
  const workedOut =
    durations !== null && clocks.every((clock, index) => sameClock(clock, planned[index]));
  const departureKnown = date !== null && clocks[0] !== null && clocks[0] !== undefined;
  const stopProblem = clocks.slice(1).some((_, offset) => errorAt(offset + 1) !== undefined);
  const needsUnfolding = departureKnown && (stopProblem || (durations !== null && !stopsKnown));
  if (needsUnfolding && !unfoldedBySelf) setUnfoldedBySelf(true);
  const unfolded = changing || unfoldedBySelf || needsUnfolding;
  /** A stop as the folded times show it: its time and name, and the day when later. */
  const foldedLine = (index: number) => {
    const name = names[index] ?? "";
    const moment = moments[index];
    if (moment === undefined || date === null) return name;
    const time = formatClock(moment);
    return compareDays(dayOf(moment), date) > 0
      ? t("trip.review.stopTimeOnDay", { time, name, day: formatDay(moment, locale) })
      : t("trip.review.stopTime", { time, name });
  };

  const help = showsOtherTime(now()) ? t("trip.icelandTime") : undefined;
  /** Where a wheel starts when its stop has no time yet: after the time before it. */
  const suggestedAt = (index: number): Clock => {
    const before = clocks
      .slice(0, index)
      .reverse()
      .find((clock) => clock !== null);
    if (before === undefined) return earliestDeparture(now());
    return roundUpClock({ hour: before.hour, minute: before.minute + minuteStep });
  };
  const wheel = (index: number) => ({
    open: open === index,
    onOpen: () => {
      setOpen(index);
    },
    onClose: () => {
      setOpen(null);
    },
    suggested: suggestedAt(index),
  });
  return (
    <StepScreen
      step="time"
      title={t("trip.time.title")}
      footer={
        <Button
          main
          label={fromReview ? t("trip.saveChanges") : t("trip.time.next")}
          busy={busy}
          onPress={() => {
            void save();
          }}
        />
      }
    >
      <Heading>{t("trip.time.date")}</Heading>
      <Calendar
        value={date}
        first={today}
        last={addDays(today, defaultTripSettings.maxDaysAhead)}
        onChange={(day) => {
          setDate(day);
          setChosen(planFrom(day, clocks[0] ?? null, clocks));
        }}
      />
      <FieldError message={tried && date === null ? t("trip.time.chooseDate") : undefined} />
      <TimeField
        label={t("trip.time.departure", { name: names[0] ?? "" })}
        value={clocks[0] ?? null}
        onChange={(clock) => {
          setChosen(planFrom(date, clock, clocks));
        }}
        {...wheel(0)}
        help={help}
        error={errorAt(0)}
      />
      {quoted.result?.ok === false ? (
        <Loading failure={quoted.result} onRetry={quoted.retry} />
      ) : null}
      {trip.stops.length > 1 && !unfolded ? (
        <Card>
          <View style={styles.foldedHeader}>
            <View style={styles.grow}>
              <Heading>{t("trip.time.stopsFolded", { count: trip.stops.length - 1 })}</Heading>
            </View>
            <Button
              variant="text"
              label={t("trip.change")}
              accessibilityLabel={t("trip.time.changeStops")}
              expanded={false}
              onPress={() => {
                setChanging(true);
              }}
            />
          </View>
          {departureKnown ? (
            <>
              {workedOut ? (
                <Text style={[typography.small, { color: palette.textMuted }]}>
                  {t("trip.time.workedOut")}
                </Text>
              ) : null}
              {names.slice(1).map((name, offset) => (
                <Text
                  key={trip.stops[offset + 1]?.meetingPoint.id ?? name}
                  style={[typography.body, { color: palette.text }]}
                >
                  {foldedLine(offset + 1)}
                </Text>
              ))}
            </>
          ) : (
            <Text style={[typography.small, { color: palette.textMuted }]}>
              {t("trip.time.workedOutLater")}
            </Text>
          )}
        </Card>
      ) : null}
      {trip.stops.length > 1 && unfolded ? (
        <>
          {/* Opened with Change, it takes the focus Change had. */}
          <TakesFocus when={changing}>
            <Heading>{t("trip.time.stopsTitle")}</Heading>
          </TakesFocus>
          <Body align="start">{t("trip.time.stopsIntro")}</Body>
          {names.slice(1).map((name, offset) => {
            const index = offset + 1;
            return (
              <TimeField
                key={trip.stops[index]?.meetingPoint.id ?? index}
                label={t("trip.time.atStop", { name })}
                value={clocks[index] ?? null}
                onChange={(clock) => {
                  setOwnTimes(true);
                  setChosen(clocks.map((known, position) => (position === index ? clock : known)));
                }}
                {...wheel(index)}
                help={helpAt(index)}
                error={errorAt(index)}
              />
            );
          })}
        </>
      ) : null}
      <Notice message={failure} />
    </StepScreen>
  );
}

/** Both times known and the same. */
function sameClock(a: Clock | null | undefined, b: Clock | null | undefined): boolean {
  return (
    a !== null &&
    a !== undefined &&
    b !== null &&
    b !== undefined &&
    a.hour === b.hour &&
    a.minute === b.minute
  );
}

const styles = StyleSheet.create({
  foldedHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1 },
});
