import {
  deleteTripRoute,
  driverReadinessRoute,
  listVehiclesRoute,
  publishTripRoute,
  updateTripRoute,
  type DriverReadiness,
  type MyTrip,
  type Vehicle,
} from "@shareride/contracts";
import { capitalised, formatClock, formatDay, formatMoney } from "@shareride/i18n";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Heading } from "@/components/text";
import { TickRow } from "@/components/tick-list";
import { carSummary } from "@/driving/texts";
import { useLanguage } from "@/i18n/language";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { StepScreen } from "@/trips/step-screen";
import { SummarySection } from "@/trips/summary-section";
import { fromReviewParams, type StepName } from "@/trips/steps";
import {
  bookingModeKeys,
  levelText,
  preferenceTexts,
  problemText,
  stopNameAt,
} from "@/trips/texts";
import { Loading, useDraftOnFocus } from "@/trips/use-draft";
import { useQuote } from "@/trips/use-quote";

/**
 * Step 5, check and publish (spec 3, 3.8; spec 16, 3.6): what is still
 * needed to drive, first, a summary of every step with a way to change it,
 * and Publish, which waits for the car and licence and runs every check
 * again on the server. Loads again when the driver comes back
 * from changing something.
 */
export default function ReviewStepScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useLanguage();
  const session = useSession();
  const { value: trip, reload } = useDraftOnFocus(id);
  const loadDriver = useCallback(
    () =>
      Promise.all([session.call(driverReadinessRoute, {}), session.call(listVehiclesRoute, {})]),
    [session],
  );
  const { value: driver, reload: reloadDriver } = useLoadedOnFocus(loadDriver);
  const [readiness, cars] = driver ?? [];
  if (
    trip === undefined ||
    !trip.ok ||
    readiness === undefined ||
    !readiness.ok ||
    cars === undefined ||
    !cars.ok
  ) {
    const failure = [trip, readiness, cars].find((result) => result?.ok === false);
    return (
      <StepScreen step="review" title={t("trip.review.title")}>
        <Loading
          failure={failure?.ok === false ? failure : undefined}
          onRetry={() => {
            reload();
            reloadDriver();
          }}
        />
      </StepScreen>
    );
  }
  // Changed on another step, the review starts again: old problems go.
  return (
    <Review
      key={trip.data.updatedAt}
      trip={trip.data}
      readiness={readiness.data}
      cars={cars.data.vehicles}
    />
  );
}

function Review({
  trip,
  readiness,
  cars,
}: {
  readonly trip: MyTrip;
  readonly readiness: DriverReadiness;
  readonly cars: readonly Vehicle[];
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [problems, setProblems] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const names = trip.stops.map((stop) => stop.meetingPoint.name[locale]);
  const quoted = useQuote({
    stops: trip.stops.map((stop) => stop.meetingPoint.id),
    seats: trip.seats,
    priceLevel: trip.priceLevel,
  });
  const quote = quoted.result?.ok === true ? quoted.result.data : null;
  // A draft started before the first car was added gets that car on publishing.
  const car = trip.vehicleId === null ? cars[0] : cars.find((known) => known.id === trip.vehicleId);

  const missing = stillMissing(readiness);

  const publish = async () => {
    if (missing.length > 0) return;
    setFailure(null);
    setProblems([]);
    setBusy(true);
    if (trip.vehicleId === null && car !== undefined) {
      const saved = await session.call(updateTripRoute, {
        params: { id: trip.id },
        body: { vehicleId: car.id },
      });
      if (!saved.ok) {
        setBusy(false);
        setFailure(errorText(t, saved));
        return;
      }
    }
    const result = await session.call(publishTripRoute, { params: { id: trip.id }, body: {} });
    setBusy(false);
    if (result.ok) {
      leaveSteps({ pathname: "/drive/trips/[id]/published", params: { id: trip.id } });
    } else if (result.error.code === "trip_not_publishable") {
      const details = result.error.details ?? [];
      setProblems([
        ...new Set(
          details.map((detail) => problemText(t, detail.issue, stopNameAt(names, detail.path))),
        ),
      ]);
    } else if (result.error.code === "distances_pending") {
      setFailure(t("trip.distancesPending"));
    } else {
      setFailure(errorText(t, result));
    }
  };

  const remove = async () => {
    setBusy(true);
    const result = await session.call(deleteTripRoute, { params: { id: trip.id } });
    setBusy(false);
    if (result.ok) leaveSteps("/drive/trips");
    else setFailure(errorText(t, result));
  };

  const departure = trip.departsAt === null ? null : new Date(trip.departsAt);
  // A stop on a later day than the departure says which day.
  const times = trip.stops.map((stop, index) => {
    const name = names[index] ?? "";
    if (stop.plannedAt === null) return name;
    const moment = new Date(stop.plannedAt);
    const time = formatClock(moment);
    const day = formatDay(moment, locale);
    return departure !== null && day !== formatDay(departure, locale)
      ? t("trip.review.stopTimeOnDay", { time, name, day })
      : t("trip.review.stopTime", { time, name });
  });

  return (
    <StepScreen
      step="review"
      title={t("trip.review.title")}
      back={{ pathname: "/drive/trips/[id]/seats", params: { id: trip.id } }}
      footer={
        <>
          <Notice message={failure} />
          <Button
            main
            label={t("trip.publish")}
            busy={busy}
            disabled={missing.length > 0}
            onPress={() => {
              void publish();
            }}
          />
          {missing.length === 0 ? null : (
            <Text style={[typography.small, styles.centre, { color: palette.textMuted }]}>
              {t(waitsFor(missing))}
            </Text>
          )}
        </>
      }
    >
      {problems.length === 0 ? null : (
        <View
          testID="publish-problems"
          accessible
          accessibilityRole="alert"
          style={styles.problems}
        >
          <Notice message={t("trip.review.fix")} />
          {problems.map((problem) => (
            <Text key={problem} style={[typography.body, styles.problem, { color: palette.text }]}>
              {`• ${problem}`}
            </Text>
          ))}
        </View>
      )}
      <StillMissing missing={missing} />
      <Card>
        <Section id={trip.id} step="route" title={t("trip.review.route")} lines={names} />
        <Section
          id={trip.id}
          step="time"
          title={t("trip.review.times")}
          lines={
            departure === null
              ? [t("trip.review.noTimes")]
              : [capitalised(formatDay(departure, locale), locale), ...times]
          }
        />
        <Section
          id={trip.id}
          step="price"
          title={t("trip.review.price")}
          lines={[
            quote === null
              ? levelText(t, trip.priceLevel)
              : t("trip.review.priceLine", {
                  level: levelText(t, trip.priceLevel),
                  price: formatMoney(quote.wholeRoutePrice, locale),
                }),
          ]}
        />
        <Section
          id={trip.id}
          step="seats"
          title={t("trip.review.seats")}
          lines={[
            t("trip.seats.count", { count: trip.seats }),
            t(bookingModeKeys[trip.bookingMode].title),
          ]}
        />
        <Section
          id={trip.id}
          step="seats"
          title={t("trip.review.car")}
          lines={[car === undefined ? t("trip.review.noCar") : carSummary(t, locale, car)]}
        />
        <Section
          id={trip.id}
          step="seats"
          title={t("trip.prefs.title")}
          lines={preferenceTexts(t, trip.preferences)}
        />
        <Section
          id={trip.id}
          step="seats"
          title={t("trip.review.note")}
          lines={[trip.note === "" ? t("trip.review.noNote") : trip.note]}
        />
      </Card>
      {deleting ? (
        <View style={styles.confirm}>
          <Text style={[typography.body, styles.centre, { color: palette.text }]}>
            {t("trip.review.deleteConfirm")}
          </Text>
          <Button
            variant="secondary"
            label={t("trip.review.delete")}
            busy={busy}
            onPress={() => {
              void remove();
            }}
          />
          <Button
            variant="text"
            label={t("trip.review.keep")}
            onPress={() => {
              setDeleting(false);
            }}
          />
        </View>
      ) : (
        <Button
          variant="text"
          label={t("trip.review.delete")}
          onPress={() => {
            setDeleting(true);
          }}
        />
      )}
    </StepScreen>
  );
}

type Missing = "car" | "licence";

/**
 * What the driver still has to do before publishing (rules R3.1 and R3.2):
 * the car and the licence. The photo does not count until photos exist
 * (spec 16, 3.6, item 5).
 */
function stillMissing(readiness: DriverReadiness): Missing[] {
  return readiness.items.flatMap(({ item, done, blocking }) =>
    (item === "car" || item === "licence") && blocking && !done ? [item] : [],
  );
}

/** Why Publish waits, under it. */
function waitsFor(missing: readonly Missing[]) {
  if (missing.length > 1) return "trip.review.waitsForBoth";
  return missing[0] === "car" ? "trip.review.waitsForCar" : "trip.review.waitsForLicence";
}

/**
 * What is still missing, first on the review (spec 16, 3.6, item 4): "Two
 * things before you publish", each with a way to do it here.
 */
function StillMissing({ missing }: { readonly missing: readonly Missing[] }) {
  const { t } = useLanguage();
  if (missing.length === 0) return null;
  return (
    <Card>
      <Heading>{t("trip.review.missing", { count: missing.length })}</Heading>
      {missing.map((item) =>
        item === "car" ? (
          <TickRow
            key={item}
            label={t("trip.review.yourCar")}
            detail={t("trip.review.carDetail")}
            done={false}
            action={{
              label: t("vehicle.add"),
              onPress: () => {
                router.push("/drive/cars/new");
              },
            }}
          />
        ) : (
          <TickRow
            key={item}
            label={t("driver.ready.licence")}
            detail={t("trip.review.licenceDetail")}
            done={false}
            action={{
              label: t("licence.confirm"),
              accessibilityLabel: t("driver.ready.confirmLicence"),
              onPress: () => {
                router.push("/drive/licence");
              },
            }}
          />
        ),
      )}
    </Card>
  );
}

/**
 * Opens `next` on top of Offer, closing the posting steps, so
 * Back never leads into the steps of a trip that is published or deleted.
 */
function leaveSteps(next: Href) {
  router.dismissTo("/offer");
  router.push(next);
}

/** A part of the summary: its title, what was chosen, and Edit, which opens its step. */
function Section({
  id,
  step,
  title,
  lines,
}: {
  readonly id: string;
  readonly step: StepName;
  readonly title: string;
  readonly lines: readonly string[];
}) {
  const { t } = useLanguage();
  return (
    <SummarySection
      title={title}
      lines={lines}
      link={{
        label: t("trip.review.edit"),
        accessibilityLabel: t("trip.review.editLabel", { section: title }),
        href: fromReviewParams(id, step),
      }}
    />
  );
}

const styles = StyleSheet.create({
  problems: { gap: spacing.xs },
  problem: { paddingHorizontal: spacing.md },
  confirm: { gap: spacing.sm },
  centre: { textAlign: "center" },
});
