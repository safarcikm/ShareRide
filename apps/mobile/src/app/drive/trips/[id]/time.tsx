import { updateTripRoute, type MyTrip } from "@shareride/contracts";
import {
  checkTimes,
  defaultTripSettings,
  inIceland,
  plannedTimes,
  type TimeProblem,
  type TimeWarning,
} from "@shareride/domain";
import { formatClock, formatDay, formatDuration } from "@shareride/i18n";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Calendar } from "@/components/calendar";
import { FieldError } from "@/components/field-error";
import { Notice } from "@/components/notice";
import { Body, Heading } from "@/components/text";
import { TextField } from "@/components/text-field";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { addDays, compareDays, dayOf, type Day } from "@/lib/days";
import { at, onOrAfter, parseClock } from "@/trips/clock-input";
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

/** Whether this device shows another time than a clock in Iceland. */
function elsewhere(moment: Date): boolean {
  const iceland = inIceland(moment);
  return iceland.hour !== moment.getHours() || iceland.minute !== moment.getMinutes();
}

function TimeStep({ trip, fromReview }: { readonly trip: MyTrip; readonly fromReview: boolean }) {
  const { locale, t } = useLanguage();
  const session = useSession();
  const today = dayOf(now());
  const names = trip.stops.map((stop) => stop.meetingPoint.name[locale]);
  const departsAt = trip.departsAt === null ? null : new Date(trip.departsAt);
  const [date, setDate] = useState<Day | null>(departsAt === null ? null : dayOf(departsAt));
  const [written, setTexts] = useState<readonly string[]>(() =>
    trip.stops.map((stop) =>
      stop.plannedAt === null ? "" : formatClock(new Date(stop.plannedAt)),
    ),
  );
  // Once the driver types a stop's time, empty fields stay empty: clearing
  // one to type it again must not fill it back in.
  const [ownTimes, setOwnTimes] = useState(() =>
    trip.stops.slice(1).some((stop) => stop.plannedAt !== null),
  );
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
  const planFrom = (day: Day | null, departure: string, current: readonly string[]) => {
    const clock = parseClock(departure);
    if (day === null || clock === null || durations === null) {
      return [departure, ...current.slice(1)];
    }
    const times = plannedTimes(at(day, clock), durations, defaultTripSettings);
    return [departure, ...times.slice(1).map(formatClock)];
  };

  // Times not planned yet show as soon as the typical times arrive.
  const texts =
    !ownTimes && written.slice(1).every((text) => text === "")
      ? planFrom(date, written[0] ?? "", written)
      : written;

  const clocks = texts.map(parseClock);
  const moments: Date[] = [];
  if (date !== null) {
    for (const clock of clocks) {
      if (clock === null) break;
      const previous = moments.at(-1);
      moments.push(previous === undefined ? at(date, clock) : onOrAfter(previous, clock));
    }
  }
  const complete = moments.length === texts.length;
  const checked =
    complete && durations !== null
      ? checkTimes(moments, durations, now(), defaultTripSettings)
      : { problems: [] as TimeProblem[], warnings: [] as TimeWarning[] };

  /** The error under a stop's time, after the first try to continue. */
  const errorAt = (index: number): string | undefined => {
    if (!tried) return undefined;
    if (clocks[index] === null) return t("trip.time.invalid");
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
   * together, so a time typed earlier than the stop before, which moves to
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

  const help = elsewhere(now()) ? t("trip.time.helpIceland") : t("trip.time.help");
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
          setTexts(planFrom(day, texts[0] ?? "", texts));
        }}
      />
      <FieldError message={tried && date === null ? t("trip.time.chooseDate") : undefined} />
      <TextField
        label={t("trip.time.departure", { name: names[0] ?? "" })}
        value={texts[0] ?? ""}
        onChangeText={(text) => {
          setTexts(planFrom(date, text, texts));
        }}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
        help={help}
        error={errorAt(0)}
      />
      {quoted.result?.ok === false ? (
        <Loading failure={quoted.result} onRetry={quoted.retry} />
      ) : null}
      {trip.stops.length > 1 ? (
        <>
          <Heading>{t("trip.time.stopsTitle")}</Heading>
          <Body align="start">{t("trip.time.stopsIntro")}</Body>
          {names.slice(1).map((name, offset) => {
            const index = offset + 1;
            return (
              <TextField
                key={trip.stops[index]?.meetingPoint.id ?? index}
                label={t("trip.time.atStop", { name })}
                value={texts[index] ?? ""}
                onChangeText={(text) => {
                  setOwnTimes(true);
                  setTexts(texts.map((known, position) => (position === index ? text : known)));
                }}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
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
