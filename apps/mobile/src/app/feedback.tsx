import { sendFeedbackRoute } from "@shareride/contracts";
import { checkFeedback, feedbackKinds, feedbackRules, type FeedbackKind } from "@shareride/domain";
import { router } from "expo-router";
import { Inbox } from "lucide-react-native";
import { useRef, useState } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import { thisDevice } from "@/auth/api";
import { errorText, formatWait } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { takeFeedbackStart } from "@/beta/feedback";
import { ActionRows } from "@/components/action-rows";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { RadioCard } from "@/components/radio-card";
import { Row } from "@/components/row";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { TakesFocus } from "@/components/takes-focus";
import { TextField } from "@/components/text-field";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { BackToMenu } from "@/navigation/back-to-menu";
import { controlOutline, radii, sizes, spacing } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";
/** A browser has no system version worth keeping. */
const osVersion = platform === "web" ? "" : String(Platform.Version);

/**
 * Send feedback (spec 12, 3.3 and screen 3): what kind, a message and, on
 * phones, a picture of the screen the person came from, which they see
 * before sending and can remove. The app's version, the platform, the
 * screen's name and the language go with it, and nothing else (R12.5).
 * The title is at the left with what to write under it; once sent, the
 * head says thanks, with Done as the one main button and My feedback as a
 * row (spec 31, 3.19).
 */
export default function FeedbackScreen() {
  const me = useMe();
  const [sent, setSent] = useState(false);
  if (me === null) return <BackToMenu />;
  return sent ? (
    <Thanks />
  ) : (
    <FeedbackForm
      onSent={() => {
        setSent(true);
      }}
    />
  );
}

function FeedbackForm({ onSent }: { readonly onSent: () => void }) {
  const { t } = useLanguage();
  const session = useSession();
  const palette = usePalette();
  const [start] = useState(takeFeedbackStart);
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState(start.screenshot);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  async function send() {
    if (sending.current) return;
    setNotice(null);
    if (kind === null) {
      setNotice(t("feedback.chooseKind"));
      return;
    }
    const checked = checkFeedback({
      kind,
      message,
      appVersion: thisDevice().appVersion ?? "unknown",
      platform,
      osVersion,
      screen: start.screen,
    });
    if (!checked.ok) {
      if (checked.error.code === "message_missing") setFieldError(t("feedback.messageMissing"));
      else if (checked.error.code === "message_too_long") {
        setFieldError(t("feedback.messageTooLong"));
      } else setNotice(t("error.generic"));
      return;
    }
    sending.current = true;
    setBusy(true);
    const result = await session.call(sendFeedbackRoute, {
      body: { ...checked.value, ...(screenshot === null ? {} : { screenshot }) },
    });
    sending.current = false;
    setBusy(false);
    if (result.ok) {
      onSent();
      return;
    }
    const { code, retryAfterSeconds = 0, details } = result.error;
    if (code === "rate_limited") {
      setNotice(t("feedback.tooMany", { wait: formatWait(t, retryAfterSeconds) }));
    } else if (details?.some((detail) => detail.path === "screenshot") === true) {
      // The picture is what the API would not take: the message can go without it.
      setScreenshot(null);
      setNotice(t("feedback.screenshotRefused"));
    } else setNotice(errorText(t, result));
  }

  const title = t("feedback.kind");
  return (
    <Screen
      footer={
        <Button
          main
          label={t("feedback.send")}
          busy={busy}
          onPress={() => {
            void send();
          }}
        />
      }
    >
      <ScreenHead title={t("feedback.title")} line={t("feedback.intro")} back="/profile" />
      <View accessibilityRole="radiogroup" accessibilityLabel={title} style={styles.group}>
        {feedbackKinds.map((each) => (
          <RadioCard
            key={each}
            title={t(`feedback.kind.${each}`)}
            selected={kind === each}
            onSelect={() => {
              setNotice(null);
              setKind(each);
            }}
          />
        ))}
      </View>
      <TextField
        label={t("feedback.message")}
        value={message}
        onChangeText={(value) => {
          setMessage(value);
          setFieldError(undefined);
        }}
        multiline
        maxLength={feedbackRules.messageMaxLength * 2}
        help={t("feedback.messageHelp")}
        error={fieldError}
      />
      {screenshot === null ? null : (
        <View style={styles.group}>
          <Image
            accessibilityLabel={t("feedback.screenshotLabel")}
            source={{ uri: `data:image/jpeg;base64,${screenshot}` }}
            resizeMode="contain"
            style={[styles.screenshot, { borderColor: palette.control }]}
          />
          <Body align="start">{t("feedback.screenshotCheck")}</Body>
          <Button
            variant="secondary"
            label={t("feedback.removeScreenshot")}
            onPress={() => {
              setScreenshot(null);
            }}
          />
        </View>
      )}
      <Body align="start">{t("feedback.sentWith")}</Body>
      {notice === null ? null : (
        <TakesFocus key={notice}>
          <Notice message={notice} />
        </TakesFocus>
      )}
    </Screen>
  );
}

function Thanks() {
  const { t } = useLanguage();
  return (
    <Screen
      footer={
        <Button
          main
          label={t("feedback.done")}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/profile");
          }}
        />
      }
    >
      {/* The button pressed is gone: focus moves to what it did. */}
      <ScreenHead
        title={t("feedback.title")}
        line={t("feedback.thanks")}
        back={null}
        outcome={{ of: "sent", focus: true }}
      />
      <ActionRows>
        <Row
          icon={Inbox}
          title={t("feedback.mine")}
          onPress={() => {
            router.replace("/settings/feedback");
          }}
        />
      </ActionRows>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm, marginTop: spacing.md },
  screenshot: {
    alignSelf: "flex-start",
    width: sizes.screenshotWidth,
    height: sizes.screenshotHeight,
    borderWidth: controlOutline,
    borderRadius: radii.card,
  },
});
