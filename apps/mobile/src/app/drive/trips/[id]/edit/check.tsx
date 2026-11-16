import {
  changeTripRoute,
  myTripRoute,
  type MyTrip,
  type TripChangeEffect,
} from "@shareride/contracts";
import { formatClock } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Heading } from "@/components/text";
import {
  isChangeable,
  NotChangeable,
  NotLoaded,
  refusalText,
  timeLines,
  TripHeading,
  tripHref,
} from "@/driver-trip/changes";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { useLoaded } from "@/lib/use-loaded";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * "What changes for passengers" (spec 6, 3.2): the new times, who is told,
 * who may now cancel with a full refund (R6.3), and the requests waiting,
 * any of which the move makes expire (R5.5), as the server works it out
 * now, without saving. "Save the change" saves it, under the same
 * checks, and goes back to the trip, which says so with focus.
 */
export default function CheckChangeScreen() {
  const { locale, t } = useLanguage();
  const session = useSession();
  const { id, departsAt } = useLocalSearchParams<{ id: string; departsAt: string }>();
  const load = useCallback(
    () =>
      Promise.all([
        session.call(myTripRoute, { params: { id } }),
        session.call(changeTripRoute, {
          params: { id },
          query: { preview: true },
          body: { kind: "departure", departsAt },
        }),
      ]),
    [session, id, departsAt],
  );
  const { value: loaded, reload } = useLoaded(load);
  const title = t("trip.editReviewTitle");

  if (loaded === undefined) {
    return <NotLoaded id={id} title={title} failure={undefined} onRetry={reload} />;
  }
  const [trip, effect] = loaded;
  if (!trip.ok) return <NotLoaded id={id} title={title} failure={trip} onRetry={reload} />;
  if (!isChangeable(trip.data, now())) return <NotChangeable trip={trip.data} title={title} />;
  if (!effect.ok) {
    return (
      <Screen>
        <BackButton fallback={timeHref(id)} />
        <TripHeading trip={trip.data} title={title} />
        <Notice message={refusalText(t, locale, trip.data, effect)} />
        <Button
          variant="secondary"
          label={t("trip.editTimeAction")}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace(timeHref(id));
          }}
        />
      </Screen>
    );
  }
  return <CheckChange trip={trip.data} departsAt={departsAt} effect={effect.data} />;
}

const timeHref = (id: string) => ({
  pathname: "/drive/trips/[id]/edit/time" as const,
  params: { id },
});

function CheckChange({
  trip,
  departsAt,
  effect,
}: {
  readonly trip: MyTrip & { readonly departsAt: string };
  /** The new departure, as the time step chose it. */
  readonly departsAt: string;
  readonly effect: TripChangeEffect;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const save = async () => {
    setNotice(null);
    setBusy(true);
    const answer = await session.call(changeTripRoute, {
      params: { id: trip.id },
      query: { preview: false },
      body: { kind: "departure", departsAt },
    });
    setBusy(false);
    if (answer.ok) {
      // The new departure says what changed, so each change takes focus.
      router.dismissTo(
        tripHref(trip.id, { changed: answer.data.departsAt, told: String(answer.data.told) }),
      );
      return;
    }
    setNotice(refusalText(t, locale, trip, answer));
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
      <BackButton fallback={timeHref(trip.id)} />
      <TripHeading trip={trip} title={t("trip.editReviewTitle")} />
      <Text style={[typography.bodyStrong, { color: palette.text }]}>
        {t("trip.changed", {
          old: formatClock(new Date(trip.departsAt)),
          new: formatClock(new Date(effect.departsAt)),
        })}
      </Text>
      <Card>
        <Heading>{t("trip.editNewTimes")}</Heading>
        <View style={styles.lines}>
          {timeLines(
            t,
            locale,
            trip,
            effect.plannedTimes.map((time) => new Date(time)),
          ).map((line) => (
            <Text key={line} style={[typography.body, { color: palette.text }]}>
              {line}
            </Text>
          ))}
        </View>
      </Card>
      <Card>
        <Heading>{t("trip.editForPassengers")}</Heading>
        {effect.told === 0 && effect.requests === 0 && effect.expiring === 0 ? (
          <Body align="start">{t("trip.editNobody")}</Body>
        ) : (
          <>
            {effect.told === 0 ? null : (
              <Body align="start">{t("trip.editTold", { count: effect.told })}</Body>
            )}
            {effect.freeCancellations === 0 ? null : (
              <Body align="start">
                {t("trip.editFreeCancel", { count: effect.freeCancellations })}
              </Body>
            )}
            {/* Requests are not told (spec 7, 3.3); one may expire (R5.5). */}
            {effect.requests === 0 ? null : (
              <Body align="start">{t("trip.editRequests", { count: effect.requests })}</Body>
            )}
            {effect.expiring === 0 ? null : (
              <Body align="start">{t("trip.editRequestsExpire", { count: effect.expiring })}</Body>
            )}
          </>
        )}
      </Card>
      {notice === null ? null : (
        <TakesFocus key={notice}>
          <Notice message={notice} />
        </TakesFocus>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lines: { gap: spacing.xs },
});
