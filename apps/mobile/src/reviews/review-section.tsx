import type { Booking, Review } from "@shareride/contracts";
import { formatClock, formatDayAndMonth } from "@shareride/i18n";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { otherPerson } from "@/chat/texts";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { firstNameOf } from "@/people/texts";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { heldBack } from "./held-back";
import { Stars } from "./stars";

/**
 * A completed booking's reviews, for whoever sees it (spec 8, 3.7): "Rate
 * the driver" or "Rate your passenger" while the 14 days last and nothing
 * is sent, with until when, or why not yet (`heldBack`); then the review
 * sent, which says it waits for the other's until it shows (R8.9); then the
 * other's review of the viewer, once it shows. Nothing before the booking
 * completes. `framed` puts each review on a card, as on the booking page;
 * under a passenger on the driver's trip, which is a card already, they sit
 * in it. Without `offer`, the page itself has the button and until when,
 * as a booked seat has them in its bar and under its title (spec 31, 3.8).
 */
export function ReviewSection({
  booking,
  framed,
  offer = true,
}: {
  readonly booking: Booking;
  readonly framed: boolean;
  readonly offer?: boolean;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const { review } = booking;
  if (review === null) return null;
  const closesAt = new Date(review.closesAt);
  const open = review.mine === null && now() < closesAt;
  const held = open ? heldBack(t, booking) : null;
  const label =
    booking.viewer === "driver"
      ? t("review.ratePassengerNamed", { name: firstNameOf(t, otherPerson(booking)) })
      : t("review.rateDriver");
  return (
    <>
      {offer && open && held === null ? (
        <View style={styles.offer}>
          <Button
            variant="secondary"
            label={label}
            onPress={() => {
              router.push({ pathname: "/bookings/[id]/rate", params: { id: booking.id } });
            }}
          />
          <Text style={[typography.small, { color: palette.textMuted }]}>
            {t("review.closesOn", {
              date: formatDayAndMonth(closesAt, locale),
              time: formatClock(closesAt),
            })}
          </Text>
        </View>
      ) : null}
      {held === null ? null : (
        <Text style={[typography.small, { color: palette.textMuted }]}>{held}</Text>
      )}
      {review.mine === null ? null : (
        <ShownReview
          heading={t("review.yours")}
          review={review.mine}
          note={review.mine.revealed ? null : t("review.hiddenUntil")}
          framed={framed}
        />
      )}
      {review.theirs === null ? null : (
        <ShownReview
          heading={t("review.ofYou")}
          review={review.theirs}
          note={null}
          framed={framed}
        />
      )}
    </>
  );
}

function ShownReview({
  heading,
  review,
  note,
  framed,
}: {
  readonly heading: string;
  readonly review: Review;
  /** What the viewer should know about it, such as that it does not show yet. */
  readonly note: string | null;
  readonly framed: boolean;
}) {
  const palette = usePalette();
  const body = (
    <View style={styles.review}>
      <Text style={[typography.bodyStrong, { color: palette.text }]}>{heading}</Text>
      <Stars rating={review.rating} />
      {review.comment === "" ? null : (
        <Text style={[typography.body, { color: palette.text }]}>{review.comment}</Text>
      )}
      {note === null ? null : (
        <Text style={[typography.small, { color: palette.textMuted }]}>{note}</Text>
      )}
    </View>
  );
  return framed ? <Card>{body}</Card> : body;
}

const styles = StyleSheet.create({
  offer: { gap: spacing.xs },
  review: { gap: spacing.xs },
});
