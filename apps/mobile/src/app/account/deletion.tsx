import { cancelDeletionRoute } from "@shareride/contracts";
import { formatDayAndMonth } from "@shareride/i18n";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { spacing } from "@/theme/tokens";

/**
 * While an account waits to be deleted (spec 11, 3.4.4; plan 4.5): signing
 * in shows only when it goes, with "Keep my account", which brings it back
 * as it was, and "Sign out". The root layout opens nothing else meanwhile.
 */
export default function DeletionWaitingScreen() {
  const { locale, t } = useLanguage();
  const session = useSession();
  const me = useMe();
  const [busy, setBusy] = useState<"keep" | "signOut" | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (me === null || me.deletionScheduledFor === null) return null;
  const date = formatDayAndMonth(new Date(me.deletionScheduledFor), locale);

  async function keep() {
    setBusy("keep");
    setError(null);
    const result = await session.call(cancelDeletionRoute, { body: {} });
    if (result.ok) {
      // This screen closes and the app opens as it was (_layout.tsx).
      session.update(result.data);
      return;
    }
    setBusy(null);
    setError(errorText(t, result));
  }

  async function signOut() {
    setBusy("signOut");
    setError(null);
    const result = await session.signOut({ all: false });
    if (!result.ok && session.state().status === "signedIn") {
      setBusy(null);
      setError(errorText(t, result));
    }
  }

  return (
    <Screen>
      <Title>{t("privacy.deletionScheduled", { date })}</Title>
      <Body>{t("privacy.waiting.body")}</Body>
      <View style={styles.actions}>
        <Notice message={error} />
        {/* One at a time: a sign-out while keeping would leave no tokens. */}
        <Button
          label={t("privacy.undoDeletion")}
          busy={busy === "keep"}
          disabled={busy !== null}
          onPress={() => void keep()}
        />
        <Button
          variant="secondary"
          label={t("settings.signOut")}
          busy={busy === "signOut"}
          disabled={busy !== null}
          onPress={() => void signOut()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ actions: { gap: spacing.md, marginTop: spacing.md } });
