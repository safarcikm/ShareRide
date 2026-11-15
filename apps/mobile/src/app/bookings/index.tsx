import { myBookingsRoute, type Booking } from "@shareride/contracts";
import { capitalised, formatClock, formatDay, formatMoney } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { statusKey, statusTag } from "@/booking/status";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Tag } from "@/components/tag";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { carText } from "@/trip-details/texts";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

type When = "upcoming" | "past";

/**
 * My bookings (spec 5, 3.6, screen 7): upcoming (requested, waiting for
 * payment and confirmed), soonest first, or past, latest first. Each opens
 * the booking. Which list shows lives in the address, so Back returns to it.
 */
export default function MyBookingsScreen() {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const params = useLocalSearchParams<{ when?: string }>();
  const when: When = params.when === "past" ? "past" : "upcoming";
  const load = useCallback(
    () => session.call(myBookingsRoute, { query: { when } }).then((answer) => ({ when, answer })),
    [session, when],
  );
  const { value: loaded, reload } = useLoadedOnFocus(load);
  // The other list's answer stays out of sight while this one loads.
  const answer = loaded?.when === when ? loaded.answer : undefined;

  return (
    <Screen>
      <BackButton fallback="/profile" />
      <Title>{t("myBookings.title")}</Title>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t("myBookings.which")}
        style={styles.chips}
      >
        {(["upcoming", "past"] as const).map((option) => (
          <Chip
            key={option}
            role="radio"
            label={t(`myBookings.${option}`)}
            selected={when === option}
            onToggle={() => {
              router.setParams({ when: option });
            }}
          />
        ))}
      </View>
      {answer === undefined ? (
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      ) : !answer.ok ? (
        <>
          <Notice
            message={
              answer.error.code === "network_error" ? errorText(t, answer) : t("myBookings.failed")
            }
          />
          <Button variant="secondary" label={t("common.retry")} onPress={reload} />
        </>
      ) : answer.data.bookings.length === 0 ? (
        when === "upcoming" ? (
          <>
            <Body>{t("myBookings.noneUpcoming")}</Body>
            <Button
              label={t("search.title")}
              onPress={() => {
                router.push("/search");
              }}
            />
          </>
        ) : (
          <Body>{t("myBookings.nonePast")}</Body>
        )
      ) : (
        answer.data.bookings.map((booking) => <BookingCard key={booking.id} booking={booking} />)
      )}
    </Screen>
  );
}

/** The date, the part with times, status, driver, car, seats and price (3.6 item 2). */
function BookingCard({ booking }: { readonly booking: Booking }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const { board, alight } = booking;
  const day = capitalised(formatDay(new Date(board.plannedAt), locale), locale);
  const route = t("search.route", {
    from: board.meetingPoint.name[locale],
    to: alight.meetingPoint.name[locale],
  });
  const clock = {
    from: formatClock(new Date(board.plannedAt)),
    to: formatClock(new Date(alight.plannedAt)),
  };
  const times = t("search.route", clock);
  const status = t(statusKey(booking));
  const car = booking.car === null ? null : carText(t, booking.car);
  const seats = t("search.seatCount", { count: booking.seats });
  const price = booking.total.amount === 0 ? t("results.free") : formatMoney(booking.total, locale);
  // Screen readers say the times in words rather than reading the arrow.
  const label = [
    day,
    route,
    t("myBookings.times", clock),
    status,
    booking.driver.firstName,
    car,
    seats,
    price,
  ]
    .filter((part) => part !== null)
    .join(", ");
  return (
    <Card
      accessibilityLabel={label}
      onPress={() => {
        router.push({ pathname: "/bookings/[id]", params: { id: booking.id } });
      }}
    >
      <Text style={[typography.small, { color: palette.textMuted }]}>{day}</Text>
      <Text style={[typography.heading, { color: palette.text }]}>{route}</Text>
      <Text style={[typography.body, { color: palette.text }]}>{times}</Text>
      <View style={styles.row}>
        <Tag kind={statusTag(booking)} label={status} />
      </View>
      <Text style={[typography.small, { color: palette.textMuted }]}>
        {car === null
          ? booking.driver.firstName
          : t("myBookings.driverAndCar", { driver: booking.driver.firstName, car })}
      </Text>
      <View style={styles.spread}>
        <Text style={[typography.label, { color: palette.text }]}>{seats}</Text>
        <Text style={[typography.figure, { color: palette.text }]}>{price}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  spread: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
