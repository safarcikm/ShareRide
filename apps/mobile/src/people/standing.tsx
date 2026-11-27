import type { Rating } from "@shareride/contracts";
import { formatRating, type Locale, type Translate } from "@shareride/i18n";
import { Star } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/icon";
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
  inline = false,
}: {
  readonly rating: Rating;
  /** As large as the text around it, as on the profile; small beside a name. */
  readonly strong?: boolean;
  /** As wide as its words, with more beside it on the line, such as what is checked. */
  readonly inline?: boolean;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  return (
    <View style={[styles.rating, inline && styles.shrink]}>
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
          inline ? styles.shrink : styles.grow,
          { color: palette.text },
        ]}
      >
        {ratingText(t, locale, rating)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rating: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1 },
  shrink: { flexShrink: 1 },
});
