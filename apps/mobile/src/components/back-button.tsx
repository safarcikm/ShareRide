import { router, type Href } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useLanguage } from "@/i18n/language";
import { IconButton } from "./icon-button";

/**
 * Back to the previous screen, or to `fallback` when the screen was opened
 * directly. A round icon button (spec 15, section 5.1) whose accessible name
 * is "Back". Where what it leaves is not a screen of its own, such as a
 * picker shown in a step's place, `onPress` closes that instead. In a bar
 * that stays, as a conversation's top is, it is `quiet`: the chevron
 * alone, in the text's colour (spec 31, 3.13).
 */
export function BackButton({
  fallback = "/",
  onPress,
  quiet = false,
}: {
  readonly fallback?: Href;
  readonly onPress?: (() => void) | undefined;
  readonly quiet?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <IconButton
      icon={ChevronLeft}
      label={t("common.back")}
      quiet={quiet}
      strong={quiet}
      faceTestID="back-face"
      onPress={
        onPress ??
        (() => {
          if (router.canGoBack()) router.back();
          else router.replace(fallback);
        })
      }
    />
  );
}
