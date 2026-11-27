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
import { ScreenHead } from "@/components/screen-head";
import { Body } from "@/components/text";
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
 * whether or not the person is signed in on this browser. What the link
 * did is the title, at the left and with focus, with nothing to go back
 * to; the way on is the page's one main button, a link, in the bottom bar
 * (spec 31, 3.19 and R31.1).
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
    <Button main label={t("verifyEmail.toProfile")} href="/profile" />
  ) : (
    <Button main label={t("verifyEmail.toApp")} href="/" />
  );
  /** What the link did, or why it did nothing, and the way on. */
  const answer = (of: string, title: string, line: string) => (
    <Screen footer={onward}>
      <ScreenHead title={title} line={line} back={null} outcome={{ of, focus: true }} />
    </Screen>
  );

  if (result === undefined) {
    return (
      <Screen>
        <Body align="start">{t("verifyEmail.checking")}</Body>
        <Loading />
      </Screen>
    );
  }
  if (result === null) {
    return answer("noLink", t("verifyEmail.noLink"), t("verifyEmail.noLinkBody"));
  }
  if (result.ok) {
    return answer(
      "done",
      t("verifyEmail.done"),
      t("verifyEmail.doneBody", { email: result.data.email }),
    );
  }
  const { code } = result.error;
  if (code === "link_invalid" || code === "email_taken") {
    const taken = code === "email_taken";
    return answer(
      code,
      t(taken ? "verifyEmail.taken" : "verifyEmail.invalid"),
      t(taken ? "verifyEmail.takenBody" : "verifyEmail.invalidBody"),
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
