import { capitalised, formatDay } from "@shareride/i18n";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { errorText } from "@/auth/errors";
import { Announcer } from "@/components/announcer";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Title } from "@/components/text";
import { Composer } from "@/chat/composer";
import { MessageList } from "@/chat/message-list";
import { otherPerson } from "@/chat/texts";
import { useConversation } from "@/chat/use-conversation";
import { useLanguage } from "@/i18n/language";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * A booking's conversation (spec 7, 3.1, screen 2): the safety tip, the
 * message sent with the request, then the messages, with quick messages and
 * the field at the bottom. Once closed it can only be read (R7.1).
 */
export default function ConversationScreen() {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const chat = useConversation(bookingId);
  const { loaded } = chat;

  if (loaded === undefined) {
    return (
      <Screen>
        <BackButton fallback="/messages" />
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  if (!("messages" in loaded)) {
    return (
      <Screen>
        <BackButton fallback="/messages" />
        <Notice
          message={
            loaded.error.code === "not_confirmed"
              ? t("chat.notOpenYet")
              : loaded.status === 404 || loaded.status === 400
                ? t("booking.notFound")
                : loaded.error.code === "network_error"
                  ? errorText(t, loaded)
                  : t("chat.failed")
          }
        />
        <Button variant="secondary" label={t("common.retry")} onPress={chat.reload} />
      </Screen>
    );
  }

  const { conversation, messages, hasEarlier } = loaded;
  const { booking } = conversation;
  const { board, alight } = booking;
  const route = t("search.route", {
    from: board.meetingPoint.name[locale],
    to: alight.meetingPoint.name[locale],
  });
  const day = capitalised(formatDay(new Date(board.plannedAt), locale), locale);
  // Each message I send, on its way or sent, brings the screen to its end.
  const mine =
    chat.pending.at(-1)?.clientId ??
    messages.findLast((message) => message.from === "me")?.clientId ??
    undefined;
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.fill}
    >
      <Screen
        stickToEnd
        endKey={mine}
        footer={
          conversation.canWrite ? (
            <>
              {chat.tooFast ? <Notice message={t("chat.tooFast")} /> : null}
              <Composer
                onSend={(outgoing) => {
                  chat.send(outgoing);
                  return true;
                }}
              />
            </>
          ) : (
            <Notice kind="info" urgent={false} message={t("chat.closed")} />
          )
        }
      >
        <BackButton fallback="/messages" />
        <View>
          <Title align="start">{otherPerson(booking).firstName}</Title>
          <Text style={[typography.small, { color: palette.textMuted }]}>
            {`${day} · ${route}`}
          </Text>
        </View>
        <Notice kind="info" urgent={false} message={t("chat.safetyTip")} />
        {hasEarlier ? (
          <Button
            variant="text"
            busy={chat.loadingEarlier}
            label={t("chat.earlier")}
            onPress={chat.showEarlier}
          />
        ) : null}
        <MessageList
          booking={booking}
          messages={messages}
          // A closed conversation takes no more messages.
          pending={conversation.canWrite ? chat.pending : []}
          onRetry={chat.retry}
        />
        <Announcer message={chat.announcement} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  gap: { gap: spacing.sm },
});
