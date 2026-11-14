import { Check } from "lucide-react-native";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/i18n/language";
import { controlOutline, iconSizes, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Button } from "./button";
import { Icon } from "./icon";

const onWeb = Platform.OS === "web";

interface TickRowProps {
  readonly label: string;
  readonly done: boolean;
  /** A line under the label, such as when it was done. */
  readonly detail?: string | undefined;
  /** What to do about it, shown while it is not done. */
  readonly action?: { readonly label: string; readonly onPress: () => void } | undefined;
  readonly testID?: string;
}

/**
 * A row of a checklist (spec 15, `TickList`): done is a filled `primary` box
 * with a tick, not done an empty `control` box with an action button. Screen
 * readers hear the label and whether it is done; the button stays separate.
 * Phones read the row as one element with that label. The web ignores such
 * a label on a plain element, so there the status follows the label as
 * hidden text.
 */
export function TickRow({ label, done, detail, action, testID }: TickRowProps) {
  const { t } = useLanguage();
  const palette = usePalette();
  const status = done ? t("common.done") : t("common.notDone");
  return (
    <View testID={testID} style={styles.row}>
      <View
        {...(onWeb
          ? {}
          : {
              accessible: true,
              accessibilityLabel: `${label}: ${status}${detail === undefined ? "" : `. ${detail}`}`,
            })}
        style={styles.summary}
      >
        <View
          testID="tick-box"
          style={[
            styles.box,
            done
              ? { backgroundColor: palette.primary, borderColor: palette.primary }
              : { borderColor: palette.control },
          ]}
        >
          {done ? <Icon icon={Check} color={palette.onPrimary} size={iconSizes.tick} /> : null}
        </View>
        <View style={styles.texts}>
          <Text style={[typography.label, { color: palette.text }]}>
            {label}
            {onWeb ? <Text style={styles.hidden}>{`: ${status}`}</Text> : null}
          </Text>
          {detail === undefined ? null : (
            <Text style={[typography.small, { color: palette.textMuted }]}>{detail}</Text>
          )}
        </View>
      </View>
      {action === undefined || done ? null : (
        <View style={styles.action}>
          <Button variant="secondary" label={action.label} onPress={action.onPress} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm },
  summary: { flexDirection: "row", alignItems: "flex-start", gap: spacing.ms },
  box: {
    width: sizes.checkbox,
    height: sizes.checkbox,
    borderRadius: radii.checkbox,
    borderWidth: controlOutline,
    alignItems: "center",
    justifyContent: "center",
  },
  texts: { flex: 1, gap: spacing.xs / 2 },
  // Read by screen readers, not seen.
  hidden: { position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 },
  // Under the label, in line with it: a row, so the button leaves the middle.
  action: { flexDirection: "row", paddingLeft: sizes.checkbox + spacing.ms },
});
