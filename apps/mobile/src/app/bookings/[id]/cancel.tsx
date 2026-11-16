import type { CallFailure } from "@shareride/api-client";
import {
  bookingRoute,
  cancelBookingRoute,
  cancellationPreviewRoute,
  type Booking,
  type CancellationPreview,
} from "@shareride/contracts";
import type { CancelReason } from "@shareride/domain";
import { cancelReasonText, capitalised, formatDay } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { refundText } from "@/booking/texts";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Cancelling a booking (spec 6, 3.5; screen 6): the reasons, the refund
 * (rule M2) and, for the reason chosen, whether it shows on the
 * passenger's profile (R6.8), all from the server's preview. "Cancel
 * booking" sends the terms shown; if they changed meanwhile, such as the
 * last 15 minutes before boarding starting, the new ones show to confirm
 * again. Done, it goes back to the booking, where focus moves to the
 * outcome. `reason` chooses one to begin with, such as "The trip changed".
 */
export default function CancelBookingScreen() {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const { id, reason: given } = useLocalSearchParams<{ id: string; reason?: string }>();
  const load = useCallback(
    () =>
      Promise.all([
        session.call(bookingRoute, { params: { id } }),
        session.call(cancellationPreviewRoute, { params: { id } }),
      ]),
    [session, id],
  );
  const { value: answers, reload } = useLoaded(load);
  const [reason, setReason] = useState<string | null>(given ?? null);
  // Why the terms were loaded again: it stays, with focus, above the new ones.
  const [changed, setChanged] = useState<string | null>(null);
  const back = <BackButton fallback={{ pathname: "/bookings/[id]", params: { id } }} />;

  if (answers === undefined) {
    return (
      <Screen>
        {back}
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  const [booking, preview] = answers;
  if (!booking.ok) return <CancelFailed failure={booking} id={id} onRetry={reload} />;
  if (!preview.ok) return <CancelFailed failure={preview} id={id} onRetry={reload} />;
  return (
    <CancelForm
      booking={booking.data}
      preview={preview.data}
      reason={reason}
      changed={changed}
      onChoose={(chosen) => {
        setChanged(null);
        setReason(chosen);
      }}
      onTermsChanged={() => {
        setChanged(t("booking.termsChanged"));
        reload();
      }}
    />
  );
}

/** The booking or its terms could not be loaded, or it can no longer be cancelled. */
function CancelFailed({
  failure,
  id,
  onRetry,
}: {
  readonly failure: CallFailure;
  readonly id: string;
  readonly onRetry: () => void;
}) {
  const { t } = useLanguage();
  const notCancellable = failure.error.code === "booking_not_cancellable";
  return (
    <Screen>
      <BackButton fallback={{ pathname: "/bookings/[id]", params: { id } }} />
      <Title>{t("booking.cancelTitle")}</Title>
      <Notice
        message={
          notCancellable
            ? t("booking.notCancellable")
            : failure.status === 404 || failure.status === 400
              ? t("booking.notFound")
              : failure.error.code === "network_error"
                ? errorText(t, failure)
                : t("booking.failed")
        }
      />
      {notCancellable ? (
        <Button
          variant="secondary"
          label={t("booking.backToBooking")}
          onPress={() => {
            router.dismissTo({ pathname: "/bookings/[id]", params: { id } });
          }}
        />
      ) : (
        <Button variant="secondary" label={t("common.retry")} onPress={onRetry} />
      )}
    </Screen>
  );
}

function CancelForm({
  booking,
  preview,
  reason,
  changed,
  onChoose,
  onTermsChanged,
}: {
  readonly booking: Booking;
  readonly preview: CancellationPreview;
  /** The reason chosen, if any; one not offered counts as none. */
  readonly reason: string | null;
  /** Why the terms were loaded again, if they were. */
  readonly changed: string | null;
  readonly onChoose: (reason: CancelReason) => void;
  /** The terms changed since they showed: load them again. */
  readonly onTermsChanged: () => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const chosen = preview.reasons.find((option) => option.reason === reason) ?? null;
  // The refund is the same whatever the reason (rule M2), so it shows before one is chosen.
  const first = preview.reasons[0];
  const terms = chosen ?? first;
  const { board, alight } = booking;
  const name = (stop: Booking["board"]) => stop.meetingPoint.name[locale];

  const cancel = async () => {
    if (chosen === null) {
      setNotice(t("booking.cancelChooseReason"));
      return;
    }
    setNotice(null);
    setBusy(true);
    const answer = await session.call(cancelBookingRoute, {
      params: { id: booking.id },
      body: {
        reason: chosen.reason,
        terms: { refund: chosen.refund, countsOnReliability: chosen.countsOnReliability },
      },
    });
    setBusy(false);
    if (answer.ok) {
      router.dismissTo({
        pathname: "/bookings/[id]",
        params: { id: booking.id, cancelled: "1" },
      });
      return;
    }
    if (answer.error.code === "terms_changed") {
      onTermsChanged();
      return;
    }
    setNotice(
      answer.error.code === "booking_not_cancellable"
        ? t("booking.notCancellable")
        : errorText(t, answer),
    );
  };

  return (
    <Screen
      footer={
        <View style={styles.actions}>
          <Button
            main
            busy={busy}
            label={t("booking.cancel")}
            onPress={() => {
              void cancel();
            }}
          />
          <Button
            variant="text"
            disabled={busy}
            label={t("booking.keep")}
            onPress={() => {
              router.dismissTo({ pathname: "/bookings/[id]", params: { id: booking.id } });
            }}
          />
        </View>
      }
    >
      <BackButton fallback={{ pathname: "/bookings/[id]", params: { id: booking.id } }} />
      <View>
        <Text style={[typography.small, { color: palette.textMuted }]}>
          {capitalised(formatDay(new Date(board.plannedAt), locale), locale)} ·{" "}
          {t("search.route", { from: name(board), to: name(alight) })}
        </Text>
        <Title align="start">{t("booking.cancelTitle")}</Title>
      </View>

      {changed === null ? null : (
        <TakesFocus key={changed}>
          <Notice kind="info" urgent message={changed} />
        </TakesFocus>
      )}

      <View style={styles.reasons}>
        <Text style={[typography.label, { color: palette.text }]}>{t("booking.cancelWhy")}</Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t("booking.cancelWhy")}
          style={styles.chips}
        >
          {preview.reasons.map((option) => (
            <Chip
              key={option.reason}
              role="radio"
              label={cancelReasonText(t, option.reason)}
              selected={option.reason === chosen?.reason}
              onToggle={() => {
                setNotice(null);
                onChoose(option.reason);
              }}
            />
          ))}
        </View>
      </View>

      {terms === undefined ? null : (
        <Card>
          <Text style={[typography.bodyStrong, { color: palette.text }]}>
            {refundText(t, locale, booking, terms)}
          </Text>
          {chosen?.countsOnReliability === true ? (
            <Body align="start">{t("booking.countsOnReliability")}</Body>
          ) : null}
          <Body align="start">
            {t("booking.cancelTold", { driver: booking.driver.firstName, seats: booking.seats })}
          </Body>
        </Card>
      )}

      {notice === null ? null : (
        <TakesFocus key={notice}>
          <Notice message={notice} />
        </TakesFocus>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  reasons: { gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actions: { gap: spacing.xs },
});
