import { ArrowUpDown } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/i18n/language";
import { controlOutline, minTouchTarget, radii, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Card } from "./card";
import { IconButton } from "./icon-button";

export type RouteEnd = "from" | "to";

/**
 * From and To in one card, each pressed to choose again, with a button that
 * swaps them: for posting a trip (spec 3) and for searching (spec 4).
 */
export function RouteEnds({
  from,
  to,
  labels,
  onPick,
  onSwap,
}: {
  /** The chosen names, or null for not chosen yet. */
  readonly from: string | null;
  readonly to: string | null;
  readonly labels: {
    readonly from: string;
    readonly to: string;
    /** Shown while an end is not chosen. */
    readonly choose: string;
    readonly swap: string;
  };
  readonly onPick: (end: RouteEnd) => void;
  readonly onSwap: () => void;
}) {
  const palette = usePalette();
  return (
    <Card>
      <View style={styles.ends}>
        <View style={styles.endFields}>
          <End
            label={labels.from}
            value={from}
            placeholder={labels.choose}
            filled={false}
            onPress={() => {
              onPick("from");
            }}
          />
          <View style={[styles.divider, { backgroundColor: palette.border }]} />
          <End
            label={labels.to}
            value={to}
            placeholder={labels.choose}
            filled
            onPress={() => {
              onPick("to");
            }}
          />
        </View>
        <IconButton
          icon={ArrowUpDown}
          label={labels.swap}
          disabled={from === null && to === null}
          onPress={onSwap}
        />
      </View>
    </Card>
  );
}

/** From or To: what is chosen, pressed to choose again. */
function End({
  label,
  value,
  placeholder,
  filled,
  onPress,
}: {
  readonly label: string;
  readonly value: string | null;
  readonly placeholder: string;
  /** The end of the route has a filled dot, the start an empty one. */
  readonly filled: boolean;
  readonly onPress: () => void;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const shown = value ?? placeholder;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("trip.route.field", { field: label, value: shown })}
      onPress={onPress}
      style={styles.end}
    >
      <View
        style={[
          styles.dot,
          { borderColor: palette.primary },
          filled && { backgroundColor: palette.primary },
        ]}
      />
      <View style={styles.endTexts}>
        <Text style={[typography.caption, { color: palette.textMuted }]}>{label}</Text>
        <Text
          style={[
            value === null ? typography.body : typography.bodyStrong,
            { color: value === null ? palette.textMuted : palette.text },
          ]}
        >
          {shown}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ends: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  endFields: { flex: 1 },
  end: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.ms,
    minHeight: minTouchTarget,
    paddingVertical: spacing.xs,
  },
  endTexts: { flex: 1 },
  dot: {
    width: spacing.ms,
    height: spacing.ms,
    borderRadius: radii.pill,
    borderWidth: controlOutline,
  },
  divider: { height: controlOutline, marginLeft: spacing.ms + spacing.ms },
});
