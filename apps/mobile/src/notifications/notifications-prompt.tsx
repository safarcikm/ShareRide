import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSessionState } from "@/auth/session";
import { Announcer } from "@/components/announcer";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { reportError } from "@/lib/error-reporting";
import { spacing } from "@/theme/tokens";
import { markAnswered, wasAnswered } from "./prompt-occasions";
import { pushState, turnOnPush, type PushState } from "./push-permission";

/**
 * The prompt to turn on notifications or add an email (spec 7, 3.6.2), for
 * the finish screens after booking, posting a trip or being accepted. It
 * shows only to someone with no verified email and no signed-in phone
 * that gets push. On a phone that can still ask, "Turn on notifications"
 * asks the phone's question; elsewhere, as on the web or once the phone
 * was told no, only "Add an email". Each occasion (such as `booked:<id>`)
 * is asked until answered, then not again; "Not now" is an answer.
 */
export function NotificationsPrompt({ occasion }: { readonly occasion: string }) {
  const { t } = useLanguage();
  const state = useSessionState();
  const me = state.status === "signedIn" ? state.me : null;
  const wanted = me !== null && me.email === null && !me.pushOn;
  const [push, setPush] = useState<PushState | null>(null);
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  // Set at once, so a second quick tap does not ask the phone again.
  const askingNow = useRef(false);
  const [said, setSaid] = useState<{ text: string; count: number } | null>(null);
  const channelName = t("notify.channel");

  useEffect(() => {
    if (!wanted) return;
    const still = { here: true };
    Promise.all([pushState(), wasAnswered(occasion)])
      .then(([found, answered]) => {
        if (!still.here) return;
        setPush(found);
        setOpen(found !== "on" && !answered);
      })
      .catch(reportError);
    return () => {
      still.here = false;
    };
  }, [wanted, occasion]);

  if (!wanted || !open || push === null) return null;

  const close = () => {
    setOpen(false);
    void markAnswered(occasion);
  };
  const turnOn = async () => {
    if (askingNow.current) return;
    askingNow.current = true;
    setAsking(true);
    try {
      if (await turnOnPush(channelName)) {
        close();
        return;
      }
      // Told no: an email is the way left, and the sentence says so.
      setPush(await pushState());
      setSaid((before) => ({ text: t("notifications.addEmail"), count: (before?.count ?? 0) + 1 }));
    } catch (error) {
      reportError(error);
    } finally {
      askingNow.current = false;
      setAsking(false);
    }
  };

  const askable = push === "askable";
  return (
    <Card>
      <View style={styles.inside}>
        <Body align="start">
          {askable ? t("notifications.turnOn") : t("notifications.addEmail")}
        </Body>
        {askable ? (
          <Button
            label={t("notifications.turnOnAction")}
            busy={asking}
            onPress={() => {
              void turnOn();
            }}
          />
        ) : null}
        <Button
          variant={askable ? "secondary" : "primary"}
          label={t("notifications.addEmailAction")}
          onPress={() => {
            close();
            router.push("/settings/email");
          }}
        />
        <Button variant="text" label={t("notifications.notNow")} onPress={close} />
        <Announcer message={said} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  inside: { gap: spacing.sm },
});
