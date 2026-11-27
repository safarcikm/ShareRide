import { verifyEmailRoute } from "@shareride/contracts";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession, useSessionState } from "@/auth/session";
import { Button } from "@/components/button";
import { Loading } from "@/components/loading";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { linkToken } from "@/email/link-token";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { spacing } from "@/theme/tokens";

/**
 * On the web, the token after the `#` of the address the page was opened
 * with. It is read when this module first loads, which expo-router does once
 * the app has loaded, and so once however often the screen mounts. It then
 * leaves the address bar and the browser's history, so a reload finds none.
 * The browser journey (e2e/email.spec.ts) checks it is still there by then.
 */
const tokenAtLoad = (() => {
  if (Platform.OS !== "web" || window.location.pathname !== "/verify-email") return null;
  const token = linkToken(window.location.hash, undefined);
  window.history.replaceState(null, "", window.location.pathname);
  return token;
})();

/** A link works once: each is asked about once per page load. */
const answers = new Map<string, Promise<unknown>>();

/**
 * The page an email's link opens (plan 4.6): it confirms the address,
 * whether or not the person is signed in on this browser.
 */
async function ask(session: ReturnType<typeof useSession>, token: string) {
  const result = await session.call(verifyEmailRoute, { body: { token } });
  if (result.ok && session.state().status === "signedIn") {
    const me = await session.me();
    if (me.ok) session.update(me.data);
  }
  return result;
}

export default function VerifyEmailScreen() {
  const { token: param } = useLocalSearchParams<{ token?: string }>();
  const [token] = useState(() => tokenAtLoad ?? linkToken("", param));
  const { t } = useLanguage();
  const session = useSession();
  const signedIn = useSessionState().status === "signedIn";
  const verify = useCallback(() => {
    if (token === null) return Promise.resolve(null);
    const asked = answers.get(token) ?? ask(session, token);
    answers.set(token, asked);
    return asked as ReturnType<typeof ask>;
  }, [token, session]);
  const { value: result, reload } = useLoaded(verify);

  const onward = signedIn ? (
    <TextLink label={t("verifyEmail.toProfile")} href="/profile" />
  ) : (
    <TextLink label={t("verifyEmail.toApp")} href="/" />
  );

  if (result === undefined) {
    return (
      <Screen>
        <Body>{t("verifyEmail.checking")}</Body>
        <Loading />
      </Screen>
    );
  }
  if (result === null) {
    return (
      <Screen>
        <Title>{t("verifyEmail.noLink")}</Title>
        <Body>{t("verifyEmail.noLinkBody")}</Body>
        {onward}
      </Screen>
    );
  }
  if (result.ok) {
    return (
      <Screen>
        <Title>{t("verifyEmail.done")}</Title>
        <Body>{t("verifyEmail.doneBody", { email: result.data.email })}</Body>
        {onward}
      </Screen>
    );
  }
  const { code } = result.error;
  if (code === "link_invalid" || code === "email_taken") {
    const taken = code === "email_taken";
    return (
      <Screen>
        <Title>{t(taken ? "verifyEmail.taken" : "verifyEmail.invalid")}</Title>
        <Body>{t(taken ? "verifyEmail.takenBody" : "verifyEmail.invalidBody")}</Body>
        {onward}
      </Screen>
    );
  }
  // Anything else left the link as it was, so it can be tried again.
  return (
    <Screen>
      <View style={styles.retry}>
        <Notice message={errorText(t, result)} />
        <Button
          variant="secondary"
          label={t("common.retry")}
          onPress={() => {
            if (token !== null) answers.delete(token);
            reload();
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  retry: { gap: spacing.md },
});
