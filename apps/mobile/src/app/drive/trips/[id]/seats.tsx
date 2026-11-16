import {
  listVehiclesRoute,
  updateTripRoute,
  type MyTrip,
  type Vehicle,
} from "@shareride/contracts";
import {
  bookingModes,
  checkNote,
  defaultTripSettings,
  type BookingMode,
  type TripPreferences,
} from "@shareride/domain";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { RadioCard } from "@/components/radio-card";
import { Stepper } from "@/components/stepper";
import { Body, Heading } from "@/components/text";
import { carSummary } from "@/driving/texts";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { spacing } from "@/theme/tokens";
import { NoteField, PreferenceChoices } from "@/trips/preference-fields";
import { StepScreen } from "@/trips/step-screen";
import { goOn } from "@/trips/steps";
import { bookingModeKeys } from "@/trips/texts";
import { Loading, useDraftOnFocus } from "@/trips/use-draft";
import { useQuote } from "@/trips/use-quote";

/** Step 4, seats, booking mode, car, preferences and note (spec 3, 3.7). */
export default function SeatsStepScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const { t } = useLanguage();
  const session = useSession();
  const { value: result, reload } = useDraftOnFocus(id);
  const loadCars = useCallback(() => session.call(listVehiclesRoute, {}), [session]);
  const { value: cars, reload: reloadCars } = useLoaded(loadCars);
  if (result === undefined || !result.ok || cars === undefined || !cars.ok) {
    const failure = result?.ok === false ? result : cars?.ok === false ? cars : undefined;
    return (
      <StepScreen step="seats" title={t("trip.seats.title")}>
        <Loading
          failure={failure}
          onRetry={() => {
            reload();
            reloadCars();
          }}
        />
      </StepScreen>
    );
  }
  // A step left in the stack starts again from the draft when another step
  // changed it, so going back never saves an old copy over newer choices.
  return (
    <SeatsStep
      key={result.data.updatedAt}
      trip={result.data}
      cars={cars.data.vehicles}
      fromReview={from === "review"}
    />
  );
}

function SeatsStep({
  trip,
  cars,
  fromReview,
}: {
  readonly trip: MyTrip;
  readonly cars: readonly Vehicle[];
  readonly fromReview: boolean;
}) {
  const { locale, t } = useLanguage();
  const session = useSession();
  const [seats, setSeats] = useState(trip.seats);
  const [bookingMode, setBookingMode] = useState<BookingMode>(trip.bookingMode);
  // A draft started before the first car was added takes that car.
  const [vehicleId, setVehicleId] = useState(trip.vehicleId ?? cars[0]?.id ?? null);
  const [preferences, setPreferences] = useState<TripPreferences>(trip.preferences);
  const [note, setNote] = useState(trip.note);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // More seats lower the highest price level; the quote says to what.
  const quoted = useQuote({
    stops: trip.stops.map((stop) => stop.meetingPoint.id),
    seats,
    priceLevel: trip.priceLevel,
  });
  const quote = quoted.result?.ok === true ? quoted.result.data : null;
  const lowered = quote?.warnings.some((warning) => warning.code === "price_level_lowered");
  const noteProblem = checkNote(note)[0];

  const save = async () => {
    if (noteProblem !== undefined || quote === null || quoted.stale) return;
    setFailure(null);
    setBusy(true);
    const saved = await session.call(updateTripRoute, {
      params: { id: trip.id },
      body: {
        seats,
        // Only a level the quote lowered for more seats; the price step owns it.
        ...(quote.priceLevel === trip.priceLevel ? {} : { priceLevel: quote.priceLevel }),
        bookingMode,
        vehicleId,
        preferences,
        note: note.trim(),
      },
    });
    setBusy(false);
    if (!saved.ok) {
      setFailure(errorText(t, saved));
      return;
    }
    goOn(trip.id, "review", fromReview);
  };

  return (
    <StepScreen
      step="seats"
      title={t("trip.seats.title")}
      footer={
        <Button
          main
          label={fromReview ? t("trip.saveChanges") : t("trip.seats.next")}
          busy={busy || quoted.stale}
          onPress={() => {
            void save();
          }}
        />
      }
    >
      <Stepper
        label={t("trip.seatsOffered")}
        value={seats}
        min={1}
        max={defaultTripSettings.maxSeats}
        onChange={setSeats}
        valueText={t("trip.seats.count", { count: seats })}
        fewerLabel={t("trip.seats.fewer")}
        moreLabel={t("trip.seats.more")}
      />
      <Body align="start">{t("trip.seats.help")}</Body>
      {lowered === true && quote !== null ? (
        <Notice
          kind="info"
          message={t("trip.price.lowered", { seats, level: quote.highestPriceLevel })}
        />
      ) : null}

      <Heading>{t("trip.bookingMode.title")}</Heading>
      <View accessibilityRole="radiogroup" style={styles.group}>
        {bookingModes.map((mode) => (
          <RadioCard
            key={mode}
            title={t(bookingModeKeys[mode].title)}
            help={t(bookingModeKeys[mode].help)}
            selected={bookingMode === mode}
            onSelect={() => {
              setBookingMode(mode);
            }}
          />
        ))}
      </View>

      {cars.length > 1 ? (
        <>
          <Heading>{t("trip.car.title")}</Heading>
          <View accessibilityRole="radiogroup" style={styles.group}>
            {cars.map((car) => (
              <RadioCard
                key={car.id}
                title={carSummary(t, locale, car)}
                help={car.registration ?? t("vehicle.noPlate")}
                selected={vehicleId === car.id}
                onSelect={() => {
                  setVehicleId(car.id);
                }}
              />
            ))}
          </View>
        </>
      ) : null}

      <Heading>{t("trip.prefs.title")}</Heading>
      <PreferenceChoices preferences={preferences} onChange={setPreferences} />
      <NoteField note={note} onChange={setNote} />
      <Notice message={failure} />
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
