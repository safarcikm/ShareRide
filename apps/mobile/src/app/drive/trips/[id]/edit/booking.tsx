import { bookingModes, type BookingMode } from "@shareride/domain";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { RadioCard } from "@/components/radio-card";
import { Body } from "@/components/text";
import { ChangePartScreen, WithTripToChange, type TripToChange } from "@/driver-trip/change-screen";
import { useLanguage } from "@/i18n/language";
import { spacing } from "@/theme/tokens";
import { bookingModeKeys } from "@/trips/texts";

/**
 * How people book a published trip (spec 6, 3.2): requests already waiting
 * for the driver's answer stay open either way.
 */
export default function EditBookingScreen() {
  const { t } = useLanguage();
  return (
    <WithTripToChange title={t("trip.editBookingAction")}>
      {(trip) => <EditBooking trip={trip} />}
    </WithTripToChange>
  );
}

function EditBooking({ trip }: { readonly trip: TripToChange }) {
  const { t } = useLanguage();
  const [bookingMode, setBookingMode] = useState<BookingMode>(trip.bookingMode);
  return (
    <ChangePartScreen
      trip={trip}
      title={t("trip.editBookingAction")}
      change={bookingMode === trip.bookingMode ? null : { kind: "bookingMode", bookingMode }}
    >
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t("trip.bookingMode.title")}
        style={styles.group}
      >
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
      {trip.openRequests > 0 ? (
        <Body align="start">{t("trip.editBookingRequests", { count: trip.openRequests })}</Body>
      ) : null}
    </ChangePartScreen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
