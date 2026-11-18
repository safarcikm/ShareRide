import type { CallFailure } from "@shareride/api-client";
import type { Conversation } from "@shareride/contracts";
import { capitalised, formatDay } from "@shareride/i18n";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Tag } from "@/components/tag";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoadedOnFocus } from "@/lib/use-loaded";
import { firstNameOf } from "@/people/texts";
import { useHover } from "@/theme/hover";
import { controlOutline, edges, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { otherPerson, previewText } from "./texts";
import { useUnread } from "./unread";

/** My conversations for a list: what to show, or why there is nothing. */
export interface Conversations {
  /** The latest first. Null while the first answer is on its way, and after a failure. */
  readonly rows: readonly Conversation[] | null;
  /** The answer that failed, when there is nothing to show, until `reload`. */
  readonly failed: CallFailure | null;
  readonly reload: () => void;
}

/**
 * My conversations (spec 7, 3.1, item 9), loaded again each time the screen
 * comes into view, with the badge set from the same answer.
 *
 * A list that `follows`, as the one beside a conversation on a wide screen
 * does (spec 18, 3.11), shows what the badge last fetched at once, and each
 * later answer too, such as the one asked for once the open conversation
 * was read. It says the conversations could not be loaded only when it has
 * none to show: like the badge, it keeps what it knows and tries again.
 * Without `follows`, as on a phone, the list shows its own answer only.
 */
export function useConversations(follows: boolean): Conversations {
  const { conversations, load } = useUnread();
  const { value: answer, reload } = useLoadedOnFocus(load);
  const own = answer?.ok === true ? answer.data.conversations : null;
  const rows = follows ? (conversations ?? own) : own;
  const failed = rows === null && answer !== undefined && !answer.ok ? answer : null;
  return { rows, failed, reload };
}

/**
 * The list of my conversations: one row per confirmed booking with the
 * other person, the trip day and part, the last message and the unread
 * count. On a phone each row is a card that opens the conversation. In a
 * pane beside the conversation (`pane`, spec 18, 3.11) the rows fill the
 * pane, the row of `openId` is the current one, tinted and with a `primary`
 * edge at its left, and another row shows its conversation in the same
 * place: the address changes, and Back still leaves to where the person
 * came from.
 */
export function ConversationList({
  state,
  pane = false,
  openId,
}: {
  readonly state: Conversations;
  readonly pane?: boolean;
  readonly openId?: string;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const { rows, failed, reload } = state;
  if (failed !== null) {
    return (
      <Aside pane={pane}>
        <Notice
          message={failed.error.code === "network_error" ? errorText(t, failed) : t("chat.failed")}
        />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </Aside>
    );
  }
  if (rows === null) {
    return (
      <Aside pane={pane}>
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Aside>
    );
  }
  if (rows.length === 0) {
    return (
      <Aside pane={pane}>
        <Body align={pane ? "start" : "center"}>{t("chat.empty")}</Body>
      </Aside>
    );
  }
  return rows.map((conversation) => (
    <ConversationRow
      key={conversation.booking.id}
      conversation={conversation}
      pane={pane}
      openId={openId}
    />
  ));
}

/** What stands in the list's place: in a pane it keeps the rows' padding. */
function Aside({ pane, children }: { readonly pane: boolean; readonly children: ReactNode }) {
  if (!pane) return children;
  return <View style={styles.aside}>{children}</View>;
}

function ConversationRow({
  conversation,
  pane,
  openId,
}: {
  readonly conversation: Conversation;
  readonly pane: boolean;
  readonly openId: string | undefined;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const [hovered, hover] = useHover();
  const { booking, lastMessage, unread } = conversation;
  const other = otherPerson(booking);
  const day = capitalised(formatDay(new Date(booking.board.plannedAt), locale), locale);
  const names = {
    from: booking.board.meetingPoint.name[locale],
    to: booking.alight.meetingPoint.name[locale],
  };
  const preview =
    lastMessage === null ? null : previewText(t, locale, lastMessage, firstNameOf(t, other));
  const unreadText = unread === 0 ? null : t("chat.unread", { count: unread });
  const label = [firstNameOf(t, other), day, t("trip.stretchSpoken", names), preview, unreadText]
    .filter((part) => part !== null)
    .join(", ");
  const current = openId === booking.id;
  const open = () => {
    if (current) return;
    // Beside an open conversation, the other one takes its place, so Back
    // leaves the conversations and does not walk through each one read.
    if (openId !== undefined) router.setParams({ bookingId: booking.id });
    else router.push({ pathname: "/messages/[bookingId]", params: { bookingId: booking.id } });
  };
  const content = (
    <>
      <View style={styles.row}>
        <Avatar firstName={firstNameOf(t, other)} colour={other.colour} />
        <View style={styles.grow}>
          <Text style={[typography.bodyStrong, { color: palette.text }]}>
            {firstNameOf(t, other)}
          </Text>
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
    </>
  );
  if (!pane) {
    return (
      <Card accessibilityLabel={label} onPress={open}>
        {content}
      </Card>
    );
  }
  return (
    <Pressable
      testID="conversation-row"
      accessibilityRole="button"
      accessibilityLabel={label}
      // aria-current on the web, which drops accessibilityState.
      {...(Platform.OS === "web"
        ? { "aria-current": current ? ("true" as const) : undefined }
        : { accessibilityState: { selected: current } })}
      onPress={open}
      {...hover}
      style={({ pressed }) => [
        styles.paneRow,
        // The edge says which one is open where the tint alone would not,
        // as under the pointer every row has the tint.
        {
          borderBottomColor: palette.border,
          borderLeftColor: current ? palette.primary : "transparent",
        },
        current || hovered || pressed ? { backgroundColor: palette.primarySoft } : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  grow: { flex: 1 },
  aside: { padding: spacing.md, gap: spacing.md },
  // Every row keeps the room of the current one's edge, so none moves.
  paneRow: {
    padding: spacing.md,
    paddingLeft: spacing.md - edges.card,
    gap: spacing.ms,
    borderBottomWidth: controlOutline / 2,
    borderLeftWidth: edges.card,
  },
});
