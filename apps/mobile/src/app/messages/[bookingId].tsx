import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { errorText } from "@/auth/errors";
import { useMe } from "@/auth/session";
import { Announcer } from "@/components/announcer";
import { avatarSize } from "@/components/avatar";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { PageColumn } from "@/components/columns";
import { Notice } from "@/components/notice";
import { Screen, useWideScreen } from "@/components/screen";
import { Body } from "@/components/text";
import { MessageField, QuickMessages } from "@/chat/composer";
import { ConversationHead } from "@/chat/conversation-head";
import { ConversationList, useConversations } from "@/chat/conversation-list";
import { MessageList } from "@/chat/message-list";
import type { Outgoing } from "@/chat/messages";
import { Pane, Panes } from "@/chat/panes";
import { SafetyLine } from "@/chat/safety-line";
import { otherPerson } from "@/chat/texts";
import { useUnread } from "@/chat/unread";
import { useConversation } from "@/chat/use-conversation";
import { useLanguage } from "@/i18n/language";
import { BackToMenu } from "@/navigation/back-to-menu";
import { firstNameOf } from "@/people/texts";
import { suspensionNow } from "@/safety/suspended-account";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * What the top of a conversation leaves of the window's height for the
 * messages, the quick messages and the bar, at the least, while it stays:
 * the two bars take about 150 of it. A top that leaves less, as with text
 * twice as large and long names, or on a phone on its side, is the first
 * thing in the conversation and scrolls with it.
 */
const roomUnderTop = 400;

/**
 * A booking's conversation (spec 7, 3.1, screen 2; spec 31, 3.13): its top,
 * which stays while the window has room for it, with who it is with, a
 * menu that holds Report and Block, and the ride as one line; then the
 * safety line, the message sent with the request and the messages; the
 * quick messages over the bar, and in the bar the field with Send. Once
 * closed, or once one of the two blocked the other, it can only be read
 * (R7.1, R9.4).
 *
 * On a wide screen it is the right pane of Messages, with my conversations
 * beside it (spec 18, 3.11), wherever it was opened from. Another row of
 * the list shows its conversation in the same place. Signed out, as from
 * an email's link, it goes back to the menu, which asks to sign in and
 * opens it after (spec 20, 3.2).
 */
export default function ConversationScreen() {
  const me = useMe();
  if (me === null) return <BackToMenu />;
  return <Conversation />;
}

function Conversation() {
  const { t } = useLanguage();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const wide = useWideScreen();
  // Another row of the list changes what is open and leaves the focus on
  // the row, so a screen reader is told whose conversation it now is. The
  // one the screen opened with needs no telling: its title says it.
  const [opened, setOpened] = useState({ id: bookingId, changed: false });
  if (opened.id !== bookingId) setOpened({ id: bookingId, changed: true });
  const [said, setSaid] = useState<{ text: string; count: number } | null>(null);
  const say = useCallback(
    (name: string) => {
      setSaid((last) => ({ text: t("chat.nowOpen", { name }), count: (last?.count ?? 0) + 1 }));
    },
    [t],
  );
  return (
    <Panes list={wide ? <Listed openId={bookingId} /> : null}>
      {/* Each conversation starts clean: nothing loaded or written goes along to another. */}
      <Open key={bookingId} bookingId={bookingId} onShown={opened.changed ? say : undefined} />
      <Announcer message={said} />
    </Panes>
  );
}

/** My conversations beside the open one. Only a wide screen asks for them. */
function Listed({ openId }: { readonly openId: string }) {
  return <ConversationList state={useConversations(true)} pane openId={openId} />;
}

/**
 * The conversation itself. What it loaded and what is being written live
 * here, above the layout, so they stay when the window turns narrow or wide
 * (spec 18, 3.2, item 7).
 */
function Open({
  bookingId,
  onShown,
}: {
  readonly bookingId: string;
  /** Called with the other person's name once the conversation shows. */
  readonly onShown: ((name: string) => void) | undefined;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const wide = useWideScreen();
  const chat = useConversation(bookingId);
  const draft = useState("");
  // How tall the top is with its menu closed; nothing until it is laid out.
  const [topHeight, setTopHeight] = useState(0);
  const topStays = useWindowDimensions().height - topHeight >= roomUnderTop;
  const suspended = suspensionNow(useMe()) !== null;
  const { refresh: refreshList } = useUnread();
  const { loaded } = chat;
  const shown = loaded !== undefined && "messages" in loaded ? loaded : null;

  // The list beside the conversation shows my newest message too: it is
  // asked for again once a message of mine was sent. The other person's
  // messages are read as they come, which asks for it already.
  const isShown = shown !== null;
  const newestMine = shown?.messages.findLast((message) => message.from === "me")?.id ?? null;
  const listedUpTo = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isShown) return;
    const before = listedUpTo.current;
    listedUpTo.current = newestMine;
    if (wide && before !== undefined && before !== newestMine) refreshList();
  }, [isShown, newestMine, wide, refreshList]);

  const shownName = shown === null ? null : firstNameOf(t, otherPerson(shown.conversation.booking));
  useEffect(() => {
    if (shownName !== null) onShown?.(shownName);
  }, [shownName, onShown]);

  // Until the conversation shows, its top has Back alone, in the same place.
  const back = (
    <View style={styles.back}>
      <BackButton quiet fallback="/messages" />
    </View>
  );
  if (loaded === undefined) {
    const loading = (
      <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
    );
    return wide ? <Pane header={back}>{loading}</Pane> : <Screen header={back}>{loading}</Screen>;
  }
  if (shown === null) {
    const failed = !("messages" in loaded) ? loaded : null;
    if (failed === null) return null;
    const notice = (
      <Notice
        message={
          failed.error.code === "not_confirmed"
            ? t("chat.notOpenYet")
            : failed.status === 404 || failed.status === 400
              ? t("booking.notFound")
              : failed.error.code === "network_error"
                ? errorText(t, failed)
                : t("chat.failed")
        }
      />
    );
    const retry = <Button variant="secondary" label={t("common.retry")} onPress={chat.reload} />;
    return wide ? (
      <Pane header={back}>
        <PageColumn>
          {notice}
          {retry}
        </PageColumn>
      </Pane>
    ) : (
      <Screen header={back}>
        {notice}
        {retry}
      </Screen>
    );
  }

  const { conversation, messages, hasEarlier } = shown;
  const { booking } = conversation;
  const name = firstNameOf(t, otherPerson(booking));
  // Each message I send, on its way or sent, brings the screen to its end.
  const mine =
    chat.pending.at(-1)?.clientId ??
    messages.findLast((message) => message.from === "me")?.clientId ??
    undefined;

  const head = <ConversationHead conversation={conversation} part={wide} onRest={setTopHeight} />;
  // Reading stays open to a suspended person; sending does not (spec 9, 3.6.2).
  const writes = conversation.canWrite && !suspended;
  const send = (outgoing: Outgoing) => {
    chat.send(outgoing);
    return true;
  };
  const footer = writes ? (
    <>
      {chat.tooFast ? <Notice message={t("chat.tooFast")} /> : null}
      <MessageField draft={draft} onSend={send} />
    </>
  ) : (
    <Notice
      kind="info"
      urgent={false}
      message={t(conversation.canWrite ? "error.account_suspended" : "chat.closed")}
    />
  );
  const quick = writes ? <QuickMessages onSend={send} /> : undefined;
  const reading = (
    <>
      {topStays ? null : <Card>{head}</Card>}
      <SafetyLine inPerson={booking.payment === "in_person"} />
      {conversation.blockedByMe ? (
        <Body align="start">{t("block.youBlocked", { name })}</Body>
      ) : null}
      {messages.some((message) => message.from === "them" && !message.removed) ? (
        <Text style={[typography.small, { color: palette.textMuted }]}>
          {t(Platform.OS === "web" ? "report.messageHintWeb" : "report.messageHint")}
        </Text>
      ) : null}
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
        onReport={(message) => {
          router.push({
            pathname: "/report",
            params: { kind: "message", id: message.id, booking: booking.id },
          });
        }}
      />
      <Announcer message={chat.announcement} />
    </>
  );
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.fill}
    >
      {wide ? (
        <Pane endKey={mine} header={topStays ? head : undefined} overFooter={quick} footer={footer}>
          {reading}
        </Pane>
      ) : (
        <Screen
          stickToEnd
          endKey={mine}
          header={topStays ? head : undefined}
          overFooter={quick}
          footer={footer}
        >
          {reading}
        </Screen>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // As high as the picture beside Back will be, so the top does not jump.
  back: { minHeight: avatarSize, justifyContent: "center" },
});
