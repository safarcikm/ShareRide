import { changeTripRoute, myTripRoute, type MyTrip } from "@shareride/contracts";
import { checkDeparture, defaultTripSettings } from "@shareride/domain";
import { formatDuration } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useTimings } from "@/beta/config";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Calendar } from "@/components/calendar";
import { Card } from "@/components/card";
import { ActionNotice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Heading } from "@/components/text";
import { TimeField } from "@/components/time-field";
import {
  isChangeable,
  NotChangeable,
  NotLoaded,
  refusalText,
  timeLines,
  TripHead,
} from "@/driver-trip/changes";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { addDays, dayOf, showsOtherTime, type Day } from "@/lib/days";
import { useLoaded } from "@/lib/use-loaded";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { at, clockOf, type Clock } from "@/trips/clock-input";

/**
 * A new departure for a published trip (spec 6, 3.2): every stop moves
 * with it (R6.2). "Check the change" asks the server, without saving,
 * whether the move keeps the rules (R3.5 to R3.7, and within 2 hours of
 * when each passenger booked, R6.4), and says which it breaks here;
 * otherwise it opens the check, with what it means for passengers.
 */
export default function EditTimeScreen() {
  const { t } = useLanguage();
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => session.call(myTripRoute, { params: { id } }), [session, id]);
  const { value: trip, reload } = useLoaded(load);

  if (trip === undefined || !trip.ok) {
    return <NotLoaded id={id} title={t("trip.editTimeTitle")} failure={trip} onRetry={reload} />;
  }
  if (!isChangeable(trip.data, now())) {
    return <NotChangeable trip={trip.data} title={t("trip.editTimeTitle")} />;
  }
  return <EditTime trip={trip.data} departsAt={new Date(trip.data.departsAt)} />;
}

function EditTime({ trip, departsAt }: { readonly trip: MyTrip; readonly departsAt: Date }) {
  const { locale, t } = useLanguage();
  const { maxMoveMinutes } = useTimings();
  const palette = usePalette();
  const session = useSession();
  const today = dayOf(now());
  const [date, setDate] = useState<Day>(() => dayOf(departsAt));
  const [clock, setClock] = useState<Clock>(() => clockOf(departsAt, true));
  const [open, setOpen] = useState(false);
  // What is wrong with the time, under it; and anything else, below.
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const moment = at(date, clock);
  const byMs = moment.getTime() - departsAt.getTime();
  const times = trip.stops.map(
    (stop) => new Date(new Date(stop.plannedAt ?? departsAt).getTime() + byMs),
  );
  // Requests hold seats too, and keep the move within 2 hours (R6.4).
  const booked = trip.segments.some((segment) => segment.seatsTaken > 0);
  const name = trip.stops[0]?.meetingPoint.name[locale] ?? "";

  const check = async () => {
    setNotice(null);
    if (moment.getTime() === departsAt.getTime()) {
      setProblem(t("trip.editTimeSame"));
      return;
    }
    const [early] = checkDeparture(moment, now(), defaultTripSettings);
    if (early !== undefined) {
      setProblem(t(`trip.problem.${early.code}`));
      return;
    }
    setProblem(undefined);
    setBusy(true);
    const departure = moment.toISOString();
    const answer = await session.call(changeTripRoute, {
      params: { id: trip.id },
      query: { preview: true },
      body: { kind: "departure", departsAt: departure },
    });
    setBusy(false);
    if (answer.ok) {
      router.push({
        pathname: "/drive/trips/[id]/edit/check",
        params: { id: trip.id, departsAt: departure },
      });
    } else if (answer.error.code === "change_not_allowed") {
      setProblem(refusalText(t, locale, trip, answer));
    } else {
      setNotice(refusalText(t, locale, trip, answer));
    }
  };

  const changed = () => {
    setProblem(undefined);
    setNotice(null);
  };
  return (
    <Screen
      footer={
        <>
          <ActionNotice says={notice} />
          <Button
            main
            busy={busy}
            label={t("trip.editCheck")}
            onPress={() => {
              void check();
            }}
          />
        </>
      }
    >
      <TripHead
        trip={trip}
        title={t("trip.editTimeTitle")}
        back={{ pathname: "/drive/trips/[id]/edit", params: { id: trip.id } }}
      />
      {booked ? (
        <Body align="start">
          {t("trip.editTimeBooked", { time: formatDuration(maxMoveMinutes * 60, locale) })}
        </Body>
      ) : null}
      <Heading>{t("trip.time.date")}</Heading>
      <Calendar
        value={date}
        first={today}
        last={addDays(today, defaultTripSettings.maxDaysAhead)}
        onChange={(day) => {
          changed();
          setDate(day);
        }}
      />
      <TimeField
        label={t("trip.time.departure", { name })}
        value={clock}
        suggested={clock}
        open={open}
        onOpen={() => {
          setOpen(true);
        }}
        onClose={() => {
          setOpen(false);
        }}
        onChange={(chosen) => {
          changed();
          setClock(chosen);
        }}
        help={showsOtherTime(now()) ? t("trip.icelandTime") : undefined}
        error={problem}
      />
      {trip.stops.length > 1 ? (
        <Card>
          <Text style={[typography.small, { color: palette.textMuted }]}>
            {t("trip.editTimeIntro")}
          </Text>
          {/* The departure and its day are chosen above. */}
          {timeLines(t, locale, trip, times)
            .slice(2)
            .map((line) => (
              <Text key={line} style={[typography.body, styles.line, { color: palette.text }]}>
                {line}
              </Text>
            ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { marginTop: spacing.xs },
});
