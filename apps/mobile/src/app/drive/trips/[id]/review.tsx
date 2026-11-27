import {
  deleteTripRoute,
  driverReadinessRoute,
  listVehiclesRoute,
  publicProfileRoute,
  publishTripRoute,
  updateTripRoute,
  type DriverReadiness,
  type MyTrip,
  type PublicProfile,
  type Vehicle,
} from "@shareride/contracts";
import { formatMoney, inOneLine } from "@shareride/i18n";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { Camera, CarFront, IdCard, Trash2 } from "lucide-react-native";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { ActionRows } from "@/components/action-rows";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { NeedsYouCard } from "@/components/needs-you-card";
import { ActionNotice, Notice } from "@/components/notice";
import { Row } from "@/components/row";
import { TakesFocus } from "@/components/takes-focus";
import { Body } from "@/components/text";
import { carSummary } from "@/driving/texts";
import { useLanguage } from "@/i18n/language";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { preferenceNeeds } from "@/trip-details/trip-parts";
import { CheckRow } from "@/trips/check-row";
import { routeChecked, timeChecked } from "@/trips/check-texts";
import { hasPreview, PreviewTicket } from "@/trips/preview-ticket";
import { StepScreen } from "@/trips/step-screen";
import { fromReviewParams } from "@/trips/steps";
import { bookingModeKeys, levelText, problemText, stopNameAt } from "@/trips/texts";
import { Loading, useDraftOnFocus } from "@/trips/use-draft";
import { useQuote } from "@/trips/use-quote";

/**
 * Step 5, check and publish (spec 3, 3.8; spec 31, 3.11, items 3 to 5):
 * the ride as people will see it, as its ticket; every part in one card of
 * rows, each with what is set and Change, which opens its step; what is
 * still needed to drive, as one card with the button for the next one;
 * Delete draft, red and last, which asks first; and Publish in the bar,
 * which waits for the photo, the car and the licence and runs every check
 * again on the server. Loads again when the driver comes back from
 * changing something: the ride, what is still needed, and the driver as
 * others see them, for the ticket.
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
  // The ticket's rating; the step does not wait for it, or need it.
  const profileId = useMe()?.profileId;
  const loadProfile = useCallback(
    () =>
      profileId === undefined
        ? Promise.resolve(undefined)
        : session.call(publicProfileRoute, { params: { profileId } }),
    [session, profileId],
  );
  const { value: profile } = useLoadedOnFocus(loadProfile);
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
      profile={profile?.ok === true ? profile.data : null}
    />
  );
}

function Review({
  trip,
  readiness,
  cars,
  profile,
}: {
  readonly trip: MyTrip;
  readonly readiness: DriverReadiness;
  readonly cars: readonly Vehicle[];
  readonly profile: PublicProfile | null;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [problems, setProblems] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Delete draft asks first; kept, its row has focus again.
  const [deleting, setDeleting] = useState<"no" | "asking" | "kept">("no");
  const names = trip.stops.map((stop) => stop.meetingPoint.name[locale]);
  const quoted = useQuote({
    stops: trip.stops.map((stop) => stop.meetingPoint.id),
    seats: trip.seats,
    priceLevel: trip.priceLevel,
  });
  const quote = quoted.result?.ok === true ? quoted.result.data : null;
  // A draft started before the first car was added gets that car on publishing.
  const car = trip.vehicleId === null ? cars[0] : cars.find((known) => known.id === trip.vehicleId);

  const missing = needed(readiness, false);

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
    setFailure(null);
    setBusy(true);
    const result = await session.call(deleteTripRoute, { params: { id: trip.id } });
    setBusy(false);
    if (result.ok) leaveSteps();
    else setFailure(errorText(t, result));
  };

  const route = routeChecked(t, names);
  // The day and the two ends' times; the stops' times are on the time step.
  const times = hasPreview(trip)
    ? timeChecked(
        t,
        locale,
        trip.stops.flatMap((stop) => (stop.plannedAt === null ? [] : [new Date(stop.plannedAt)])),
      )
    : undefined;
  // As a passenger reads them on the ride, in one line: "Some chat, one suitcase, no pets".
  const likes = inOneLine(
    preferenceNeeds(t, trip.preferences).map(({ label }) => label),
    locale,
  );

  return (
    <StepScreen
      step="review"
      title={t("trip.review.title")}
      // The line is about the ticket, which a draft with no times has not.
      line={hasPreview(trip) ? t("trip.review.line") : undefined}
      // Opened by its address, Back leads to the step before.
      back={{ pathname: "/drive/trips/[id]/price", params: { id: trip.id } }}
      footer={
        <>
          <ActionNotice says={failure} />
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
      <PreviewTicket trip={trip} whole={quote?.wholeRoutePrice ?? null} profile={profile} />
      <ActionRows>
        <CheckRow
          caption={t("trip.review.route")}
          lines={route.lines}
          spoken={route.spoken}
          href={fromReviewParams(trip.id, "route")}
        />
        <CheckRow
          caption={t("trip.review.time")}
          lines={times?.lines ?? [t("trip.review.noTimes")]}
          spoken={times?.spoken}
          href={fromReviewParams(trip.id, "time")}
        />
        <CheckRow
          caption={t("trip.review.price")}
          lines={[
            quote === null
              ? levelText(t, trip.priceLevel)
              : quote.wholeRoutePrice.amount === 0
                ? t("results.free")
                : t("trip.review.priceWhole", {
                    price: formatMoney(quote.wholeRoutePrice, locale),
                  }),
          ]}
          href={fromReviewParams(trip.id, "price")}
        />
        <CheckRow
          caption={t("trip.review.seats")}
          lines={[
            t("trip.seats.count", { count: trip.seats }),
            t(bookingModeKeys[trip.bookingMode].title),
          ]}
          href={fromReviewParams(trip.id, "seats")}
        />
        <CheckRow
          caption={t("trip.review.car")}
          lines={[car === undefined ? t("trip.review.noCar") : carSummary(t, locale, car)]}
          href={fromReviewParams(trip.id, "seats")}
        />
        <CheckRow
          caption={t("trip.editDetails")}
          lines={[likes, trip.note === "" ? t("trip.review.noNote") : trip.note]}
          href={fromReviewParams(trip.id, "seats")}
        />
      </ActionRows>
      <StillMissing missing={missing} done={needed(readiness, true)} />
      {/* A key each: one in the other's place would not take focus again. */}
      {deleting === "asking" ? (
        <TakesFocus key="asking">
          <Card>
            <Body align="start">{t("trip.review.deleteConfirm")}</Body>
            <View style={styles.confirm}>
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
                  setDeleting("kept");
                }}
              />
            </View>
          </Card>
        </TakesFocus>
      ) : (
        // Cannot be undone: red, and the last thing on the screen (R31.3).
        <TakesFocus key="row" when={deleting === "kept"}>
          <ActionRows>
            <Row
              danger
              icon={Trash2}
              title={t("trip.review.delete")}
              onPress={() => {
                setDeleting("asking");
              }}
            />
          </ActionRows>
        </TakesFocus>
      )}
    </StepScreen>
  );
}

type Missing = "photo" | "car" | "licence";

/**
 * Of what publishing needs (rules R3.1 and R3.2), the photo, the car and
 * the licence, in that order: what the driver has `done`, or still has to
 * do. The API asks for the photo only while photo storage is on (spec 16,
 * 3.6, item 5).
 */
function needed(readiness: DriverReadiness, done: boolean): Missing[] {
  const order: readonly Missing[] = ["photo", "car", "licence"];
  return order.filter((wanted) =>
    readiness.items.some((asked) => asked.item === wanted && asked.blocking && asked.done === done),
  );
}

const waitingTexts = {
  photo: "trip.review.waitsForPhoto",
  car: "trip.review.waitsForCar",
  licence: "trip.review.waitsForLicence",
  "photo car": "trip.review.waitsForPhotoAndCar",
  "photo licence": "trip.review.waitsForPhotoAndLicence",
  "car licence": "trip.review.waitsForBoth",
  "photo car licence": "trip.review.waitsForAll",
} as const;

/** Why Publish waits, under it. */
function waitsFor(missing: readonly Missing[]) {
  return waitingTexts[missing.join(" ") as keyof typeof waitingTexts];
}

const doneTexts = {
  photo: "trip.review.done.photo",
  car: "trip.review.done.car",
  licence: "trip.review.done.licence",
  "photo car": "trip.review.done.photoAndCar",
  "photo licence": "trip.review.done.photoAndLicence",
  "car licence": "trip.review.done.carAndLicence",
} as const;

const leftTexts = {
  photo: "trip.review.left.photo",
  car: "trip.review.left.car",
  licence: "trip.review.left.licence",
  "photo car": "trip.review.left.photoAndCar",
  "photo licence": "trip.review.left.photoAndLicence",
  "car licence": "trip.review.left.carAndLicence",
  "photo car licence": "trip.review.left.all",
} as const;

/** Each thing publishing needs: its sign, the button that does it and the screen it opens. */
const todo = {
  photo: { icon: Camera, label: "profile.photo.add", href: "/drive/photo" },
  car: { icon: CarFront, label: "vehicle.add", href: "/drive/cars/new" },
  licence: { icon: IdCard, label: "driver.ready.confirmLicence", href: "/drive/licence" },
} as const;

/**
 * What is still missing, as one card under the rows (spec 31, 3.11, item
 * 4): "One thing before you publish", what is done and what is left
 * ("Photo and car are done. Your driving licence is left."), and an
 * outlined button for the next one, as Publish is the screen's main button
 * (R31.1). Doing it comes back here, where the card names the next.
 */
function StillMissing({
  missing,
  done,
}: {
  readonly missing: readonly Missing[];
  readonly done: readonly Missing[];
}) {
  const { t } = useLanguage();
  const [next] = missing;
  if (next === undefined) return null;
  const said = done.join(" ") as keyof typeof doneTexts | "";
  const left = t(leftTexts[missing.join(" ") as keyof typeof leftTexts]);
  return (
    <NeedsYouCard
      icon={todo[next].icon}
      title={t("trip.review.missing", { count: missing.length })}
      detail={said === "" ? left : `${t(doneTexts[said])} ${left}`}
      action={{
        label: t(todo[next].label),
        outlined: true,
        // A button, as it was: it does the next thing and comes back here.
        onPress: () => {
          router.push(todo[next].href);
        },
      }}
    />
  );
}

/**
 * Closes the posting steps down to Offer, and opens `next` on top of it,
 * so Back never leads into the steps of a trip that is published or
 * deleted. A deleted draft has nothing to open: Offer lists the drafts
 * that are left (spec 31, 3.10, item 4).
 */
function leaveSteps(next?: Href) {
  router.dismissTo("/offer");
  if (next !== undefined) router.push(next);
}

const styles = StyleSheet.create({
  problems: { gap: spacing.xs },
  problem: { paddingHorizontal: spacing.md },
  confirm: { gap: spacing.sm },
  centre: { textAlign: "center" },
});
