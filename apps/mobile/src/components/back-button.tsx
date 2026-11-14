import { router, type Href } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { useLanguage } from "@/i18n/language";
import { chunky } from "@/theme/pressable";
import { edges, radii, sizes } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Icon } from "./icon";

/**
 * Back to the previous screen, or to `fallback` when the screen was opened
 * directly. A round icon button (spec 15, section 5.1) whose accessible name
 * is "Back".
 */
export function BackButton({ fallback = "/" }: { readonly fallback?: Href }) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("common.back")}
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace(fallback);
      }}
      style={({ pressed }) => [styles.outer, chunky(edges.card, palette.edge, pressed).outer]}
    >
      {({ pressed }) => (
        <View
          testID="back-face"
          style={[
            styles.face,
            { backgroundColor: palette.surface },
            chunky(edges.card, palette.edge, pressed).face,
          ]}
        >
          <Icon icon={ChevronLeft} color={palette.text} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: sizes.iconButton,
    height: sizes.iconButton,
    borderRadius: radii.pill,
    alignSelf: "flex-start",
  },
  face: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radii.pill },
});
