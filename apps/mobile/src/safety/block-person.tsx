import type { CallResult } from "@shareride/api-client";
import {
  bookingRoute,
  declineRequestRoute,
  withdrawRequestRoute,
  type blockFromBookingRoute,
  type Booking,
} from "@shareride/contracts";
import { holdsSeats } from "@shareride/domain";
import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { BookingTicket } from "@/booking/booking-ticket";
import { canCancel, statusKey } from "@/booking/status";
import { Button } from "@/components/button";
import { ActionNotice, Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { TakesFocus } from "@/components/takes-focus";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { spacing } from "@/theme/tokens";
import { bookingWords } from "@/trip-day/report-screen";

/** What blocking answers, from a booking or from a profile: the same. */
type Blocked = CallResult<typeof blockFromBookingRoute>;

/**
 * Blocking a person (spec 9, 3.2; screen 3): it asks first, with the title
 * at the left and "Block Anna" as the red main button in the bar (spec 31,
 * 3.19), then blocks silently. Then the title says who is blocked, with
 * focus, and under it are the bookings and requests the two still have
 * together, each as a ticket with the usual way out: cancel, withdraw or
 * decline (spec 9 decision 1). Blocking alone changes no refund. `back` is
 * where Back leads when there is nothing to go back to; `done` leads back
 * to where blocking started, and is then the main button.
 */
export function BlockPerson({
  name,
  back,
  block,
  gone,
  done,
}: {
  readonly name: string;
  readonly back: Href;
  readonly block: () => Promise<Blocked>;
  /** What a "not found" means here: trying again would not help. */
  readonly gone: string;
  readonly done: { readonly label: string; readonly go: () => void };
}) {
  const { t } = useLanguage();
  const [state, setState] = useState<"asking" | "blocking" | "failed" | "gone">("asking");
  const [together, setTogether] = useState<readonly Booking[] | null>(null);

  async function confirm() {
    setState("blocking");
    const result = await block();
    if (result.ok) setTogether(result.data.together);
    else setState(result.status === 404 ? "gone" : "failed");
  }

  if (together !== null) {
    return (
      // The way back is the one thing left to do: the main button.
      <Screen footer={<Button main label={done.label} onPress={done.go} />}>
        {/* The button pressed is gone: focus moves to what it did. */}
        <ScreenHead
          title={t("block.done", { name })}
          line={together.length === 0 ? undefined : t("block.together", { count: together.length })}
          back={null}
          outcome={{ of: "blocked", focus: true }}
        />
        {together.map((shared) => (
          <Together key={shared.id} booking={shared} />
        ))}
      </Screen>
    );
  }

  const head = (
    <>
      <ScreenHead title={t("block.title", { name })} back={back} />
      <Body align="start">{t("block.confirm")}</Body>
    </>
  );
  if (state === "gone") {
    // Pressing again would not help: no button, and why takes its place.
    return (
      <Screen>
        {head}
        <ActionNotice says={gone} />
      </Screen>
    );
  }
  return (
    <Screen
      footer={
        <>
          <ActionNotice says={state === "failed" ? t("block.failed") : null} />
          <Button
            main
            variant="danger"
            label={t("block.action", { name })}
            busy={state === "blocking"}
            onPress={() => void confirm()}
          />
        </>
      }
    >
      {head}
    </Screen>
  );
}

/**
 * A booking or request the two still have together, as its ticket (R31.2)
 * with its way out under it: a request is withdrawn or declined here; a
 * booking is cancelled on its own screen, with its reasons and refund, and
 * is loaded again on coming back.
 */
function Together({ booking }: { readonly booking: Booking }) {
  const { locale, t } = useLanguage();
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
  const { day, part: route } = bookingWords(t, locale, current);
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
        fill
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
        fill
        label={t("booking.cancel")}
        accessibilityLabel={t("block.cancelLabel", { day, route })}
        onPress={() => {
          router.push({ pathname: "/bookings/[id]/cancel", params: { id: current.id } });
        }}
      />
    );
  }

  return (
    <View style={styles.shared}>
      <BookingTicket booking={current} />
      {holdsSeats(current.status) ? (
        action
      ) : (
        // The button pressed is gone: focus moves to what happened.
        <TakesFocus>
          <Body align="start">{t(statusKey(current))}</Body>
        </TakesFocus>
      )}
      <Notice message={failed} />
    </View>
  );
}

const styles = StyleSheet.create({
  shared: { gap: spacing.sm },
});
