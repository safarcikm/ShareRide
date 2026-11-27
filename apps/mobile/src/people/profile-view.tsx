import type { CallResult } from "@shareride/api-client";
import {
  profileReviewsRoute,
  publicProfileRoute,
  type ProfileReview,
  type PublicProfile,
} from "@shareride/contracts";
import { formatMonth } from "@shareride/i18n";
import { router } from "expo-router";
import { Ban, BookOpen, Flag, ShieldCheck } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { useReliabilityMonths } from "@/beta/config";
import { ActionRows } from "@/components/action-rows";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Notice } from "@/components/notice";
import { Row } from "@/components/row";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { languagesText } from "@/people/languages";
import { PersonCard } from "@/people/person-card";
import { reliabilityText } from "@/people/standing";
import { firstNameOf, memberSinceText, monthOf } from "@/people/texts";
import { Stars } from "@/reviews/stars";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

type Role = "driver" | "passenger";

/**
 * A person's public profile (spec 1, 3.5; spec 8, screen 7), as anyone
 * signed in sees it, under the screen's head (spec 31, 3.19): who they are
 * in the person's card, as on Profile, with their rating and what is
 * checked on its one line and what they wrote about themselves under it;
 * the reliability figure as a row that unfolds; and the reviews they were
 * given. "See it as others do" shows the same. Each review I did not write
 * offers Report review, so a review about me can be reported from my own
 * profile too. Someone else's (`others`) ends with a card of rows: the
 * community rules, Report, and Block, red and last (spec 9, 3.1.1, 3.2.1
 * and 3.3.4; spec 31, R31.3).
 */
export function ProfileView({
  profileId,
  others = false,
}: {
  readonly profileId: string;
  readonly others?: boolean;
}) {
  const { locale, t } = useLanguage();
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
  const languages = languagesText(profile, locale);
  return (
    <>
      <PersonCard
        firstName={profile.firstName}
        colour={profile.colour}
        photo={profile.photo}
        lines={[
          ...(languages === "" ? [] : [t("profile.speaks", { languages })]),
          memberSinceText(t, locale, monthOf(profile.memberSince)),
        ]}
        standing={profile}
      >
        {profile.about === null ? null : <Body align="start">{profile.about}</Body>}
      </PersonCard>
      <ActionRows>
        <ReliabilityRow reliability={profile.reliability} />
      </ActionRows>
      <ProfileReviews key={profileId} profileId={profileId} />
      {others ? <Safety profile={profile} /> : null}
    </>
  );
}

/** The API's answer for a profile no longer there, or never there. */
const gone = (status: number) => status === 404 || status === 400;

/**
 * The community rules one tap away (spec 9, 3.3.4), then Report and Block,
 * each asking first on its own screen (3.1 and 3.2): rows of the page's
 * last card, Block red and last, as it takes something away (spec 31,
 * R31.3 and decision 17). The addresses name the profile, as its own does:
 * never the person's user ID.
 */
function Safety({ profile }: { readonly profile: PublicProfile }) {
  const { t } = useLanguage();
  const name = profile.firstName;
  const { profileId } = profile;
  return (
    <ActionRows>
      <Row icon={BookOpen} title={t("report.rules")} href="/legal/community-rules" />
      <Row
        icon={Flag}
        title={t("report.person", { name })}
        href={{ pathname: "/report", params: { kind: "profile", id: profileId } }}
      />
      <Row
        danger
        icon={Ban}
        title={t("block.action", { name })}
        href={{ pathname: "/people/[profileId]/block", params: { profileId } }}
      />
    </ActionRows>
  );
}

/**
 * The share kept, or that there are not enough trips yet (3.8.1), as a row
 * that unfolds the counts behind it, by role (3.8.3).
 */
function ReliabilityRow({ reliability }: { readonly reliability: PublicProfile["reliability"] }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const months = useReliabilityMonths();
  const { driver, passenger } = reliability.byRole;
  return (
    <Row
      icon={ShieldCheck}
      title={reliabilityText(t, reliability.percent)}
      expanded={open}
      onToggle={() => {
        setOpen((shown) => !shown);
      }}
    >
      <View style={styles.counts}>
        <Text style={[typography.small, { color: palette.text }]}>
          {t("people.reliabilityCounts", {
            kept: reliability.kept,
            total: reliability.counted,
            months,
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
    </Row>
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
function ProfileReviews({ profileId }: { readonly profileId: string }) {
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
  takesFocus,
}: {
  readonly review: ProfileReview;
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
          {/* My own review I cannot report (spec 9, 3.1.1). */}
          {review.mine ? null : (
            <Button
              variant="text"
              label={t("report.review")}
              // Each review's button says whose and when, as the list reads out many.
              accessibilityLabel={t("report.reviewLabel", by)}
              onPress={() => {
                router.push({ pathname: "/report", params: { kind: "review", id: review.id } });
              }}
            />
          )}
        </Card>
      </TakesFocus>
    </View>
  );
}

const styles = StyleSheet.create({
  counts: { gap: spacing.xs },
  section: { gap: spacing.ms },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
