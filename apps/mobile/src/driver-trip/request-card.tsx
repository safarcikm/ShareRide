import type { CallFailure } from "@shareride/api-client";
import {
  acceptRequestRoute,
  declineRequestRoute,
  type Booking,
  type MyTrip,
  type TripBookings,
} from "@shareride/contracts";
import { declineReasons, type DeclineReason } from "@shareride/domain";
import { formatDuration, formatMoney, type Locale, type Translate } from "@shareride/i18n";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Notice } from "@/components/notice";
import { Tag } from "@/components/tag";
import { TakesFocus } from "@/components/takes-focus";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { memberSinceText, monthOf } from "@/people/texts";
import { PartStop } from "@/trip-details/trip-parts";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { SeatsIfAccepted } from "./parts";

const reasonKeys = {
  plans_changed: "request.reason.plans_changed",
  luggage: "request.reason.luggage",
  other: "request.reason.other",
} as const;

/**
 * "3 h 20 min left to answer", rounded down to the minute and never below
 * one; once the deadline has passed, that the time ran out. The page loads
 * again each time it comes into view, and the request then goes.
 */
function timeLeftText(t: Translate, locale: Locale, deadline: Date, at: Date) {
  const left = deadline.getTime() - at.getTime();
  if (left <= 0) return t("request.timeUp");
  const minutes = Math.max(1, Math.floor(left / 60_000));
  return t("request.timeLeft", { time: formatDuration(minutes * 60, locale) });
}

/**
 * A request on the driver's trip (spec 5, 3.3): who is asking, where they
 * get in and out, seats, price, their message and the time left, with the
 * seats on each stretch without and with them. "Accept" answers at once;
 * "Decline" first offers a reason, which only the operator sees (R5.7).
 */
export function RequestCard({
  booking,
  trip,
  segments,
  capacity,
  onAnswered,
  onGone,
}: {
  readonly booking: Booking;
  readonly trip: MyTrip;
  readonly segments: TripBookings["segments"];
  readonly capacity: number;
  /** The booking as the driver's answer left it. */
  readonly onAnswered: (booking: Booking) => void;
  /** The request was already answered, withdrawn or ran out on the server. */
  readonly onGone: () => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [declining, setDeclining] = useState(false);
  // Backing out of declining puts focus back on "Decline".
  const [keptAfterAsking, setKeptAfterAsking] = useState(false);
  const [reason, setReason] = useState<DeclineReason | null>(null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Two quick presses send one answer: the second comes before the screen shows busy.
  const sending = useRef(false);
  const name = booking.passenger.firstName;

  const failed = (failure: CallFailure) => {
    if (failure.error.code === "booking_not_requested" || failure.error.code === "not_found") {
      onGone();
      return;
    }
    // A lost connection or a server problem leaves the request as it was, to try again.
    setNotice(errorText(t, failure));
  };

  const answer = async (
    which: "accept" | "decline",
    call: () => Promise<{ ok: true; data: Booking } | CallFailure>,
  ) => {
    if (sending.current) return;
    sending.current = true;
    setNotice(null);
    setBusy(which);
    const result = await call();
    sending.current = false;
    setBusy(null);
    if (result.ok) {
      onAnswered(result.data);
      return;
    }
    failed(result);
  };

  const accept = () =>
    answer("accept", () =>
      session.call(acceptRequestRoute, { params: { id: booking.id }, body: {} }),
    );
  const decline = () =>
    answer("decline", () =>
      session.call(declineRequestRoute, { params: { id: booking.id }, body: { reason } }),
    );

  return (
    <Card>
      <View style={styles.person}>
        <Avatar firstName={name} colour={booking.passenger.colour} />
        <View style={styles.grow}>
          <Text style={[typography.bodyStrong, { color: palette.text }]}>{name}</Text>
          <Text style={[typography.small, { color: palette.textMuted }]}>
            {memberSinceText(t, locale, monthOf(booking.passenger.memberSince))}
          </Text>
          <View style={styles.row}>
            <Tag kind="warning" label={t("request.noReviews")} />
          </View>
        </View>
      </View>
      {booking.requestExpiresAt === null ? null : (
        <Text style={[typography.label, { color: palette.text }]}>
          {timeLeftText(t, locale, new Date(booking.requestExpiresAt), now())}
        </Text>
      )}
      <PartStop stop={booking.board} getIn />
      <PartStop stop={booking.alight} getIn={false} />
      <View style={styles.spread}>
        <Text style={[typography.label, { color: palette.text }]}>
          {t("search.seatCount", { count: booking.seats })}
        </Text>
        <Text style={[typography.figure, { color: palette.text }]}>
          {booking.total.amount === 0 ? t("results.free") : formatMoney(booking.total, locale)}
        </Text>
      </View>
      {booking.message === "" ? null : (
        <View>
          <Text style={[typography.label, { color: palette.text }]}>{t("request.message")}</Text>
          <Body align="start">{booking.message}</Body>
        </View>
      )}
      <SeatsIfAccepted booking={booking} trip={trip} segments={segments} capacity={capacity} />
      {notice === null ? null : (
        <TakesFocus key={notice}>
          <Notice message={notice} />
        </TakesFocus>
      )}
      {declining ? (
        <TakesFocus>
          <View style={styles.declining}>
            <Text style={[typography.label, { color: palette.text }]}>{t("request.why")}</Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t("request.why")}
              style={styles.chips}
            >
              {declineReasons.map((option) => (
                <Chip
                  key={option}
                  role="radio"
                  label={t(reasonKeys[option])}
                  selected={reason === option}
                  onToggle={() => {
                    // A reason is optional: pressing the chosen one again clears it.
                    setReason(reason === option ? null : option);
                  }}
                />
              ))}
            </View>
            <Body align="start">{t("request.declineNote", { name })}</Body>
            <Button
              label={t("request.declineConfirm")}
              busy={busy === "decline"}
              onPress={() => {
                void decline();
              }}
            />
            <Button
              variant="secondary"
              label={t("request.declineKeep")}
              disabled={busy !== null}
              onPress={() => {
                setNotice(null);
                setReason(null);
                setDeclining(false);
                setKeptAfterAsking(true);
              }}
            />
          </View>
        </TakesFocus>
      ) : (
        <View style={styles.buttons}>
          <Button
            label={t("request.accept")}
            busy={busy === "accept"}
            onPress={() => {
              void accept();
            }}
          />
          <TakesFocus when={keptAfterAsking}>
            <Button
              variant="secondary"
              label={t("request.decline")}
              disabled={busy !== null}
              onPress={() => {
                setNotice(null);
                setDeclining(true);
              }}
            />
          </TakesFocus>
          {/* An unkind request can be reported, through the booking (spec 9, 3.1.1). */}
          <Button
            variant="text"
            label={t("report.person", { name })}
            disabled={busy !== null}
            onPress={() => {
              router.push({ pathname: "/report", params: { kind: "user", id: booking.id } });
            }}
          />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  grow: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  spread: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chips: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  declining: { gap: spacing.ms },
  buttons: { gap: spacing.sm },
});
