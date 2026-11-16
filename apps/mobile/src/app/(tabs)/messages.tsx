import { myConversationsRoute, type Conversation } from "@shareride/contracts";
import { capitalised, formatDay } from "@shareride/i18n";
import { router } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { Tag } from "@/components/tag";
import { Body, Title } from "@/components/text";
import { otherPerson, previewText } from "@/chat/texts";
import { useUnread } from "@/chat/unread";
import { useLanguage } from "@/i18n/language";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { SignInFirst } from "@/navigation/sign-in-first";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Messages, a place of the menu: my conversations (spec 7, 3.1, item 9,
 * screen 1). One row per confirmed booking, the latest message first, with
 * the other person, the trip day and part, the last message and the unread
 * count. It loads again each time it comes into view, and sets the badge
 * from the same answer. Signed out, it asks to sign in.
 */
export default function MessagesScreen() {
  const { t } = useLanguage();
  const me = useMe();
  if (me === null) return <SignInFirst title={t("nav.messagesSignedOut")} />;
  return <Conversations />;
}

function Conversations() {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const { show } = useUnread();
  const load = useCallback(
    () =>
      session.call(myConversationsRoute, {}).then((answer) => {
        if (answer.ok) show(answer.data.unread);
        return answer;
      }),
    [session, show],
  );
  const { value: answer, reload } = useLoadedOnFocus(load);

  return (
    <Screen>
      <Title>{t("chat.title")}</Title>
      {answer === undefined ? (
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      ) : !answer.ok ? (
        <>
          <Notice
            message={
              answer.error.code === "network_error" ? errorText(t, answer) : t("chat.failed")
            }
          />
          <Button variant="secondary" label={t("common.retry")} onPress={reload} />
        </>
      ) : answer.data.conversations.length === 0 ? (
        <Body>{t("chat.empty")}</Body>
      ) : (
        answer.data.conversations.map((conversation) => (
          <ConversationRow key={conversation.booking.id} conversation={conversation} />
        ))
      )}
    </Screen>
  );
}

function ConversationRow({ conversation }: { readonly conversation: Conversation }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const { booking, lastMessage, unread } = conversation;
  const other = otherPerson(booking);
  const day = capitalised(formatDay(new Date(booking.board.plannedAt), locale), locale);
  const names = {
    from: booking.board.meetingPoint.name[locale],
    to: booking.alight.meetingPoint.name[locale],
  };
  const preview = lastMessage === null ? null : previewText(t, lastMessage);
  const unreadText = unread === 0 ? null : t("chat.unread", { count: unread });
  const label = [other.firstName, day, t("trip.stretchSpoken", names), preview, unreadText]
    .filter((part) => part !== null)
    .join(", ");
  return (
    <Card
      accessibilityLabel={label}
      onPress={() => {
        router.push({ pathname: "/messages/[bookingId]", params: { bookingId: booking.id } });
      }}
    >
      <View style={styles.row}>
        <Avatar firstName={other.firstName} colour={other.colour} />
        <View style={styles.grow}>
          <Text style={[typography.bodyStrong, { color: palette.text }]}>{other.firstName}</Text>
          <Text style={[typography.small, { color: palette.textMuted }]}>
            {`${day} · ${t("search.route", names)}`}
          </Text>
        </View>
        {unreadText === null ? null : <Tag kind="info" label={unreadText} />}
      </View>
      {preview === null ? null : (
        <Text
          numberOfLines={2}
          style={[unread === 0 ? typography.body : typography.bodyStrong, { color: palette.text }]}
        >
          {preview}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  grow: { flex: 1 },
});
