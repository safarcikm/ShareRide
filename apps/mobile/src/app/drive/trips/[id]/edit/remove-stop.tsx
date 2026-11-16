import type { CallFailure } from "@shareride/api-client";
import { changeTripRoute } from "@shareride/contracts";
import { formatClock, formatMoney, type Locale, type Translate } from "@shareride/i18n";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { RadioCard } from "@/components/radio-card";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Heading } from "@/components/text";
import { editHref, WithTripToChange, type TripToChange } from "@/driver-trip/change-screen";
import { refusalText, timeLines, TripHeading, tripHref } from "@/driver-trip/changes";
import { ForPassengers, Lines, Refused } from "@/driver-trip/stop-parts";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** A stop of the trip, by its meeting point, as the driver chooses one to remove. */
type Stop = TripToChange["stops"][number];

/**
 * Removing a stop from a published trip (spec 6, 3.2; R6.5): the driver
 * chooses one of the stops between the ends, and the check shows the times
 * as they will be, the price of the way past it for new bookings, and who
 * is told. A stop where a booking or request gets in or out cannot go
 * until it ends, which the server says. "Save the change" removes it, under
 * the same checks, and goes back to the trip, which says so with focus.
 */
export default function RemoveStopScreen() {
  const { t } = useLanguage();
  const [checking, setChecking] = useState<Stop | null>(null);
  return (
    <WithTripToChange title={t("trip.editRemoveStopAction")}>
      {(trip) =>
        checking === null ? (
          <ChooseStop trip={trip} onCheck={setChecking} />
        ) : (
          <Preview
            trip={trip}
            stop={checking}
            onOther={() => {
              setChecking(null);
            }}
          />
        )
      }
    </WithTripToChange>
  );
}

/** The stops between the ends, one to choose, and "Check the change". */
function ChooseStop({
  trip,
  onCheck,
}: {
  readonly trip: TripToChange;
  readonly onCheck: (stop: Stop) => void;
}) {
  const { locale, t } = useLanguage();
  const title = t("trip.editRemoveStopAction");
  const between = trip.stops.slice(1, -1);
  const [chosen, setChosen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const check = () => {
    const stop = between.find((each) => each.meetingPoint.id === chosen);
    if (stop === undefined) {
      setNotice(t("trip.editRemoveStopChoose"));
      return;
    }
    onCheck(stop);
  };
  return (
    <Screen
      footer={
        between.length === 0 ? undefined : (
          <Button main label={t("trip.editCheck")} onPress={check} />
        )
      }
    >
      <BackButton fallback={editHref(trip.id)} />
      <TripHeading trip={trip} title={title} />
      {between.length === 0 ? (
        <Body align="start">{t("trip.editNoStopToRemove")}</Body>
      ) : (
        <>
          <Body align="start">{t("trip.editRemoveStopHelp")}</Body>
          <View accessibilityRole="radiogroup" accessibilityLabel={title} style={styles.group}>
            {between.map((stop) => (
              <RadioCard
                key={stop.meetingPoint.id}
                title={stop.meetingPoint.name[locale]}
                {...(stop.plannedAt === null
                  ? {}
                  : { help: formatClock(new Date(stop.plannedAt)) })}
                selected={chosen === stop.meetingPoint.id}
                onSelect={() => {
                  setNotice(null);
                  setChosen(stop.meetingPoint.id);
                }}
              />
            ))}
          </View>
        </>
      )}
      {notice === null ? null : (
        <TakesFocus key={notice}>
          <Notice message={notice} />
        </TakesFocus>
      )}
    </Screen>
  );
}

function Preview({
  trip,
  stop,
  onOther,
}: {
  readonly trip: TripToChange;
  readonly stop: Stop;
  /** Back to choosing another stop. */
  readonly onOther: () => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const title = t("trip.editReviewTitle");
  const meetingPointId = stop.meetingPoint.id;
  const load = useCallback(
    () =>
      session.call(changeTripRoute, {
        params: { id: trip.id },
        query: { preview: true },
        body: { kind: "removeStop", meetingPointId },
      }),
    [session, trip.id, meetingPointId],
  );
  const { value: effect, reload } = useLoaded(load);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (effect === undefined) {
    return (
      <Screen>
        <BackButton fallback={editHref(trip.id)} />
        <TripHeading trip={trip} title={title} />
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  if (!effect.ok) {
    return (
      <Refused
        trip={trip}
        title={title}
        other={t("trip.editOtherStop")}
        onOther={onOther}
        onRetry={effect.error.code === "distances_pending" ? reload : undefined}
      >
        {removeStopRefusal(t, locale, trip, stop, effect)}
      </Refused>
    );
  }

  const save = async () => {
    setNotice(null);
    setBusy(true);
    const answer = await session.call(changeTripRoute, {
      params: { id: trip.id },
      query: { preview: false },
      body: { kind: "removeStop", meetingPointId },
    });
    setBusy(false);
    if (answer.ok) {
      // A new key each time, so each change takes focus on the trip.
      router.dismissTo(
        tripHref(trip.id, {
          changed: `removeStop-${String(Date.now())}`,
          told: String(answer.data.told),
        }),
      );
      return;
    }
    setNotice(removeStopRefusal(t, locale, trip, stop, answer));
  };

  const { stops, plannedTimes, prices, told, requests } = effect.data;
  const position = trip.stops.findIndex((each) => each.meetingPoint.id === meetingPointId);
  const after = {
    stops: stops.map((id, index) => ({
      meetingPoint:
        trip.stops.find((each) => each.meetingPoint.id === id)?.meetingPoint ?? stop.meetingPoint,
      plannedAt: plannedTimes[index] ?? null,
    })),
  };
  // The way past the stop, from the stop before it to the one after.
  const past = {
    from: trip.stops[position - 1]?.meetingPoint.name[locale] ?? "",
    to: trip.stops[position + 1]?.meetingPoint.name[locale] ?? "",
    price: prices[position - 1],
  };

  return (
    <Screen
      footer={
        <Button
          main
          busy={busy}
          label={t("trip.editSave")}
          onPress={() => {
            void save();
          }}
        />
      }
    >
      <BackButton fallback={editHref(trip.id)} />
      <TripHeading trip={trip} title={title} />
      <Text style={[typography.bodyStrong, { color: palette.text }]}>
        {t("trip.stopRemoved", { stop: stop.meetingPoint.name[locale] })}
      </Text>
      <Card>
        <Heading>{t("trip.editNewTimes")}</Heading>
        <Lines
          lines={timeLines(
            t,
            locale,
            { ...trip, ...after },
            plannedTimes.map((time) => new Date(time)),
          )}
        />
      </Card>
      <Card>
        <Heading>{t("trip.editNewStretches")}</Heading>
        <Lines
          lines={[
            [
              t("trip.stretch", { from: past.from, to: past.to }),
              past.price === undefined
                ? null
                : t("trip.pricePerSeat", { price: formatMoney(past.price, locale) }),
            ]
              .filter((part) => part !== null)
              .join(" · "),
          ]}
        />
      </Card>
      <ForPassengers told={told} requests={requests} stop="removed" />
      {notice === null ? null : (
        <TakesFocus key={notice}>
          <Notice message={notice} />
        </TakesFocus>
      )}
    </Screen>
  );
}

/**
 * Why the server refused to remove the stop, naming it: passengers get in
 * or out there (R6.5), it is an end of the trip, or the way past it needs
 * more time than its neighbours leave (R3.6); or that the distance past it
 * is still being worked out.
 */
function removeStopRefusal(
  t: Translate,
  locale: Locale,
  trip: TripToChange,
  stop: Stop,
  failure: CallFailure,
): string {
  if (failure.error.code === "distances_pending") return t("trip.distancesPending");
  if (failure.error.code !== "change_not_allowed") return refusalText(t, locale, trip, failure);
  const name = stop.meetingPoint.name[locale];
  const position = trip.stops.findIndex((each) => each.meetingPoint.id === stop.meetingPoint.id);
  const count = failure.error.bookingsAtStop;
  const texts = (failure.error.details ?? []).map(({ issue }) => {
    switch (issue) {
      case "stop_in_use":
        return count === undefined
          ? t("trip.problem.stop_in_use_some", { name })
          : t("trip.problem.stop_in_use", { name, count });
      case "stop_at_end":
        return t("trip.problem.stop_at_end");
      case "stretch_too_fast":
        return t("trip.problem.stop_removal_too_fast", {
          name,
          from: trip.stops[position - 1]?.meetingPoint.name[locale] ?? "",
          to: trip.stops[position + 1]?.meetingPoint.name[locale] ?? "",
        });
      default:
        return refusalText(t, locale, trip, failure);
    }
  });
  return [...new Set(texts)].join(" ") || refusalText(t, locale, trip, failure);
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
