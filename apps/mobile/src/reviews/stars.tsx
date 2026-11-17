import { Star } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { spaceKeyPresses } from "@/components/space-key";
import { useLanguage } from "@/i18n/language";
import { iconSizes, minTouchTarget, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

const ratings = [1, 2, 3, 4, 5] as const;

/**
 * A rating as five stars, the first `rating` filled, with the number next to
 * them (spec 15, 4.1), read out as one "4 stars out of 5".
 */
export function Stars({ rating }: { readonly rating: number }) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t("review.starsOf", { count: rating })}
      style={styles.shown}
    >
      {ratings.map((star) => (
        <Icon
          key={star}
          icon={Star}
          color={star <= rating ? palette.rating : palette.control}
          fill={star <= rating ? palette.rating : undefined}
          size={iconSizes.inline}
        />
      ))}
      <Text style={[typography.small, { color: palette.textMuted }]}>
        {t("review.score", { count: rating })}
      </Text>
    </View>
  );
}

/**
 * Choosing 1 to 5 stars (R8.8): five radios in a group named by `label`,
 * each read out as its number of stars. The stars up to the chosen one
 * fill, so the choice shows by shape as well as colour.
 */
export function StarPicker({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: number | null;
  readonly onChange: (rating: number) => void;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.picker}>
      {ratings.map((star) => {
        const filled = value !== null && star <= value;
        const choose = () => {
          onChange(star);
        };
        return (
          <Pressable
            key={star}
            accessibilityRole="radio"
            accessibilityLabel={t("review.stars", { count: star })}
            // aria-checked rather than accessibilityState, which the web build drops.
            aria-checked={value === star}
            onPress={choose}
            {...spaceKeyPresses(choose)}
            style={styles.star}
          >
            <Icon
              icon={Star}
              color={filled ? palette.rating : palette.control}
              fill={filled ? palette.rating : undefined}
              size={iconSizes.button}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shown: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  picker: { flexDirection: "row", gap: spacing.xs },
  star: {
    width: minTouchTarget,
    height: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
});
