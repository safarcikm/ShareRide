import { inviteCodeInputMaxLength } from "@shareride/domain";
import { Redirect, router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useSignInFlow } from "@/sign-in/flow";
import { KeptRideCard } from "@/sign-in/kept-ride-card";
import { SignUpProgress } from "@/sign-in/sign-up-progress";
import { spacing } from "@/theme/tokens";

/**
 * Still step 2, for a number with no account while the beta is closed: the
 * invite code (spec 12, 3.2.3 and screens 2 and 3). The text-message code
 * was right and is kept, and both are sent together. If that code has run
 * out meanwhile, the person goes back to step 1 with the invite code kept.
 */
export default function InviteCodeScreen() {
  const { locale, t } = useLanguage();
  const session = useSession();
  const flow = useSignInFlow();
  const [fieldError, setFieldError] = useState<string>();
  // What the code screen was told about a link's code, shown until the next try.
  const [message, setMessage] = useState<string | null>(flow.notice);
  const [busy, setBusy] = useState(false);
  // Guards against a second tap or a Return key before the first reply.
  const inFlight = useRef(false);

  const phoneNumber = flow.sentTo;
  const smsCode = flow.rightCode;
  if (phoneNumber === null || smsCode === null) return <Redirect href="/sign-in" />;

  async function create() {
    if (phoneNumber === null || smsCode === null || inFlight.current) return;
    const invite = flow.inviteCode.trim();
    if (invite === "") {
      setFieldError(t("invite.missing"));
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    flow.setNotice(null);
    const result = await session.verify(phoneNumber, smsCode, locale, invite);
    if (result.ok) return;
    inFlight.current = false;
    setBusy(false);
    switch (result.error.code) {
      case "invite_invalid":
        setFieldError(errorText(t, result));
        return;
      case "code_invalid":
      case "code_expired":
      case "code_attempts_exceeded":
        // The text-message code is gone: a new one, with the invite code kept.
        flow.setRightCode(null);
        flow.setNotice(t("invite.codeExpired"));
        router.dismissTo("/sign-in");
        return;
      default:
        setMessage(errorText(t, result));
    }
  }

  return (
    <Screen>
      <SignUpProgress step={2} />
      <KeptRideCard kept={flow.keptRide} />
      <Title>{t("invite.title")}</Title>
      <Body>{t("invite.help")}</Body>
      <View style={styles.form}>
        <TextField
          label={t("invite.label")}
          value={flow.inviteCode}
          onChangeText={(typed) => {
            flow.setInviteCode(typed);
            setFieldError(undefined);
          }}
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={inviteCodeInputMaxLength}
          error={fieldError}
          onSubmitEditing={() => void create()}
          autoFocus
        />
        <Notice message={message} />
        <Button label={t("invite.create")} busy={busy} onPress={() => void create()} />
        <Body>{t("invite.noCode")}</Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ form: { gap: spacing.md, marginTop: spacing.md } });
