import type { Booking } from "@shareride/contracts";
import { formatClock } from "@shareride/i18n";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { readAppData, writeAppData } from "@/lib/app-data";
import { spacing } from "@/theme/tokens";
import { canCancel } from "./status";

const keptKey = (bookingId: string) => `kept-booking-${bookingId}`;

/**
 * The choice a move of more than 30 minutes gives a passenger who paid:
 * keep the booking, or cancel it with a full refund, without it counting
 * (R6.3; spec 6, screen 7). "Keep my booking" hides it on this device
 * until the trip moves again: it keeps when the last move was made.
 * An unpaid booking costs nothing to cancel, so it is not offered one.
 */
export function useMoveChoice(booking: Booking, now: Date) {
  const [kept, setKept] = useState<{ readonly id: string; readonly at: string | null } | null>(
    null,
  );
  const [keptHere, setKeptHere] = useState(false);
  useEffect(() => {
    let current = true;
    void readAppData(keptKey(booking.id)).then((at) => {
      if (current) setKept({ id: booking.id, at });
    });
    return () => {
      current = false;
    };
  }, [booking.id]);
  const due = booking.status === "confirmed" && booking.movedFar && canCancel(booking, now);
  const lastMove = booking.changes.at(-1)?.changedAt ?? null;
  // Until what this device kept is read, the choice may still come.
  const known = kept?.id === booking.id ? kept : null;
  const offered = due && known !== null && known.at !== lastMove;
  return {
    /** Whether to offer keeping or cancelling. */
    offered,
    /** Whether the choice may still come, while what was kept is read. */
    pending: due && known === null,
    /** The passenger kept the booking on this screen. */
    keptHere,
    keep: () => {
      setKept({ id: booking.id, at: lastMove });
      setKeptHere(true);
      if (lastMove !== null) void writeAppData(keptKey(booking.id), lastMove);
    },
  };
}

/**
 * "Changes since you booked": each move of the departure, at the
 * passenger's own stop; then, when `offered`, the help and the choice to
 * keep the booking or cancel it with "The trip changed" chosen. Once kept
 * here, focus moves to the heading.
 */
export function TripChanges({
  booking,
  offered,
  keptHere,
  onKeep,
  onCancel,
}: {
  readonly booking: Booking;
  readonly offered: boolean;
  readonly keptHere: boolean;
  readonly onKeep: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useLanguage();
  if (booking.changes.length === 0) return null;
  const free = booking.total.amount === 0;
  return (
    <Card>
      <TakesFocus key={keptHere ? "kept" : "shown"} when={keptHere}>
        <Heading>{t("booking.changesTitle")}</Heading>
      </TakesFocus>
      {booking.changes.map((change, index) => (
        <Body key={`${String(index)}-${change.changedAt}`} align="start">
          {t("trip.changed", {
            old: formatClock(new Date(change.from)),
            new: formatClock(new Date(change.to)),
          })}
        </Body>
      ))}
      {offered ? (
        <>
          <Body align="start">{t(free ? "booking.movedFarFree" : "booking.movedFar")}</Body>
          <View style={styles.actions}>
            <Button variant="secondary" label={t("trip.keepBooking")} onPress={onKeep} />
            <Button
              variant="secondary"
              label={free ? t("booking.cancel") : t("trip.cancelWithRefund")}
              onPress={() => {
                onCancel();
                router.push({
                  pathname: "/bookings/[id]/cancel",
                  params: { id: booking.id, reason: "trip_changed" },
                });
              }}
            />
          </View>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
});
