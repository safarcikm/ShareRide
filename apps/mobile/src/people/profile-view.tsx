import type { CallResult } from "@shareride/api-client";
import {
  profileReviewsRoute,
  publicProfileRoute,
  type ProfileReview,
  type PublicProfile,
} from "@shareride/contracts";
import { formatMonth, formatRating } from "@shareride/i18n";
import { ShieldCheck, Star } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Icon } from "@/components/icon";
import { Notice } from "@/components/notice";
import { Tag } from "@/components/tag";
import { Body, Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { languagesText } from "@/people/languages";
import { firstNameOf, memberSinceText, monthOf } from "@/people/texts";
import { Stars } from "@/reviews/stars";
import { iconSizes, minTouchTarget, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

type Role = "driver" | "passenger";

/**
 * A person's public profile (spec 1, 3.5; spec 8, screen 7), as anyone
 * signed in sees it: who they are, their rating and reliability figure,
 * and the reviews they were given. "See it as others do" shows the same.
 */
export function ProfileView({ profileId }: { readonly profileId: string }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const load = useCallback(
    () => session.call(publicProfileRoute, { params: { profileId } }),
    [session, profileId],
  );
  const { value: answer, reload } = useLoaded(load);
  if (answer === undefined) {
    return <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />;
  }
  if (!answer.ok) {
    // Someone who left, or is leaving, is not found (spec 11, 3.4.3).
    return answer.status === 404 ? (
      <Notice message={t("people.notFound")} />
    ) : (
      <>
        <Notice message={t("people.failed")} />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </>
    );
  }
  const profile = answer.data;
  return (
    <>
      <Person profile={profile} />
      <Card>
        <RatingLine rating={profile.rating} />
        <ReliabilityFigure reliability={profile.reliability} />
      </Card>
      <ProfileReviews profileId={profileId} />
    </>
  );
}

function Person({ profile }: { readonly profile: PublicProfile }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const languages = languagesText(profile, locale);
  return (
    <Card>
      <View style={styles.person}>
        <Avatar firstName={profile.firstName} colour={profile.colour} />
        <View style={styles.grow}>
          <Heading>{profile.firstName}</Heading>
          {languages === "" ? null : (
            <Text style={[typography.small, { color: palette.textMuted }]}>
              {t("profile.speaks", { languages })}
            </Text>
          )}
          <Text style={[typography.small, { color: palette.textMuted }]}>
            {memberSinceText(t, locale, monthOf(profile.memberSince))}
          </Text>
        </View>
      </View>
      {profile.phoneVerified || profile.emailVerified ? (
        <View style={styles.tags}>
          {profile.phoneVerified ? <Tag kind="positive" label={t("people.phoneVerified")} /> : null}
          {profile.emailVerified ? <Tag kind="positive" label={t("people.emailVerified")} /> : null}
        </View>
      ) : null}
      {profile.about === null ? null : <Body align="start">{profile.about}</Body>}
    </Card>
  );
}

/** "4.3 (3 ratings)", to one decimal (3.7.5), or that there are none yet. */
function RatingLine({ rating }: { readonly rating: PublicProfile["rating"] }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  return (
    <View style={styles.rating}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon
          icon={Star}
          color={palette.rating}
          fill={rating.average === null ? undefined : palette.rating}
          size={iconSizes.inline}
        />
      </View>
      <Text style={[typography.bodyStrong, styles.grow, { color: palette.text }]}>
        {rating.average === null
          ? t("people.noRatings")
          : t("people.rating", {
              rating: formatRating(rating.average, locale),
              count: rating.count,
            })}
      </Text>
    </View>
  );
}

/**
 * The share kept, or that there are not enough trips yet (3.8.1); tapping
 * it shows the counts behind it, by role (3.8.3).
 */
function ReliabilityFigure({
  reliability,
}: {
  readonly reliability: PublicProfile["reliability"];
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const label =
    reliability.percent === null
      ? t("people.reliabilityNew")
      : t("people.reliability", { percent: reliability.percent });
  const { driver, passenger } = reliability.byRole;
  return (
    <View style={styles.figure}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setOpen((shown) => !shown);
        }}
        style={styles.line}
      >
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon icon={ShieldCheck} color={palette.text} size={iconSizes.inline} />
        </View>
        <Text style={[typography.bodyStrong, styles.grow, { color: palette.text }]}>{label}</Text>
      </Pressable>
      {open ? (
        <View style={styles.counts}>
          <Text style={[typography.small, { color: palette.text }]}>
            {t("people.reliabilityCounts", {
              kept: reliability.kept,
              total: reliability.counted,
            })}
          </Text>
          <Text style={[typography.small, { color: palette.textMuted }]}>
            {t("people.reliabilityAsDriver", { kept: driver.kept, total: driver.counted })}
          </Text>
          <Text style={[typography.small, { color: palette.textMuted }]}>
            {t("people.reliabilityAsPassenger", {
              kept: passenger.kept,
              total: passenger.counted,
            })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

type Page = CallResult<typeof profileReviewsRoute>;

/**
 * The reviews the person was given, newest first, for both roles or one,
 * a page at a time (3.7.5).
 */
function ProfileReviews({ profileId }: { readonly profileId: string }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [role, setRole] = useState<Role | null>(null);
  const [reviews, setReviews] = useState<readonly ProfileReview[]>([]);
  const [more, setMore] = useState(false);
  const [state, setState] = useState<"loading" | "shown" | "failed">("loading");
  // Counts the attempts at the first page, so a retry loads it again.
  const [attempt, setAttempt] = useState(0);

  const page = useCallback(
    (before?: string): Promise<Page> =>
      session.call(profileReviewsRoute, {
        params: { profileId },
        query: {
          ...(role === null ? {} : { role }),
          ...(before === undefined ? {} : { before }),
        },
      }),
    [session, profileId, role],
  );

  useEffect(() => {
    let current = true;
    void page().then((answer) => {
      if (!current) return;
      if (answer.ok) {
        setReviews(answer.data.reviews);
        setMore(answer.data.more);
        setState("shown");
      } else {
        setState("failed");
      }
    });
    return () => {
      current = false;
    };
  }, [page, attempt]);

  const showMore = async () => {
    setState("loading");
    const answer = await page(reviews.at(-1)?.id);
    if (answer.ok) {
      setReviews((shown) => [...shown, ...answer.data.reviews]);
      setMore(answer.data.more);
      setState("shown");
    } else {
      setState("failed");
    }
  };
  const retry = () => {
    if (reviews.length === 0) {
      setState("loading");
      setAttempt((count) => count + 1);
    } else {
      void showMore();
    }
  };

  const roles = [
    { value: null, label: t("people.reviewsAll") },
    { value: "driver", label: t("people.reviewsAsDriver") },
    { value: "passenger", label: t("people.reviewsAsPassenger") },
  ] as const;
  return (
    <View style={styles.section}>
      <Heading>{t("people.reviews")}</Heading>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t("people.reviewsShown")}
        style={styles.chips}
      >
        {roles.map((option) => (
          <Chip
            key={option.label}
            role="radio"
            label={option.label}
            selected={option.value === role}
            onToggle={() => {
              if (option.value === role) return;
              setReviews([]);
              setMore(false);
              setState("loading");
              setRole(option.value);
            }}
          />
        ))}
      </View>
      {reviews.length === 0 && state === "shown" ? (
        <Body align="start">{t("people.noReviews")}</Body>
      ) : null}
      {reviews.length === 0 ? null : (
        <View role="list" accessibilityLabel={t("people.reviews")} style={styles.section}>
          {reviews.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </View>
      )}
      {state === "loading" ? (
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      ) : null}
      {state === "failed" ? (
        <>
          <Notice message={t("people.reviewsFailed")} />
          <Button variant="secondary" label={t("common.retry")} onPress={retry} />
        </>
      ) : null}
      {state === "shown" && more ? (
        <Button
          variant="secondary"
          label={t("people.moreReviews")}
          onPress={() => {
            void showMore();
          }}
        />
      ) : null}
    </View>
  );
}

function ReviewItem({ review }: { readonly review: ProfileReview }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const written = monthOf(review.writtenIn);
  const by = {
    name: firstNameOf(t, review.author),
    month: formatMonth(written.month, locale),
    year: String(written.year),
  };
  return (
    <View role="listitem">
      <Card>
        <Stars rating={review.rating} />
        <Text style={[typography.small, { color: palette.textMuted }]}>
          {review.authorRole === "driver"
            ? t("people.reviewBy.driver", by)
            : t("people.reviewBy.passenger", by)}
        </Text>
        {review.comment === "" ? null : <Body align="start">{review.comment}</Body>}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  grow: { flex: 1, gap: spacing.xs },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  rating: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  // The figure is pressed, so it is at least a touch target high.
  line: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: minTouchTarget },
  figure: { gap: spacing.xs },
  counts: { gap: spacing.xs },
  section: { gap: spacing.ms },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
