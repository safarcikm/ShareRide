import type { CallFailure } from "@shareride/api-client";
import { reviewBookingRoute, type Booking, type BookingReview } from "@shareride/contracts";
import {
  asksWhatWentWrong,
  reviewCommentProblem,
  reviewMaxLength,
  tidyReviewComment,
} from "@shareride/domain";
import type { Translate } from "@shareride/i18n";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { otherPerson } from "@/chat/texts";
import { Avatar } from "@/components/avatar";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { TextField } from "@/components/text-field";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { now } from "@/lib/clock";
import { firstNameOf } from "@/people/texts";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import {
  backTo,
  BookingLine,
  Changed,
  leave,
  NotLoaded,
  useReportBooking,
} from "@/trip-day/report-screen";
import { heldBack } from "./held-back";
import { StarPicker } from "./stars";

/**
 * Rate and review (spec 8, screen 6; R8.8): the passenger rates the driver,
 * the driver each passenger, with 1 to 5 stars and a comment of up to 500
 * characters without contact details, checked as typed. Sent, it says the
 * review shows once the other person has reviewed too or after 14 days, or
 * that both show now; it cannot be changed, so it is not offered again.
 * A rating of 1 or 2 asks "Did something go wrong?" and offers a report,
 * before and after it is sent (3.7.4).
 */
export function RateScreen() {
  const { t } = useLanguage();
  const { id, value: answer, reload } = useReportBooking();
  if (answer === undefined || !answer.ok) {
    return <NotLoaded id={id} title={t("review.title")} answer={answer} onRetry={reload} />;
  }
  const booking = answer.data;
  const { review } = booking;
  if (review === null) {
    return (
      <Stopped booking={booking}>
        <Changed booking={booking} />
      </Stopped>
    );
  }
  const said =
    review.mine !== null
      ? t("review.already")
      : now() >= new Date(review.closesAt)
        ? t("review.windowClosed")
        : heldBack(t, booking);
  if (said !== null) {
    return (
      <Stopped booking={booking}>
        <Notice kind="info" message={said} />
        <BackTo booking={booking} />
      </Stopped>
    );
  }
  return <RateForm booking={booking} />;
}

/** The screen when the booking cannot be reviewed: why, and the way back. */
function Stopped({
  booking,
  children,
}: {
  readonly booking: Booking;
  readonly children: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <Screen>
      <BackButton fallback={backTo(booking)} />
      <View>
        <BookingLine booking={booking} />
        <Title align="start">{t("review.title")}</Title>
      </View>
      {children}
    </Screen>
  );
}

function BackTo({ booking }: { readonly booking: Booking }) {
  const { t } = useLanguage();
  return (
    <Button
      variant="secondary"
      label={booking.viewer === "driver" ? t("booking.backToTrip") : t("booking.backToBooking")}
      onPress={() => {
        leave(backTo(booking));
      }}
    />
  );
}

/** The comment's problem as typed, in words, as the server checks it. */
function commentError(t: Translate, comment: string): string | undefined {
  const problem = reviewCommentProblem(comment);
  if (problem === null) return undefined;
  return problem.code === "comment_too_long"
    ? t("review.commentTooLong", { max: reviewMaxLength })
    : t("review.noContactDetails");
}

/** Why the server did not take the review, as a problem to fix here or a reason to stop. */
function refusal(
  t: Translate,
  failure: CallFailure,
): { readonly stop: string } | { readonly notice: string } {
  switch (failure.error.code) {
    case "review_window_closed":
      return { stop: t("review.windowClosed") };
    case "report_open":
      return { stop: t("review.reportOpen") };
    case "person_left":
      return { stop: t("review.personLeft") };
    case "already_reviewed":
      return { stop: t("review.already") };
    case "not_completed":
    case "not_found":
      return { stop: t("report.changed") };
    case "validation_failed": {
      const detail = failure.error.details?.[0];
      if (detail?.path === "rating") return { notice: t("review.chooseRating") };
      if (detail?.path === "comment" && detail.issue === "too_long") {
        return { notice: t("review.commentTooLong", { max: reviewMaxLength }) };
      }
      if (detail?.path === "comment" && detail.issue === "contact_details") {
        return { notice: t("review.noContactDetails") };
      }
      return { notice: errorText(t, failure) };
    }
    default:
      return { notice: errorText(t, failure) };
  }
}

function RateForm({ booking }: { readonly booking: Booking }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState<BookingReview | null>(null);
  const [stopped, setStopped] = useState<string | null>(null);
  const person = otherPerson(booking);
  const name = firstNameOf(t, person);
  const question = booking.viewer === "driver" ? t("review.ratePassenger") : t("review.rateDriver");
  const problem = commentError(t, comment);

  const send = async () => {
    if (busy) return;
    if (rating === null) {
      setNotice(t("review.chooseRating"));
      return;
    }
    if (problem !== undefined) {
      setNotice(problem);
      return;
    }
    setNotice(null);
    setBusy(true);
    const tidy = tidyReviewComment(comment);
    const answer = await session.call(reviewBookingRoute, {
      params: { id: booking.id },
      body: { rating, ...(tidy === "" ? {} : { comment: tidy }) },
    });
    setBusy(false);
    if (answer.ok) {
      setSent(answer.data);
      return;
    }
    const refused = refusal(t, answer);
    if ("stop" in refused) setStopped(refused.stop);
    else setNotice(refused.notice);
  };

  if (sent !== null || stopped !== null) {
    return (
      <Stopped booking={booking}>
        {sent === null ? (
          <TakesFocus>
            <Notice kind="info" message={stopped} />
          </TakesFocus>
        ) : (
          <>
            <TakesFocus>
              <Notice kind="info" message={t("review.sent")} />
            </TakesFocus>
            <Body align="start">
              {sent.mine?.revealed === true ? t("review.bothShown") : t("review.hiddenUntil")}
            </Body>
            {sent.mine !== null && asksWhatWentWrong(sent.mine.rating) ? (
              <WentWrong booking={booking} />
            ) : null}
          </>
        )}
        <BackTo booking={booking} />
      </Stopped>
    );
  }

  return (
    <Screen
      footer={
        <Button
          main
          busy={busy}
          label={t("review.send")}
          onPress={() => {
            void send();
          }}
        />
      }
    >
      <BackButton fallback={backTo(booking)} />
      <View>
        <BookingLine booking={booking} />
        <Title align="start">{t("review.title")}</Title>
      </View>
      <View style={styles.person}>
        <Avatar firstName={name} colour={person.colour} />
        <View style={styles.grow}>
          <Text style={[typography.small, { color: palette.textMuted }]}>{question}</Text>
          <Text style={[typography.bodyStrong, { color: palette.text }]}>{name}</Text>
        </View>
      </View>
      <StarPicker
        label={question}
        value={rating}
        onChange={(chosen) => {
          setNotice(null);
          setRating(chosen);
        }}
      />
      {rating !== null && asksWhatWentWrong(rating) ? <WentWrong booking={booking} /> : null}
      <TextField
        label={t("review.comment")}
        value={comment}
        onChangeText={(text) => {
          setNotice(null);
          setComment(text);
        }}
        multiline
        maxLength={reviewMaxLength * 2}
        help={t("review.commentHelp", { max: reviewMaxLength })}
        error={problem}
      />
      <Body align="start">{t("review.hiddenUntil")}</Body>
      {notice === null ? null : (
        <TakesFocus key={notice}>
          <Notice message={notice} />
        </TakesFocus>
      )}
    </Screen>
  );
}

/**
 * "Did something go wrong?" with a report (3.7.4; spec 9, 3.1): a problem
 * with the trip while it can still be reported, until 24 hours after the
 * trip (R9.1), and the person after that. The report opens over this
 * screen, so a review not yet sent is still here on coming back.
 */
function WentWrong({ booking }: { readonly booking: Booking }) {
  const { t } = useLanguage();
  const kind = booking.problemReportable ? "booking" : "user";
  return (
    <View style={styles.wentWrong}>
      <Body align="start">{t("review.lowRating")}</Body>
      <Button
        variant="secondary"
        label={
          kind === "booking"
            ? t("report.problem")
            : t("report.person", { name: firstNameOf(t, otherPerson(booking)) })
        }
        onPress={() => {
          router.push({ pathname: "/report", params: { kind, id: booking.id } });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  grow: { flex: 1 },
  wentWrong: { gap: spacing.sm },
});
