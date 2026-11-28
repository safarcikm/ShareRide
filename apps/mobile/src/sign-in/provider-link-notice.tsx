import type { EmailLink, ProviderLink } from "@shareride/contracts";
import type { Translate } from "@shareride/i18n";
import { X } from "lucide-react-native";
import { useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "@/auth/session";
import { IconButton } from "@/components/icon-button";
import { Notice } from "@/components/notice";
import { TakesFocus } from "@/components/takes-focus";
import { useLanguage } from "@/i18n/language";
import { cardLift } from "@/theme/pressable";
import { maxContentWidth, radii, spacing } from "@/theme/tokens";
import { usePalette, useScheme } from "@/theme/use-palette";
import { providerNames } from "./provider-window";

/** What the phone step did with the Google or Apple account, in words. */
export function providerLinkText(t: Translate, link: ProviderLink): string | null {
  const provider = providerNames[link.provider];
  switch (link.outcome) {
    case "linked":
      return t("auth.provider.linked", { provider });
    case "replaced":
      return link.email === null
        ? t("auth.provider.replacedHidden", { provider })
        : t("auth.provider.replaced", { provider, email: link.email });
    case "in_use":
      return t("auth.provider.inUse", { provider });
    case "created":
    case "already_linked":
      return null;
  }
}

/** What the phone step did with the proven email, in words (spec 26, 3.3). */
export function emailLinkText(t: Translate, link: EmailLink): string | null {
  switch (link.outcome) {
    case "added":
      return t("auth.email.added", { email: link.email });
    case "replaced":
      return t("auth.email.replaced", { email: link.email });
    case "created":
    case "already":
    case "in_use":
      return null;
  }
}

/**
 * After the phone step linked a Google or Apple account, or an email, to
 * an account that had the number (spec 19, 3.3; spec 26, 3.3): says so
 * over whichever screen opens next,
 * since signing in closes the sign-in screens, until the person closes it.
 * It takes focus as it appears, so a screen reader reads it. On wide
 * screens it sits under the top bar, which pads the top itself.
 */
export function ProviderLinkNotice({ belowTopBar }: { readonly belowTopBar: boolean }) {
  const { t } = useLanguage();
  const session = useSession();
  const palette = usePalette();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const news = useSyncExternalStore(session.subscribe, session.signInNews, session.signInNews);
  const link = news?.providerLink ?? null;
  const email = news?.emailLink ?? null;
  const text =
    link !== null ? providerLinkText(t, link) : email === null ? null : emailLinkText(t, email);
  if (text === null) return null;
  return (
    <View style={[styles.layer, { top: (belowTopBar ? 0 : insets.top) + spacing.sm }]}>
      <View style={styles.width}>
        <TakesFocus>
          <View style={[styles.card, { backgroundColor: palette.surface }, cardLift(scheme).face]}>
            <View style={styles.message}>
              <Notice message={text} kind="info" />
            </View>
            <IconButton
              icon={X}
              label={t("auth.provider.dismiss")}
              onPress={() => {
                session.dismissLinkNotice();
              }}
            />
          </View>
        </TakesFocus>
      </View>
    </View>
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
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.card,
  },
  message: { flex: 1 },
});
