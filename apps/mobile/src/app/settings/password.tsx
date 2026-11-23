import type { CallFailure } from "@shareride/api-client";
import { setPasswordRoute, type Me } from "@shareride/contracts";
import { checkNewPassword, passwordRules, type PasswordProblem } from "@shareride/domain";
import type { Translate } from "@shareride/i18n";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { PasswordField } from "@/components/password-field";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { BackToMenu } from "@/navigation/back-to-menu";
import { ConfirmWithCode } from "@/privacy/confirm-with-code";
import { spacing } from "@/theme/tokens";

/** What a password against the rules (R27.2) says. */
function problemText(t: Translate, problem: PasswordProblem): string {
  switch (problem) {
    case "too_short":
      return t("password.tooShort", { min: passwordRules.minLength });
    case "too_long":
      return t("password.tooLong", { max: passwordRules.maxLength });
    case "too_common":
      return t("password.tooCommon");
    case "is_email":
      return t("password.isEmail");
  }
}

/** The API's refusals of a password, as the rules' own problems. */
const apiProblems: Readonly<Record<string, PasswordProblem>> = {
  password_too_short: "too_short",
  password_too_long: "too_long",
  password_too_common: "too_common",
  password_is_email: "is_email",
};

/**
 * Choose a password (spec 27, 3.5): typed once, with "Show", checked with
 * the rules before it is sent (the list of common ones only on the API).
 * A sign-in in the last 10 minutes on this device is the proof; otherwise
 * the API asks for a confirm code and the form appears in place (R27.5).
 * Only for an account with a verified email, its user name. Opened from
 * Sign-in methods, after "Forgot your password?" and after sign-up.
 */
export default function PasswordScreen() {
  const me = useMe();
  if (me === null) return <BackToMenu />;
  return <PasswordForm me={me} />;
}

/** Back where it was opened from, or the menu. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

function PasswordForm({ me }: { readonly me: Me }) {
  const { t } = useLanguage();
  const session = useSession();
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The password waiting for a confirm code, while the form for it shows.
  const [confirming, setConfirming] = useState<string | null>(null);
  // When a new confirm code can be asked for, kept while the form closes and opens.
  const [sentUntil, setSentUntil] = useState(0);
  const [saved, setSaved] = useState(false);
  const sending = useRef(false);

  /** Words for a refusal that is not about the code. */
  function describe(failure: CallFailure): string {
    const problem = apiProblems[failure.error.code];
    if (problem !== undefined) return problemText(t, problem);
    if (failure.error.code === "email_required") return t("password.emailRequired");
    return errorText(t, failure);
  }

  async function confirmed(code: string) {
    if (confirming === null) return { ok: true } as const;
    const result = await session.call(setPasswordRoute, { body: { password: confirming, code } });
    if (!result.ok) return result;
    setConfirming(null);
    setSaved(true);
    return { ok: true } as const;
  }

  async function save() {
    if (sending.current || me.email === null) return;
    setError(null);
    const checked = checkNewPassword(password, me.email, () => false);
    if (!checked.ok) {
      setFieldError(problemText(t, checked.error));
      return;
    }
    sending.current = true;
    setBusy(true);
    const result = await session.call(setPasswordRoute, { body: { password } });
    sending.current = false;
    setBusy(false);
    if (result.ok) {
      setSaved(true);
      return;
    }
    if (result.error.code === "confirm_required") setConfirming(password);
    else if (result.error.code in apiProblems) setFieldError(describe(result));
    else setError(describe(result));
  }

  const header = (
    <>
      <BackButton fallback="/settings/sign-in-methods" />
      <Title>{t("password.title")}</Title>
    </>
  );

  if (me.email === null) {
    return (
      <Screen>
        {header}
        <Body>{t("password.emailRequired")}</Body>
        <View style={styles.form}>
          <Button
            label={t("settings.signInMethods.addEmail")}
            onPress={() => {
              router.push("/settings/email");
            }}
          />
        </View>
      </Screen>
    );
  }

  if (saved) {
    return (
      <Screen>
        {header}
        <TakesFocus>
          <Notice kind="info" urgent={false} message={t("password.saved")} />
        </TakesFocus>
        <View style={styles.form}>
          <Button label={t("common.done")} onPress={leave} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <View style={styles.form}>
        <PasswordField
          label={t("password.field")}
          help={t("password.help")}
          error={fieldError}
          value={password}
          onChangeText={(typed) => {
            setPassword(typed);
            setFieldError(undefined);
            // A changed password needs the code again; one already sent still works.
            setConfirming(null);
          }}
          purpose="new"
          onSubmitEditing={() => void save()}
        />
        <Notice message={error} />
        {confirming === null ? (
          <>
            <Button label={t("password.save")} busy={busy} onPress={() => void save()} />
            <View style={styles.notNow}>
              <Button variant="text" label={t("password.notNow")} onPress={leave} />
            </View>
          </>
        ) : (
          <>
            <Body align="start">{t("password.confirm")}</Body>
            <ConfirmWithCode
              confirmLabel={t("password.save")}
              onConfirm={confirmed}
              describe={describe}
              sentUntil={sentUntil}
              onSent={setSentUntil}
              onCancel={() => {
                setConfirming(null);
              }}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg, marginTop: spacing.md },
  notNow: { alignItems: "flex-start" },
});
