import { router, type Href } from "expo-router";
import { useLanguage } from "@/i18n/language";
import { Button } from "./button";

/** Back to the previous screen, or to `fallback` when the screen was opened directly. */
export function BackButton({ fallback = "/" }: { readonly fallback?: Href }) {
  const { t } = useLanguage();
  return (
    <Button
      variant="text"
      label={t("common.back")}
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace(fallback);
      }}
    />
  );
}
