import { ShieldCheck } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { useLanguage } from "@/i18n/language";
import { iconSizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * The safety line, the first thing in a conversation (spec 7, 3.1; spec
 * 31, 3.13, item 2): where to pay, and that PuffinRide never asks for card
 * details in a chat. A quiet line with a shield, not a card: it is always
 * there, and asks nothing of the reader (R31.4). A booking paid to the
 * driver `inPerson` has its own words (ADR 0038).
 */
export function SafetyLine({ inPerson }: { readonly inPerson: boolean }) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <View testID="safety-line" style={styles.line}>
      <View style={styles.icon}>
        <Icon icon={ShieldCheck} color={palette.textMuted} size={iconSizes.inline} />
      </View>
      <Text style={[typography.small, styles.words, { color: palette.textMuted }]}>
        {t(inPerson ? "chat.safetyTipInPerson" : "chat.safetyTip")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  // The shield stands at the middle of the first line of the words.
  icon: { height: typography.small.lineHeight, justifyContent: "center" },
  words: { flex: 1 },
});
