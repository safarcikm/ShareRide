import { router, type Href } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { minTouchTarget, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** A link to another screen, read out as a link by screen readers. */
export function TextLink({ label, href }: { readonly label: string; readonly href: Href }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => {
        router.push(href);
      }}
      style={styles.link}
    >
      <Text style={[typography.body, styles.text, { color: palette.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: minTouchTarget, justifyContent: "center", alignSelf: "flex-start" },
  text: { textDecorationLine: "underline" },
});
