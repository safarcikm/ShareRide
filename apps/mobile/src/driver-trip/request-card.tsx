import type { CallFailure } from "@shareride/api-client";
import {
  acceptRequestRoute,
  declineRequestRoute,
  type Booking,
  type MyTrip,
  type TripBookings,
} from "@shareride/contracts";
import { busiestStretch, declineReasons, type DeclineReason } from "@shareride/domain";
import {
  formatClock,
  formatDuration,
  formatMoney,
  type Locale,
  type Translate,
} from "@shareride/i18n";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Avatar, besideAvatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { NeedsYouCard } from "@/components/needs-you-card";
import { Notice } from "@/components/notice";
import { Timetable } from "@/components/ride-ticket";
import { Tag } from "@/components/tag";
import { TakesFocus } from "@/components/takes-focus";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { ProfileLink } from "@/people/profile-link";
import { RatingLine, ratingText, reliabilityText } from "@/people/standing";
import { memberSinceText, monthOf, firstNameOf } from "@/people/texts";
import { halfMinWidth, radii, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { occupancies } from "./parts";

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
 * "If you accept, 2 of 3 seats are taken from Mjódd to Selfoss": the seats
 * held on the fullest run of the request's part. A request holds its seats
 * already (rule S1), so accepting adds nothing to what the ride holds, and
 * declining frees them.
 */
function ifAcceptedText(
  t: Translate,
  locale: Locale,
  booking: Booking,
  trip: MyTrip,
  segments: TripBookings["segments"],
  capacity: number,
): string | null {
  const fullest = busiestStretch(
    occupancies(trip, segments),
    booking.board.position,
    booking.alight.position,
  );
  if (fullest === null) return null;
  return t("request.ifAcceptedBusiest", {
    taken: fullest.taken,
    seats: capacity,
    from: trip.stops[fullest.from]?.meetingPoint.name[locale] ?? "",
    to: trip.stops[fullest.to]?.meetingPoint.name[locale] ?? "",
  });
}

/**
 * A request on the driver's ride, as what needs the driver (spec 31, 3.12,
 * item 3; spec 5, 3.3): who asks, with their rating, opening their
 * profile, and the time left to answer; their part as a timetable, with
 * the seats and the price beside its line, and their message; then, in
 * one line, the seats taken on the fullest stretch of that part if the
 * driver says yes. "Decline" and "Accept" stand side by side. "Accept"
 * answers at once; "Decline" first offers a reason, which only the
 * operator sees (R5.7), and declining is red, as it takes the seat asked
 * for away (decision 17). Why nothing was answered stands over the
 * buttons. An unkind request can be reported, at the card's end.
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
  const name = firstNameOf(t, booking.passenger);

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

  const rated = booking.passenger.rating.count > 0;
  const { profileId } = booking.passenger;
  const since = memberSinceText(t, locale, monthOf(booking.passenger.memberSince));
  const figure =
    profileId === null ? null : reliabilityText(t, booking.passenger.reliabilityPercent);
  const person = (
    <>
      <Avatar firstName={name} colour={booking.passenger.colour} photo={booking.passenger.photo} />
      <View style={[besideAvatar.text, styles.standing]}>
        <Text style={[typography.heading, { color: palette.text }]}>{name}</Text>
        {/* Someone leaving PuffinRide has no profile, and nothing of how they stand. */}
        {profileId === null ? null : rated ? (
          <RatingLine rating={booking.passenger.rating} />
        ) : (
          <View style={styles.tag}>
            <Tag kind="warning" label={t("request.noReviews")} onTint />
          </View>
        )}
        {/* The figure, like the profile, is for members signed in (spec 1, 3.5). */}
        {figure === null ? null : (
          <Text style={[typography.small, { color: palette.textMuted }]}>{figure}</Text>
        )}
        {/* Someone nobody has reviewed yet: how long they have been here. */}
        {rated ? null : (
          <Text style={[typography.small, { color: palette.textMuted }]}>{since}</Text>
        )}
      </View>
    </>
  );
  const seats = t("search.seatCount", { count: booking.seats });
  const price = booking.total.amount === 0 ? t("results.free") : formatMoney(booking.total, locale);
  const ifAccepted = ifAcceptedText(t, locale, booking, trip, segments, capacity);

  return (
    <NeedsYouCard>
      <View testID="request" style={styles.request}>
        <View style={styles.asks}>
          <View style={styles.who}>
            {profileId === null ? (
              <View style={besideAvatar.row}>{person}</View>
            ) : (
              <ProfileLink
                profileId={profileId}
                chevron={false}
                label={[
                  t("people.openOf", { name }),
                  rated ? ratingText(t, locale, booking.passenger.rating) : t("request.noReviews"),
                  figure,
                  rated ? null : since,
                ]
                  .filter((part) => part !== null)
                  .join(", ")}
              >
                {person}
              </ProfileLink>
            )}
          </View>
          {booking.requestExpiresAt === null ? null : (
            <Text style={[typography.label, styles.left, { color: palette.warning }]}>
              {timeLeftText(t, locale, new Date(booking.requestExpiresAt), now())}
            </Text>
          )}
        </View>
        <View testID="request-part" style={[styles.part, { backgroundColor: palette.surface }]}>
          <Timetable
            from={{
              time: formatClock(new Date(booking.board.plannedAt)),
              place: booking.board.meetingPoint.name[locale],
            }}
            to={{
              time: formatClock(new Date(booking.alight.plannedAt)),
              place: booking.alight.meetingPoint.name[locale],
            }}
            between={`${seats}, ${price}`}
          />
          {booking.message === "" ? null : (
            <Text
              accessibilityLabel={`${t("request.message")}: ${booking.message}`}
              style={[typography.body, { color: palette.textMuted }]}
            >
              {t("request.quoted", { message: booking.message })}
            </Text>
          )}
        </View>
        {ifAccepted === null ? null : (
          <Text style={[typography.small, { color: palette.warning }]}>{ifAccepted}</Text>
        )}
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
                variant="danger"
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
          <>
            <View testID="request-answer" style={styles.answer}>
              <View style={styles.choice}>
                <TakesFocus when={keptAfterAsking}>
                  <Button
                    fill
                    variant="secondary"
                    label={t("request.decline")}
                    disabled={busy !== null}
                    onPress={() => {
                      setNotice(null);
                      setDeclining(true);
                    }}
                  />
                </TakesFocus>
              </View>
              <View style={styles.choice}>
                <Button
                  fill
                  label={t("request.accept")}
                  busy={busy === "accept"}
                  onPress={() => {
                    void accept();
                  }}
                />
              </View>
            </View>
            {/* An unkind request can be reported, through the booking (spec 9, 3.1.1). */}
            <View style={styles.report}>
              <Button
                variant="text"
                label={t("report.person", { name })}
                disabled={busy !== null}
                onPress={() => {
                  router.push({ pathname: "/report", params: { kind: "user", id: booking.id } });
                }}
              />
            </View>
          </>
        )}
      </View>
    </NeedsYouCard>
  );
}

const styles = StyleSheet.create({
  request: { gap: spacing.ms },
  // The time left stands at the right of who asks, and under them where
  // the two have no room on one line.
  asks: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: spacing.ms,
    rowGap: spacing.xs,
  },
  who: { flexGrow: 1, flexShrink: 1, flexBasis: halfMinWidth, minWidth: 0 },
  left: { marginLeft: "auto" },
  standing: { gap: spacing.xs, alignItems: "flex-start" },
  tag: { flexDirection: "row" },
  // Their part, on the white of a ticket inside the yellow card.
  part: {
    borderRadius: radii.control,
    paddingHorizontal: spacing.ms,
    paddingVertical: spacing.ms,
    gap: spacing.sm,
  },
  chips: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  declining: { gap: spacing.ms },
  // Two equal choices side by side.
  answer: { flexDirection: "row", gap: spacing.ms },
  choice: { flex: 1, minWidth: 0 },
  report: { alignItems: "center" },
});
