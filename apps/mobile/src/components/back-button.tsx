import { router, type Href } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useLanguage } from "@/i18n/language";
import { IconButton } from "./icon-button";

/**
 * Back to the previous screen, or to `fallback` when the screen was opened
 * directly. A round icon button (spec 15, section 5.1) whose accessible name
 * is "Back".
 */
export function BackButton({ fallback = "/" }: { readonly fallback?: Href }) {
  const { t } = useLanguage();
  return (
    <IconButton
      icon={ChevronLeft}
      label={t("common.back")}
      faceTestID="back-face"
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace(fallback);
      }}
    />
  );
}
