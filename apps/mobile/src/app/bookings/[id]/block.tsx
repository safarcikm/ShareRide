import {
  blockFromBookingRoute,
  bookingRoute,
  declineRequestRoute,
  withdrawRequestRoute,
  type Booking,
} from "@shareride/contracts";
import { holdsSeats } from "@shareride/domain";
import { capitalised, formatDay } from "@shareride/i18n";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { canCancel, statusKey } from "@/booking/status";
import { otherPerson } from "@/chat/texts";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { useLoaded } from "@/lib/use-loaded";
import { firstNameOf } from "@/people/texts";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Blocking the other person of a booking, from its conversation (spec 9,
 * 3.2; screen 3): it asks first, then blocks silently. Then it lists the
 * bookings and requests the two still have together, each with the usual
 * way out: cancel, withdraw or decline (spec 9 decision 1). Blocking alone
 * changes no refund.
 */
export default function BlockScreen() {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => session.call(bookingRoute, { params: { id } }), [session, id]);
  const { value: answer, reload } = useLoaded(load);
  const back = (
    <BackButton fallback={{ pathname: "/messages/[bookingId]", params: { bookingId: id } }} />
  );

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
        <Notice message={answer.status === 404 ? t("booking.notFound") : errorText(t, answer)} />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </Screen>
    );
  }
  return <BlockPerson booking={answer.data} back={back} />;
}

function BlockPerson({ booking, back }: { readonly booking: Booking; readonly back: ReactNode }) {
  const { t } = useLanguage();
  const session = useSession();
  const name = firstNameOf(t, otherPerson(booking));
  const [state, setState] = useState<"asking" | "blocking" | "failed">("asking");
  const [together, setTogether] = useState<readonly Booking[] | null>(null);

  async function block() {
    setState("blocking");
    const result = await session.call(blockFromBookingRoute, {
      params: { id: booking.id },
      body: {},
    });
    if (result.ok) setTogether(result.data.together);
    else setState("failed");
  }

  if (together !== null) {
    return (
      <Screen>
        <TakesFocus>
          <Title>{t("block.done", { name })}</Title>
        </TakesFocus>
        {together.length === 0 ? null : (
          <>
            <Body>{t("block.together", { count: together.length })}</Body>
            {together.map((shared) => (
              <Together key={shared.id} booking={shared} />
            ))}
          </>
        )}
        <Button
          variant="secondary"
          label={t("block.backToChat")}
          onPress={() => {
            router.dismissTo({
              pathname: "/messages/[bookingId]",
              params: { bookingId: booking.id },
            });
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {back}
      <Title>{t("block.title", { name })}</Title>
      <Body>{t("block.confirm")}</Body>
      <Button
        label={t("block.action", { name })}
        busy={state === "blocking"}
        onPress={() => void block()}
      />
      <Notice message={state === "failed" ? t("block.failed") : null} />
    </Screen>
  );
}

/**
 * A booking or request the two still have together, with its way out: a
 * request is withdrawn or declined here; a booking is cancelled on its own
 * screen, with its reasons and refund, and is loaded again on coming back.
 */
function Together({ booking }: { readonly booking: Booking }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [current, setCurrent] = useState(booking);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const seenBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      // Back from cancelling it, or from anywhere else: as it is now.
      if (!seenBefore.current) {
        seenBefore.current = true;
        return;
      }
      void session.call(bookingRoute, { params: { id: booking.id } }).then((result) => {
        if (result.ok) setCurrent(result.data);
      });
    }, [session, booking.id]),
  );
  const day = capitalised(formatDay(new Date(current.board.plannedAt), locale), locale);
  const route = t("search.route", {
    from: current.board.meetingPoint.name[locale],
    to: current.alight.meetingPoint.name[locale],
  });
  const passenger = current.viewer === "passenger";

  async function answer() {
    setBusy(true);
    setFailed(null);
    const params = { id: current.id };
    const result = passenger
      ? await session.call(withdrawRequestRoute, { params, body: {} })
      : await session.call(declineRequestRoute, { params, body: { reason: null } });
    setBusy(false);
    if (result.ok) setCurrent(result.data);
    else setFailed(errorText(t, result));
  }

  let action: ReactNode = null;
  if (current.status === "requested") {
    action = (
      <Button
        variant="secondary"
        label={t(passenger ? "booking.withdraw" : "request.declineConfirm")}
        accessibilityLabel={t(passenger ? "block.withdrawLabel" : "block.declineLabel", {
          day,
          route,
        })}
        busy={busy}
        onPress={() => void answer()}
      />
    );
  } else if (canCancel(current, now())) {
    action = (
      <Button
        variant="secondary"
        label={t("booking.cancel")}
        accessibilityLabel={t("block.cancelLabel", { day, route })}
        onPress={() => {
          router.push({ pathname: "/bookings/[id]/cancel", params: { id: current.id } });
        }}
      />
    );
  }

  return (
    <Card>
      <View style={styles.what}>
        <Text style={[typography.bodyStrong, { color: palette.text }]}>{day}</Text>
        <Text style={[typography.small, { color: palette.textMuted }]}>{route}</Text>
      </View>
      {holdsSeats(current.status) ? (
        action
      ) : (
        // The button pressed is gone: focus moves to what happened.
        <TakesFocus>
          <Body align="start">{t(statusKey(current))}</Body>
        </TakesFocus>
      )}
      <Notice message={failed} />
    </Card>
  );
}

const styles = StyleSheet.create({
  what: { gap: spacing.xs },
});
