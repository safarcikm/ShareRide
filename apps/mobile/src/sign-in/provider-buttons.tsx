import type { SignInProvider } from "@shareride/domain";
import { ActivityIndicator, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useLanguage } from "@/i18n/language";
import { chunky } from "@/theme/pressable";
import {
  controlOutline,
  edges,
  googleLogo,
  iconSizes,
  radii,
  signInBrands,
  sizes,
  spacing,
  typography,
} from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** Google's "G", from its sign-in button kit. The button's name says what it is. */
function GoogleMark({ size }: { readonly size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill={googleLogo.red}
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill={googleLogo.blue}
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill={googleLogo.yellow}
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill={googleLogo.green}
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

/** Apple's logo, in the button's text colour. */
function AppleMark({ size, color }: { readonly size: number; readonly color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 814 1000">
      <Path
        fill={color}
        d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"
      />
    </Svg>
  );
}

/**
 * "Continue with Google" and "Continue with Apple" (spec 19, 3.1), in the
 * brands' own colours, logos and words, shaped like our buttons: full
 * width, sinking over their edge when pressed. Only the providers the API
 * has set up show. Busy shows a spinner on the one pressed and holds both.
 */
export function ProviderButtons({
  providers,
  busy,
  disabled = false,
  onPress,
}: {
  readonly providers: readonly SignInProvider[];
  /** The provider whose window is open or whose sign-in is finishing. */
  readonly busy: SignInProvider | null;
  /** Held for a moment while the next try is made ready. */
  readonly disabled?: boolean;
  readonly onPress: (provider: SignInProvider) => void;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const brand = signInBrands[useColorScheme() === "dark" ? "dark" : "light"];
  if (providers.length === 0) return null;
  return (
    <View style={styles.list}>
      {providers.map((provider) => {
        const google = provider === "google";
        const label = t(google ? "auth.continueGoogle" : "auth.continueApple");
        const text = google ? brand.googleText : brand.appleText;
        const held = busy !== null || disabled;
        return (
          <Pressable
            key={provider}
            accessibilityRole="button"
            accessibilityLabel={label}
            aria-disabled={held}
            aria-busy={busy === provider}
            disabled={held}
            onPress={() => {
              onPress(provider);
            }}
            style={({ pressed }) => [
              styles.outer,
              chunky(edges.buttonSecondary, palette.edge, pressed && !held).outer,
            ]}
          >
            {({ pressed }) => (
              <View
                style={[
                  styles.face,
                  google
                    ? { backgroundColor: brand.googleFill, borderColor: brand.googleBorder }
                    : { backgroundColor: brand.appleFill, borderColor: brand.appleFill },
                  chunky(edges.buttonSecondary, palette.edge, pressed && !held).face,
                ]}
              >
                {busy === provider ? (
                  <ActivityIndicator size="small" color={text} />
                ) : google ? (
                  <GoogleMark size={iconSizes.inline} />
                ) : (
                  <AppleMark size={iconSizes.button} color={text} />
                )}
                <Text style={[typography.button, styles.label, { color: text }]}>{label}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.ms, alignSelf: "stretch" },
  outer: { minHeight: sizes.buttonHeight, borderRadius: radii.control, alignSelf: "stretch" },
  face: {
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.control,
    // Google's button has an outline of its own; Apple's is the fill's colour.
    borderWidth: controlOutline,
  },
  label: { flexShrink: 1, textAlign: "center" },
});
