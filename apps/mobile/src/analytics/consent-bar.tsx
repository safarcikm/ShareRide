import { useSegments } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { Body, Heading } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { useTabBarHeight } from "@/navigation/tab-bar";
import {
  controlOutline,
  edges,
  maxContentWidth,
  pageMaxWidth,
  radii,
  sideColumnWidth,
  spacing,
} from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { useAnalytics } from "./analytics";
import { screenPattern } from "./screen-pattern";

/**
 * The question about cookies (spec 23, 3.1): until the visitor answers, a
 * card at the bottom of every screen, above the menu bar on phones and at
 * the page's bottom right on wide screens, except on the Cookies page, which
 * asks with its switch. It does not block the page or take the focus. Accept
 * and Decline look the same, side by side (R23.2). It waits while signing in
 * or up, and asks on the next screen (spec 29, 3.6).
 */
export function ConsentBar({ wide }: { readonly wide: boolean }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { available, choice, choose } = useAnalytics();
  const segments = useSegments();
  const inMenu = segments[0] === "(tabs)";
  const menuBar = useTabBarHeight(insets.bottom);
  const pattern = screenPattern(segments);
  if (!available || choice !== null || pattern === "/cookies" || signingIn(pattern)) return null;
  const bottom = wide ? spacing.md : (inMenu ? menuBar : insets.bottom) + spacing.sm;
  return (
    <View testID="consent-layer" style={[styles.layer, { bottom }]}>
      <View style={[styles.width, wide && styles.wide]}>
        <View
          role="region"
          aria-label={t("consent.title")}
          style={[
            styles.card,
            wide && styles.wideCard,
            {
              backgroundColor: palette.surface,
              borderColor: palette.edge,
            },
          ]}
        >
          <Heading>{t("consent.title")}</Heading>
          <Body align="start">{t("consent.text")}</Body>
          <TextLink label={t("consent.more")} href="/cookies" align="start" />
          <View style={styles.buttons}>
            <View style={styles.button}>
              <Button
                variant="secondary"
                fill
                label={t("consent.accept")}
                onPress={() => {
                  choose("accepted");
                }}
              />
            </View>
            <View style={styles.button}>
              <Button
                variant="secondary"
                fill
                label={t("consent.decline")}
                onPress={() => {
                  choose("declined");
                }}
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Step 1, the codes, the phone number, About you and the Face ID offers. */
function signingIn(pattern: string): boolean {
  return ["/sign-in", "/onboarding"].some(
    (start) => pattern === start || pattern.startsWith(`${start}/`),
  );
}

const styles = StyleSheet.create({
  // Only the card takes taps; the screen around it stays as it is.
  layer: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    alignItems: "center",
    pointerEvents: "box-none",
  },
  width: { width: "100%", maxWidth: maxContentWidth },
  // At the bottom right of the page's width.
  wide: { maxWidth: pageMaxWidth, alignItems: "flex-end" },
  card: {
    width: "100%",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: controlOutline,
    // A card's chunky edge (spec 15, section 5.2).
    borderBottomWidth: edges.card,
  },
  wideCard: { maxWidth: sideColumnWidth },
  buttons: { flexDirection: "row", gap: spacing.sm },
  button: { flex: 1 },
});
