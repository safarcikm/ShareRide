import type { CallResult } from "@shareride/api-client";
import {
  profileReviewsRoute,
  publicProfileRoute,
  type ProfileReview,
  type PublicProfile,
} from "@shareride/contracts";
import { formatMonth } from "@shareride/i18n";
import { router } from "expo-router";
import { ShieldCheck } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Icon } from "@/components/icon";
import { Notice } from "@/components/notice";
import { TakesFocus } from "@/components/takes-focus";
import { Tag } from "@/components/tag";
import { TextLink } from "@/components/text-link";
import { Body, Heading, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { languagesText } from "@/people/languages";
import { RatingLine, reliabilityText } from "@/people/standing";
import { firstNameOf, memberSinceText, monthOf } from "@/people/texts";
import { Stars } from "@/reviews/stars";
import { iconSizes, minTouchTarget, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

type Role = "driver" | "passenger";

/**
 * A person's public profile (spec 1, 3.5; spec 8, screen 7), as anyone
 * signed in sees it: who they are, their rating and reliability figure,
 * and the reviews they were given. "See it as others do" shows the same,
 * under its own title, so the name is a heading there (`nameAs`). Someone
 * else's (`others`) also offers Report and Block, Report review on each
 * review, and the community rules (spec 9, 3.1.1, 3.2.1 and 3.3.4).
 */
export function ProfileView({
  profileId,
  nameAs = "title",
  others = false,
}: {
  readonly profileId: string;
  readonly nameAs?: "title" | "heading";
  readonly others?: boolean;
}) {
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
    // Someone who left, or is leaving, is not found (spec 11, 3.4.3), and
    // an address that is no profile's is refused: neither comes back.
    return gone(answer.status) ? (
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
      <Person profile={profile} nameAs={nameAs} />
      {others ? <Safety profile={profile} /> : null}
      <Card>
        <RatingLine rating={profile.rating} strong />
        <ReliabilityFigure reliability={profile.reliability} />
      </Card>
      <ProfileReviews key={profileId} profileId={profileId} reportable={others} />
    </>
  );
}

/** The API's answer for a profile no longer there, or never there. */
const gone = (status: number) => status === 404 || status === 400;

function Person({
  profile,
  nameAs,
}: {
  readonly profile: PublicProfile;
  readonly nameAs: "title" | "heading";
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const languages = languagesText(profile, locale);
  return (
    <Card>
      <View style={styles.person}>
        <Avatar firstName={profile.firstName} colour={profile.colour} />
        <View style={styles.grow}>
          {nameAs === "title" ? (
            <Title align="start">{profile.firstName}</Title>
          ) : (
            <Heading>{profile.firstName}</Heading>
          )}
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

/**
 * Report and Block, each asking first on its own screen (spec 9, 3.1 and
 * 3.2), and the community rules one tap away (3.3.4). The addresses name
 * the profile, as its own does: never the person's user ID.
 */
function Safety({ profile }: { readonly profile: PublicProfile }) {
  const { t } = useLanguage();
  const name = profile.firstName;
  return (
    <View style={styles.safety}>
      <View style={styles.actions}>
        <Button
          variant="text"
          label={t("report.person", { name })}
          onPress={() => {
            router.push({
              pathname: "/report",
              params: { kind: "profile", id: profile.profileId },
            });
          }}
        />
        <Button
          variant="text"
          label={t("block.action", { name })}
          onPress={() => {
            router.push({
              pathname: "/people/[profileId]/block",
              params: { profileId: profile.profileId },
            });
          }}
        />
      </View>
      <TextLink label={t("report.rules")} href="/legal/community-rules" align="start" />
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
  const label = reliabilityText(t, reliability.percent);
  const { driver, passenger } = reliability.byRole;
  return (
    <View style={styles.figure}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        aria-expanded={open}
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
 * What takes focus once a page arrives after a button was pressed, as the
 * button is gone by then: the first review it brought, or the failure.
 */
type Focus = { readonly review: string } | "failure" | null;

/**
 * The reviews the person was given, newest first, for both roles or one,
 * a page at a time (3.7.5).
 */
function ProfileReviews({
  profileId,
  reportable,
}: {
  readonly profileId: string;
  /** Each review offers Report review: on someone else's profile. */
  readonly reportable: boolean;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [role, setRole] = useState<Role | null>(null);
  const [reviews, setReviews] = useState<readonly ProfileReview[]>([]);
  const [more, setMore] = useState(false);
  const [state, setState] = useState<"loading" | "shown" | "failed" | "gone">("loading");
  const [focus, setFocus] = useState<Focus>(null);
  // Each page asked for takes the next number, and only the answer to the
  // latest is shown: a page asked for before the filter changed is dropped.
  const latest = useRef(0);

  /**
   * The first page for `shown` or, after `before`, the next; null once a
   * later page has been asked for.
   */
  const ask = useCallback(
    async (shown: Role | null, before: string | undefined): Promise<Page | null> => {
      latest.current += 1;
      const asked = latest.current;
      const answer = await session.call(profileReviewsRoute, {
        params: { profileId },
        query: {
          ...(shown === null ? {} : { role: shown }),
          ...(before === undefined ? {} : { before }),
        },
      });
      return asked === latest.current ? answer : null;
    },
    [session, profileId],
  );

  /** Shows a page, after the earlier ones unless it is the first. */
  const show = useCallback((answer: Page, first: boolean, pressed: boolean) => {
    if (!answer.ok) {
      setState(gone(answer.status) ? "gone" : "failed");
      setFocus(pressed ? "failure" : null);
      return;
    }
    const { reviews: page, more: further } = answer.data;
    setReviews((earlier) => {
      if (first) return page;
      const known = new Set(earlier.map((review) => review.id));
      return [...earlier, ...page.filter((review) => !known.has(review.id))];
    });
    setMore(further);
    setState("shown");
    const top = page[0];
    setFocus(pressed && top !== undefined ? { review: top.id } : null);
  }, []);

  useEffect(() => {
    void ask(null, undefined).then((answer) => {
      if (answer !== null) show(answer, true, false);
    });
  }, [ask, show]);

  /** Loads a page for `shown`, unless a later one was asked for meanwhile. */
  const load = (shown: Role | null, before: string | undefined, pressed: boolean) => {
    void ask(shown, before).then((answer) => {
      if (answer !== null) show(answer, before === undefined, pressed);
    });
  };

  /** Show more, or try the page that failed again. */
  const next = () => {
    setState("loading");
    load(role, reviews.at(-1)?.id, true);
  };

  const roles = [
    { value: null, label: t("people.reviewsAll") },
    { value: "driver", label: t("people.reviewsAsDriver") },
    { value: "passenger", label: t("people.reviewsAsPassenger") },
  ] as const;
  const none =
    role === null
      ? t("people.noReviews")
      : role === "driver"
        ? t("people.noReviewsAsDriver")
        : t("people.noReviewsAsPassenger");
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
              setRole(option.value);
              setReviews([]);
              setMore(false);
              setState("loading");
              setFocus(null);
              load(option.value, undefined, false);
            }}
          />
        ))}
      </View>
      {reviews.length === 0 && state === "shown" ? <Body align="start">{none}</Body> : null}
      {reviews.length === 0 ? null : (
        <View role="list" accessibilityLabel={t("people.reviews")} style={styles.section}>
          {reviews.map((review) => (
            <ReviewItem
              key={review.id}
              review={review}
              reportable={reportable}
              takesFocus={focus !== null && focus !== "failure" && focus.review === review.id}
            />
          ))}
        </View>
      )}
      {state === "loading" ? (
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      ) : null}
      {state === "gone" ? (
        <TakesFocus when={focus === "failure"}>
          <Notice message={t("people.notFound")} />
        </TakesFocus>
      ) : null}
      {state === "failed" ? (
        <>
          <TakesFocus when={focus === "failure"}>
            <Notice message={t("people.reviewsFailed")} />
          </TakesFocus>
          <Button variant="secondary" label={t("common.retry")} onPress={next} />
        </>
      ) : null}
      {state === "shown" && more ? (
        <Button variant="secondary" label={t("people.moreReviews")} onPress={next} />
      ) : null}
    </View>
  );
}

function ReviewItem({
  review,
  reportable,
  takesFocus,
}: {
  readonly review: ProfileReview;
  readonly reportable: boolean;
  readonly takesFocus: boolean;
}) {
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
      {/* Mounted with the page that brought it, so it takes focus then. */}
      <TakesFocus when={takesFocus}>
        <Card>
          <Stars rating={review.rating} />
          <Text style={[typography.small, { color: palette.textMuted }]}>
            {review.authorRole === "driver"
              ? t("people.reviewBy.driver", by)
              : t("people.reviewBy.passenger", by)}
          </Text>
          {review.comment === "" ? null : <Body align="start">{review.comment}</Body>}
          {reportable ? (
            <Button
              variant="text"
              label={t("report.review")}
              // Each review's button says whose and when, as the list reads out many.
              accessibilityLabel={t("report.reviewLabel", by)}
              onPress={() => {
                router.push({ pathname: "/report", params: { kind: "review", id: review.id } });
              }}
            />
          ) : null}
        </Card>
      </TakesFocus>
    </View>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  grow: { flex: 1, gap: spacing.xs },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  // The figure is pressed, so it is at least a touch target high.
  line: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: minTouchTarget },
  figure: { gap: spacing.xs },
  counts: { gap: spacing.xs },
  section: { gap: spacing.ms },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  safety: { gap: spacing.xs },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
