import { askAboutMyDataRoute, type Me, type PrivacyRequestKind } from "@shareride/contracts";
import { privacyRequestKinds, validatePrivacyRequest } from "@shareride/domain";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorText, formatWait } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { RadioCard } from "@/components/radio-card";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { TextField } from "@/components/text-field";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { BackToMenu } from "@/navigation/back-to-menu";
import { spacing } from "@/theme/tokens";

/** The text's limit, as the domain checks it; the field takes a little more to say so. */
const textMaxLength = 2000;

/**
 * Ask about my data (spec 11, 3.6; plan 4.8 and 4.9): what it is about and
 * the text, answered by email within a month (R11.7). The answer goes by
 * email, so someone without a verified one adds it first.
 */
export default function AskScreen() {
  const me = useMe();
  const [sent, setSent] = useState(false);
  if (me === null) return <BackToMenu />;
  return sent ? (
    <Thanks />
  ) : (
    <AskForm
      me={me}
      onSent={() => {
        setSent(true);
      }}
    />
  );
}

function AskForm({ me, onSent }: { readonly me: Me; readonly onSent: () => void }) {
  const { t } = useLanguage();
  const session = useSession();
  const [kind, setKind] = useState<PrivacyRequestKind | null>(null);
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  // The API found no verified email, as when it was removed meanwhile.
  const [emailGone, setEmailGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  if (me.email === null || emailGone) return <EmailFirst />;

  async function send() {
    if (sending.current) return;
    setNotice(null);
    if (kind === null) {
      setNotice(t("privacy.ask.chooseKind"));
      return;
    }
    const valid = validatePrivacyRequest({ kind, text });
    if (!valid.ok) {
      setFieldError(t("privacy.ask.textRequired"));
      return;
    }
    sending.current = true;
    setBusy(true);
    const result = await session.call(askAboutMyDataRoute, { body: valid.value });
    sending.current = false;
    setBusy(false);
    if (result.ok) {
      onSent();
      return;
    }
    const { code, retryAfterSeconds = 0 } = result.error;
    if (code === "email_required") setEmailGone(true);
    else if (code === "request_text_invalid") setFieldError(t("privacy.ask.textRequired"));
    else if (code === "rate_limited") {
      setNotice(t("privacy.ask.tooMany", { wait: formatWait(t, retryAfterSeconds) }));
    } else setNotice(errorText(t, result));
  }

  const title = t("privacy.ask.kind");
  return (
    <Screen
      footer={
        <Button
          main
          label={t("privacy.ask.send")}
          busy={busy}
          onPress={() => {
            void send();
          }}
        />
      }
    >
      <BackButton fallback="/settings/privacy" />
      <Title>{t("privacy.ask")}</Title>
      <Body align="start">{t("privacy.ask.intro")}</Body>
      <View accessibilityRole="radiogroup" accessibilityLabel={title} style={styles.group}>
        {privacyRequestKinds.map((each) => (
          <RadioCard
            key={each}
            title={t(`privacy.ask.kind.${each}`)}
            help={t(`privacy.ask.kind.${each}Help`)}
            selected={kind === each}
            onSelect={() => {
              setNotice(null);
              setKind(each);
            }}
          />
        ))}
      </View>
      <TextField
        label={t("privacy.ask.text")}
        value={text}
        onChangeText={(value) => {
          setText(value);
          setFieldError(undefined);
        }}
        multiline
        maxLength={textMaxLength * 2}
        help={t("privacy.ask.textHelp", { email: me.email })}
        error={fieldError}
      />
      {notice === null ? null : (
        <TakesFocus key={notice}>
          <Notice message={notice} />
        </TakesFocus>
      )}
    </Screen>
  );
}

function EmailFirst() {
  const { t } = useLanguage();
  return (
    <Screen>
      <BackButton fallback="/settings/privacy" />
      <Title>{t("privacy.ask")}</Title>
      <Body align="start">{t("privacy.ask.intro")}</Body>
      <View style={styles.group}>
        <Notice kind="info" message={t("privacy.ask.emailFirst")} />
        <Button
          label={t("privacy.ask.addEmail")}
          onPress={() => {
            router.push("/settings/email");
          }}
        />
      </View>
    </Screen>
  );
}

function Thanks() {
  const { t } = useLanguage();
  return (
    <Screen>
      <Title>{t("privacy.ask")}</Title>
      <TakesFocus>
        <Body>{t("privacy.askThanks")}</Body>
      </TakesFocus>
      <View style={styles.group}>
        <Button
          label={t("privacy.ask.backToPrivacy")}
          onPress={() => {
            router.dismissTo("/settings/privacy");
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ group: { gap: spacing.sm, marginTop: spacing.md } });
