import { capitalised, formatDay } from "@shareride/i18n";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { errorText } from "@/auth/errors";
import { useMe } from "@/auth/session";
import { Announcer } from "@/components/announcer";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { PageColumn } from "@/components/columns";
import { Notice } from "@/components/notice";
import { Screen, useWideScreen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { Composer } from "@/chat/composer";
import { ConversationList, useConversations } from "@/chat/conversation-list";
import { MessageList } from "@/chat/message-list";
import { Pane, Panes } from "@/chat/panes";
import { otherPerson } from "@/chat/texts";
import { useUnread } from "@/chat/unread";
import { useConversation } from "@/chat/use-conversation";
import { useLanguage } from "@/i18n/language";
import { firstNameOf } from "@/people/texts";
import { suspensionNow } from "@/safety/suspended-account";
import { halfMinWidth, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * A booking's conversation (spec 7, 3.1, screen 2): the safety tip, the
 * message sent with the request, then the messages, with quick messages and
 * the field at the bottom. Once closed, or once one of the two blocked the
 * other, it can only be read (R7.1, R9.4). "Block" sits by the name.
 *
 * On a wide screen it is the right pane of Messages, with my conversations
 * beside it (spec 18, 3.11), wherever it was opened from. Another row of
 * the list shows its conversation in the same place.
 */
export default function ConversationScreen() {
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
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const wide = useWideScreen();
  const chat = useConversation(bookingId);
  const draft = useState("");
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

  const back = <BackButton fallback="/messages" />;
  if (loaded === undefined) {
    const loading = (
      <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
    );
    return wide ? (
      <Pane header={<View style={styles.who}>{back}</View>}>{loading}</Pane>
    ) : (
      <Screen>
        {back}
        {loading}
      </Screen>
    );
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
      <Pane header={<View style={styles.who}>{back}</View>}>
        <PageColumn>
          {notice}
          {retry}
        </PageColumn>
      </Pane>
    ) : (
      <Screen>
        {back}
        {notice}
        {retry}
      </Screen>
    );
  }

  const { conversation, messages, hasEarlier } = shown;
  const { booking } = conversation;
  const { board, alight } = booking;
  const name = firstNameOf(t, otherPerson(booking));
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

  const who = (
    <View style={styles.fill}>
      <Title align="start" part={wide}>
        {name}
      </Title>
      <Text style={[typography.small, { color: palette.textMuted }]}>{`${day} · ${route}`}</Text>
    </View>
  );
  // Reporting and blocking ask first, on their own screens (spec 9, 3.1 and 3.2).
  const report = (
    <Button
      variant="text"
      label={t("report.person", { name })}
      onPress={() => {
        // No name in the address: the report screen reads it from the booking.
        router.push({ pathname: "/report", params: { kind: "user", id: booking.id } });
      }}
    />
  );
  const block = conversation.blockedByMe ? null : (
    <Button
      variant="text"
      label={t("block.action", { name })}
      onPress={() => {
        router.push({ pathname: "/bookings/[id]/block", params: { id: booking.id } });
      }}
    />
  );
  const footer =
    // Reading stays open to a suspended person; sending does not (spec 9, 3.6.2).
    conversation.canWrite && suspended ? (
      <Notice kind="info" urgent={false} message={t("error.account_suspended")} />
    ) : conversation.canWrite ? (
      <>
        {chat.tooFast ? <Notice message={t("chat.tooFast")} /> : null}
        <Composer
          draft={draft}
          onSend={(outgoing) => {
            chat.send(outgoing);
            return true;
          }}
        />
      </>
    ) : (
      <Notice kind="info" urgent={false} message={t("chat.closed")} />
    );
  const reading = (
    <>
      {conversation.blockedByMe ? (
        <Body align="start">{t("block.youBlocked", { name })}</Body>
      ) : null}
      <Notice
        kind="info"
        urgent={false}
        message={t(booking.payment === "in_person" ? "chat.safetyTipInPerson" : "chat.safetyTip")}
      />
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
        <Pane
          endKey={mine}
          footer={footer}
          header={
            // Where the pane has no room for both, Report and Block go under the name.
            <View style={styles.paneHeader}>
              <View style={styles.who}>
                {back}
                {who}
              </View>
              <View style={styles.paneActions}>
                {report}
                {block}
              </View>
            </View>
          }
        >
          {reading}
        </Pane>
      ) : (
        <Screen stickToEnd endKey={mine} footer={footer}>
          {back}
          <View style={styles.header}>
            {who}
            <View style={styles.actions}>
              {report}
              {block}
            </View>
          </View>
          {reading}
        </Screen>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  actions: { alignItems: "flex-end" },
  paneHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: spacing.md,
    rowGap: spacing.sm,
  },
  who: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: halfMinWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.ms,
  },
  paneActions: { flexDirection: "row", flexWrap: "wrap", marginLeft: "auto", gap: spacing.sm },
});
