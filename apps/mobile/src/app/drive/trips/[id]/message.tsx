import { messageAllPassengersRoute } from "@shareride/contracts";
import { useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Title } from "@/components/text";
import { newClientId } from "@/chat/client-id";
import { Composer } from "@/chat/composer";
import type { Outgoing } from "@/chat/messages";
import { useLanguage } from "@/i18n/language";

/**
 * Message all passengers (spec 7, 3.2, screen 3): one message, written or
 * quick, goes into each confirmed passenger's own conversation, so they
 * never see each other. A failed send keeps what was written and its
 * client ID, so sending it again never reaches anyone twice.
 */
export default function MessageAllScreen() {
  const { t } = useLanguage();
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [busy, setBusy] = useState(false);
  // What the last send did, with focus; each send counts, so the same words twice take focus.
  const [outcome, setOutcome] = useState<{
    text: string;
    kind: "error" | "info";
    count: number;
  } | null>(null);
  // The client ID of each message tried and not known to have gone, by its
  // content: one whose answer was lost may have reached everyone, so sent
  // again, even after something else, it keeps its ID and goes nowhere twice.
  const unsent = useRef(new Map<string, string>());

  const send = async (outgoing: Outgoing) => {
    const key = JSON.stringify(outgoing);
    const clientId = unsent.current.get(key) ?? newClientId();
    unsent.current.set(key, clientId);
    setBusy(true);
    const answer = await session.call(messageAllPassengersRoute, {
      params: { id },
      body: { clientId, ...outgoing },
    });
    setBusy(false);
    const say = (text: string, kind: "error" | "info") => {
      setOutcome((last) => ({ text, kind, count: (last?.count ?? 0) + 1 }));
    };
    if (!answer.ok) {
      say(
        answer.error.code === "too_many_messages" ? t("chat.tooFast") : errorText(t, answer),
        "error",
      );
      return false;
    }
    unsent.current.delete(key);
    say(
      answer.data.sent === 0
        ? t("chat.noPassengers")
        : t("chat.sentTo", { count: answer.data.sent }),
      "info",
    );
    return true;
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.fill}
    >
      <Screen footer={<Composer busy={busy} onSend={send} />}>
        <BackButton fallback={{ pathname: "/drive/trips/[id]", params: { id } }} />
        <Title>{t("chat.messageAll")}</Title>
        <Body>{t("chat.messageAllHelp")}</Body>
        {outcome === null ? null : (
          <TakesFocus key={outcome.count}>
            <Notice kind={outcome.kind} message={outcome.text} />
          </TakesFocus>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
