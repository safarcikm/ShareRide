import type { CallFailure } from "@shareride/api-client";
import { changeTripRoute, type MeetingPointSummary } from "@shareride/contracts";
import { formatMoney, stopAddedText, type Locale, type Translate } from "@shareride/i18n";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { Heading } from "@/components/text";
import { editHref, WithTripToChange, type TripToChange } from "@/driver-trip/change-screen";
import { refusalText, timeLines, TripHeading, tripHref } from "@/driver-trip/changes";
import { ForPassengers, Lines, Refused } from "@/driver-trip/stop-parts";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { PointPicker } from "@/trips/point-picker";

/**
 * Adding a stop to a published trip (spec 6, 3.2, items 15 to 17;
 * milestone 6 plan, decision 2): the driver chooses a meeting point, and
 * the server places it where it is least out of the way, at a time between
 * the stops either side, which keep theirs.
 * The check shows where and when, the new stretches' prices for new
 * bookings, and who is told; "Save the change" adds it, under the same
 * checks, and goes back to the trip, which says so with focus.
 */
export default function AddStopScreen() {
  const { t } = useLanguage();
  const [point, setPoint] = useState<MeetingPointSummary | null>(null);
  return (
    <WithTripToChange title={t("trip.editAddStopAction")}>
      {(trip) =>
        point === null ? (
          <PointPicker
            title={t("trip.editAddStopAction")}
            intro={t("trip.editAddStopHelp")}
            onChoose={setPoint}
            onCancel={() => {
              if (router.canGoBack()) router.back();
              else router.replace(editHref(trip.id));
            }}
          />
        ) : (
          <CheckStop
            trip={trip}
            point={point}
            onOther={() => {
              setPoint(null);
            }}
          />
        )
      }
    </WithTripToChange>
  );
}

function CheckStop({
  trip,
  point,
  onOther,
}: {
  readonly trip: TripToChange;
  readonly point: MeetingPointSummary;
  /** Back to choosing another meeting point. */
  readonly onOther: () => void;
}) {
  const { locale, t } = useLanguage();
  const title = t("trip.editReviewTitle");
  const onTrip = trip.stops.some((stop) => stop.meetingPoint.id === point.id);
  if (onTrip) {
    return (
      <Refused trip={trip} title={title} other={t("trip.editOtherPoint")} onOther={onOther}>
        {t("trip.route.alreadyOn", { name: point.name[locale] })}
      </Refused>
    );
  }
  return <Preview trip={trip} point={point} onOther={onOther} />;
}

function Preview({
  trip,
  point,
  onOther,
}: {
  readonly trip: TripToChange;
  readonly point: MeetingPointSummary;
  readonly onOther: () => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const title = t("trip.editReviewTitle");
  const change = { kind: "addStop", meetingPointId: point.id } as const;
  const load = useCallback(
    () =>
      session.call(changeTripRoute, {
        params: { id: trip.id },
        query: { preview: true },
        body: { kind: "addStop", meetingPointId: point.id },
      }),
    [session, trip.id, point.id],
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
        other={t("trip.editOtherPoint")}
        onOther={onOther}
        onRetry={effect.error.code === "distances_pending" ? reload : undefined}
      >
        {addStopRefusal(t, locale, trip, point, effect)}
      </Refused>
    );
  }

  const save = async () => {
    setNotice(null);
    setBusy(true);
    const answer = await session.call(changeTripRoute, {
      params: { id: trip.id },
      query: { preview: false },
      body: change,
    });
    setBusy(false);
    if (answer.ok) {
      // A new key each time, so each change takes focus on the trip.
      router.dismissTo(
        tripHref(trip.id, {
          changed: `addStop-${String(Date.now())}`,
          told: String(answer.data.told),
        }),
      );
      return;
    }
    setNotice(addStopRefusal(t, locale, trip, point, answer));
  };

  const { stops, plannedTimes, prices, told, requests } = effect.data;
  const position = stops.indexOf(point.id);
  const known = [...trip.stops.map((stop) => stop.meetingPoint), point];
  const named = (id: string | undefined) =>
    known.find((candidate) => candidate.id === id)?.name[locale] ?? "";
  const after = {
    stops: stops.map((id, index) => ({
      meetingPoint: known.find((candidate) => candidate.id === id) ?? point,
      plannedAt: plannedTimes[index] ?? null,
    })),
  };
  const stretches = [position - 1, position].map((segment) => ({
    from: named(stops[segment]),
    to: named(stops[segment + 1]),
    price: prices[segment],
  }));

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
        {stopAddedText(t, {
          stop: point.name[locale],
          plannedAt: plannedTimes[position] ?? "",
        })}
      </Text>
      <Card>
        <Heading>{t("trip.editNewTimes")}</Heading>
        <Lines
          lines={timeLines(
            t,
            locale,
            after,
            plannedTimes.map((time) => new Date(time)),
          )}
        />
      </Card>
      <Card>
        <Heading>{t("trip.editNewStretches")}</Heading>
        <Lines
          lines={stretches.map(({ from, to, price }) =>
            [
              t("trip.stretch", { from, to }),
              price === undefined
                ? null
                : t("trip.pricePerSeat", { price: formatMoney(price, locale) }),
            ]
              .filter((part) => part !== null)
              .join(" · "),
          )}
        />
      </Card>
      <ForPassengers told={told} requests={requests} stop="added" />
      {notice === null ? null : (
        <TakesFocus key={notice}>
          <Notice message={notice} />
        </TakesFocus>
      )}
    </Screen>
  );
}

/**
 * Why the server refused the stop, naming it: on the trip already, paused,
 * out of season, too far for the route (R3.2, R3.4), or too far out of the
 * way for the time between its neighbours (R3.6); or that its distances
 * are still being worked out.
 */
function addStopRefusal(
  t: Translate,
  locale: Locale,
  trip: TripToChange,
  point: MeetingPointSummary,
  failure: CallFailure,
): string {
  if (failure.error.code === "distances_pending") return t("trip.distancesPending");
  if (failure.error.code !== "change_not_allowed") return refusalText(t, locale, trip, failure);
  const name = point.name[locale];
  const names = trip.stops.map((stop) => stop.meetingPoint.name[locale]);
  const texts = (failure.error.details ?? []).map(({ path, issue }) => {
    switch (issue) {
      case "stop_on_trip":
        return t("trip.route.alreadyOn", { name });
      case "stop_unavailable":
        return t("trip.route.pointPaused");
      case "stop_out_of_season":
        return t("trip.problem.stop_out_of_season", { name });
      case "route_too_long":
        return t("trip.problem.stop_too_far", { name });
      case "stop_does_not_fit": {
        const segment = Number(path.split(".")[1]);
        return t("trip.problem.stop_does_not_fit", {
          name,
          from: names[segment] ?? "",
          to: names[segment + 1] ?? "",
        });
      }
      default:
        return refusalText(t, locale, trip, failure);
    }
  });
  return [...new Set(texts)].join(" ") || refusalText(t, locale, trip, failure);
}
