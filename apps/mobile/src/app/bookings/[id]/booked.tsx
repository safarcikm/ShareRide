import { bookingRoute, type Booking } from "@shareride/contracts";
import { capitalised, formatClock, formatDay } from "@shareride/i18n";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { answerUntilText } from "@/booking/texts";
import { WhereToStand } from "@/booking/where-to-stand";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Heading, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { useLoaded } from "@/lib/use-loaded";
import { NotificationsPrompt } from "@/notifications/notifications-prompt";
import { YourSeat } from "@/trip-details/seat-view";
import { radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { firstNameOf } from "@/people/texts";

/**
 * The finish after booking (spec 16, 3.7, items 4 and 5): "You're booked!"
 * once paid or booked free, or "Request sent", with what happens next and,
 * once confirmed, where to stand. Someone we could not reach yet is asked
 * to turn on notifications or add an email (spec 7, 3.6.2). It takes the
 * place of Check and pay, so Back opens the trip; opened on its own, Back
 * opens the booking. Any other booking opens on its own page, which says
 * where it stands.
 */
export default function BookedScreen() {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => session.call(bookingRoute, { params: { id } }), [session, id]);
  const { value: answer, reload } = useLoaded(load);
  const back = <BackButton fallback={{ pathname: "/bookings/[id]", params: { id } }} />;

  if (answer === undefined) {
    return (
      <Screen>
        {back}
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  if (!answer.ok) {
    return (
      <Screen>
        {back}
        <Notice
          message={
            answer.status === 404 || answer.status === 400
              ? t("booking.notFound")
              : answer.error.code === "network_error"
                ? errorText(t, answer)
                : t("booking.failed")
          }
        />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </Screen>
    );
  }
  const booking = answer.data;
  if (
    booking.viewer !== "passenger" ||
    (booking.status !== "confirmed" && booking.status !== "requested")
  ) {
    return <Redirect href={{ pathname: "/bookings/[id]", params: { id: booking.id } }} />;
  }
  return (
    <Screen
      footer={
        <View style={styles.actions}>
          <Button
            main
            label={t("booking.seeInMyRides")}
            onPress={() => {
              router.dismissTo("/my-rides");
            }}
          />
          <Button
            variant="text"
            label={t("booking.findAnother")}
            onPress={() => {
              router.dismissTo("/");
            }}
          />
        </View>
      }
    >
      {back}
      <Finished booking={booking} />
    </Screen>
  );
}

function Finished({ booking }: { readonly booking: Booking }) {
  const { locale, t } = useLanguage();
  const { board, confirmed } = booking;
  const driver = firstNameOf(t, booking.driver);
  const time = formatClock(new Date(board.plannedAt));
  const requested = booking.status === "requested";
  const steps = requested
    ? [
        t("booking.next.answer"),
        booking.total.amount === 0
          ? t("booking.next.confirmedWhenYes", { driver })
          : t("booking.next.payWhenYes", { driver }),
        t("booking.next.noAnswer"),
      ]
    : [
        confirmed === null || confirmed.registration === null
          ? t("booking.next.plateLater")
          : t("booking.plate", { plate: confirmed.registration }),
        t("booking.next.beThere", { time }),
        t("booking.next.cancel"),
      ];
  return (
    <>
      <YourSeat />
      {/* The outcome of the press that opened this screen, so focus starts here. */}
      <TakesFocus>
        <Title>{requested ? t("booking.requestSentTitle") : t("booking.booked")}</Title>
      </TakesFocus>
      {requested ? (
        booking.requestExpiresAt === null ? null : (
          <Body>{answerUntilText(t, driver, new Date(booking.requestExpiresAt), now())}</Body>
        )
      ) : (
        <Body>
          {t("booking.pickUp", {
            day: capitalised(formatDay(new Date(board.plannedAt), locale), locale),
            driver,
            time,
            stop: board.meetingPoint.name[locale],
          })}
        </Body>
      )}
      <NotificationsPrompt occasion={`booked:${booking.id}`} />
      <Heading>{t("booking.next")}</Heading>
      <Steps steps={steps} />
      <WhereToStand booking={booking} />
    </>
  );
}

/** Numbered lines, in the order they will happen. */
function Steps({ steps }: { readonly steps: readonly string[] }) {
  const palette = usePalette();
  return (
    <View style={styles.steps}>
      {steps.map((step, index) => (
        <View key={step} style={styles.step}>
          {/* The order shows; read aloud, the lines are enough. */}
          <View
            aria-hidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.number, { backgroundColor: palette.primarySoft }]}
          >
            <Text style={[typography.label, { color: palette.primary }]}>{index + 1}</Text>
          </View>
          <Text style={[typography.body, styles.grow, { color: palette.text }]}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.xs },
  steps: { gap: spacing.ms },
  step: { flexDirection: "row", alignItems: "flex-start", gap: spacing.ms },
  number: {
    // At least the size of a box, and larger with larger text.
    minWidth: sizes.checkbox,
    minHeight: sizes.checkbox,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  grow: { flex: 1 },
});
