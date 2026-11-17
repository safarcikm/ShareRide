import type { Rating, Standing } from "@shareride/contracts";
import { formatRating, type Locale, type Translate } from "@shareride/i18n";
import { Star } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { Tag } from "@/components/tag";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { iconSizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** "4.3 (3 ratings)", to one decimal (spec 8, 3.7.5), or that there are none yet. */
export function ratingText(t: Translate, locale: Locale, rating: Rating): string {
  return rating.average === null
    ? t("people.noRatings")
    : t("people.rating", { rating: formatRating(rating.average, locale), count: rating.count });
}

/** "Reliability: 91%", or that there are not enough trips yet (spec 8, 3.8.1). */
export function reliabilityText(t: Translate, percent: number | null): string {
  return percent === null ? t("people.reliabilityNew") : t("people.reliability", { percent });
}

/** The rating after a star, filled once there is one. */
export function RatingLine({
  rating,
  strong = false,
}: {
  readonly rating: Rating;
  /** As large as the text around it, as on the profile; small beside a name. */
  readonly strong?: boolean;
}) {
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
      <Text
        style={[
          strong ? typography.bodyStrong : typography.small,
          styles.grow,
          { color: palette.text },
        ]}
      >
        {ratingText(t, locale, rating)}
      </Text>
    </View>
  );
}

/**
 * How a person stands, under their name on a trip, a request or a booking
 * (spec 4, 3.5.3; spec 5, 3.3.2): the rating, or `newLabel` before the
 * first; then, for members signed in, who have `profileId`, the reliability
 * figure and a link to their profile with the reviews and the counts behind
 * the figure.
 */
export function StandingLines({
  standing,
  profileId,
  name,
  newLabel,
}: {
  readonly standing: Standing;
  readonly profileId: string | null;
  /** Their first name, to say whose profile the link opens. */
  readonly name: string;
  /** "New driver", or "No reviews yet" for a passenger. */
  readonly newLabel: string;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <View style={styles.lines}>
      {standing.rating.count === 0 ? (
        <View style={styles.tag}>
          <Tag kind="warning" label={newLabel} />
        </View>
      ) : (
        <RatingLine rating={standing.rating} />
      )}
      {/* The figure, like the profile, is for members signed in (spec 1, 3.5). */}
      {profileId === null ? null : (
        <Text style={[typography.small, { color: palette.textMuted }]}>
          {reliabilityText(t, standing.reliabilityPercent)}
        </Text>
      )}
      {profileId === null ? null : (
        <TextLink
          label={t("people.open")}
          accessibilityLabel={t("people.openOf", { name })}
          href={{ pathname: "/people/[profileId]", params: { profileId } }}
          align="start"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rating: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1 },
  lines: { gap: spacing.xs, alignItems: "flex-start" },
  tag: { flexDirection: "row" },
});
