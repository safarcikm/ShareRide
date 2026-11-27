import type { CallFailure } from "@shareride/api-client";
import { updateMeRoute } from "@shareride/contracts";
import type { Locale } from "@shareride/i18n";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { Notice } from "@/components/notice";
import { RadioCard } from "@/components/radio-card";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { useLanguage } from "@/i18n/language";
import { BackToMenu } from "@/navigation/back-to-menu";
import { spacing } from "@/theme/tokens";

/**
 * The language, a page of Profile (spec 31, 3.14 item 2): the two
 * languages to choose from, each named in its own. Choosing one changes
 * the app at once and the account's language, which is the one used for
 * texts sent to the person; if that cannot be saved, the page says so and
 * choosing again tries again. Quick choices are saved one after the other,
 * so the account ends on the last. Signed out, it closes back to the
 * menu: Profile has the language there.
 */
export default function LanguageScreen() {
  const me = useMe();
  if (me === null) return <BackToMenu />;
  return <Language saved={me.locale} />;
}

const choices = [
  { locale: "en", name: "language.english" },
  { locale: "is", name: "language.icelandic" },
] as const;

function Language({ saved }: { readonly saved: Locale }) {
  const { locale, setLocale, t } = useLanguage();
  const session = useSession();
  // Why saving failed, kept as the API said it: the page says it in the
  // language just chosen.
  const [failure, setFailure] = useState<CallFailure | null>(null);
  // Choices are saved one at a time, so quick ones end on the last: a
  // choice still to send, and whether one is on its way.
  const waiting = useRef<Locale | null>(null);
  const saving = useRef(false);

  async function choose(choice: Locale) {
    // Pressing the one in use asks nothing, unless the account still has
    // the other and nothing is on its way to change that.
    if (choice === locale && (choice === saved || saving.current)) return;
    setFailure(null);
    setLocale(choice);
    waiting.current = choice;
    if (saving.current) return;
    saving.current = true;
    let failed: CallFailure | null = null;
    while (waiting.current !== null) {
      const body = { locale: waiting.current };
      waiting.current = null;
      const result = await session.call(updateMeRoute, { body });
      if (result.ok) session.update(result.data);
      failed = result.ok ? null : result;
    }
    saving.current = false;
    // How the last one went: an earlier one that failed no longer matters.
    setFailure(failed);
  }

  return (
    <Screen>
      <ScreenHead title={t("settings.language")} back="/profile" />
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t("settings.language")}
        style={styles.choices}
      >
        {choices.map((choice) => (
          <RadioCard
            key={choice.locale}
            title={t(choice.name)}
            lang={choice.locale}
            selected={locale === choice.locale}
            onSelect={() => void choose(choice.locale)}
          />
        ))}
      </View>
      <Notice message={failure === null ? null : errorText(t, failure)} />
    </Screen>
  );
}

const styles = StyleSheet.create({ choices: { gap: spacing.sm } });
