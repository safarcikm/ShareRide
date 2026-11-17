import type { Booking, ChatMessage } from "@shareride/contracts";
import { inIceland } from "@shareride/domain";
import { capitalised, formatClock, formatDay } from "@shareride/i18n";
import { CircleAlert } from "lucide-react-native";
import { Fragment, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { useLanguage } from "@/i18n/language";
import { controlOutline, iconSizes, radii, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { lastSeenId, type Pending } from "./messages";
import { messageText, otherPerson, outgoingText, spokenMessage } from "./texts";
import { firstNameOf } from "@/people/texts";

const dayOf = (moment: string) => {
  const { year, month, day } = inIceland(new Date(moment));
  return `${String(year)}-${String(month)}-${String(day)}`;
};

/**
 * A conversation's messages, oldest first (spec 7, 3.1): the message sent
 * with the request at the top, a line for each new day, mine at the end
 * side, the other person's at the start and lines about the booking in the
 * middle. "Seen" shows under my last message the other person has read.
 * Messages on their way follow; one that failed is a button that sends it
 * again.
 */
export function MessageList({
  booking,
  messages,
  pending,
  onRetry,
}: {
  readonly booking: Booking;
  readonly messages: readonly ChatMessage[];
  readonly pending: readonly Pending[];
  readonly onRetry: (pending: Pending) => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const other = firstNameOf(t, otherPerson(booking));
  const seenId = lastSeenId(messages);
  const fromPassenger = booking.viewer === "passenger";
  return (
    <View style={styles.list}>
      {booking.message === "" ? null : (
        <View
          accessible
          accessibilityLabel={`${fromPassenger ? t("chat.you") : other}, ${t("chat.requestMessage")}: ${booking.message}`}
          style={[styles.item, fromPassenger ? styles.mine : styles.theirs]}
        >
          <Text style={[typography.caption, { color: palette.textMuted }]}>
            {t("chat.requestMessage")}
          </Text>
          <Bubble mine={fromPassenger}>{booking.message}</Bubble>
        </View>
      )}
      {messages.map((message, index) => {
        const newDay =
          index === 0 || dayOf(messages[index - 1]?.sentAt ?? "") !== dayOf(message.sentAt);
        return (
          <Fragment key={message.id}>
            {newDay ? (
              <Text style={[typography.caption, styles.centre, { color: palette.textMuted }]}>
                {capitalised(formatDay(new Date(message.sentAt), locale), locale)}
              </Text>
            ) : null}
            <Message message={message} other={other} seen={message.id === seenId} />
          </Fragment>
        );
      })}
      {pending.map((item) =>
        item.state === "sending" ? (
          <View
            key={item.clientId}
            accessible
            accessibilityLabel={`${t("chat.sending")}: ${outgoingText(t, item.outgoing)}`}
            style={[styles.item, styles.mine]}
          >
            <Bubble mine>{outgoingText(t, item.outgoing)}</Bubble>
            <Text style={[typography.caption, { color: palette.textMuted }]}>
              {t("chat.sending")}
            </Text>
          </View>
        ) : (
          <Pressable
            key={item.clientId}
            accessibilityRole="button"
            accessibilityLabel={`${t("chat.notSent")} ${outgoingText(t, item.outgoing)}`}
            onPress={() => {
              onRetry(item);
            }}
            style={[styles.item, styles.mine]}
          >
            <Bubble mine>{outgoingText(t, item.outgoing)}</Bubble>
            <View style={styles.failed}>
              <Icon icon={CircleAlert} color={palette.error} size={iconSizes.inline} />
              <Text style={[typography.caption, { color: palette.error }]}>
                {t("chat.notSent")}
              </Text>
            </View>
          </Pressable>
        ),
      )}
    </View>
  );
}

function Message({
  message,
  other,
  seen,
}: {
  readonly message: ChatMessage;
  readonly other: string;
  readonly seen: boolean;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  if (message.from === "system") {
    return (
      <Text style={[typography.small, styles.centre, { color: palette.textMuted }]}>
        {messageText(t, locale, message, other)}
      </Text>
    );
  }
  const mine = message.from === "me";
  const time = formatClock(new Date(message.sentAt));
  return (
    <View
      accessible
      accessibilityLabel={spokenMessage(t, locale, message, other, seen)}
      style={[styles.item, mine ? styles.mine : styles.theirs]}
    >
      <Bubble mine={mine}>{messageText(t, locale, message, other)}</Bubble>
      <Text style={[typography.caption, { color: palette.textMuted }]}>
        {seen ? `${time} · ${t("chat.seen")}` : time}
      </Text>
    </View>
  );
}

function Bubble({ mine, children }: { readonly mine: boolean; readonly children: ReactNode }) {
  const palette = usePalette();
  return (
    <View
      style={[
        styles.bubble,
        mine
          ? { backgroundColor: palette.primarySoft, borderColor: palette.primarySoft }
          : { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <Text selectable style={[typography.body, { color: palette.text }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.ms },
  item: { maxWidth: "85%", gap: spacing.xs },
  mine: { alignSelf: "flex-end", alignItems: "flex-end" },
  theirs: { alignSelf: "flex-start", alignItems: "flex-start" },
  centre: { textAlign: "center", alignSelf: "center" },
  bubble: {
    borderWidth: controlOutline,
    borderRadius: radii.control,
    paddingHorizontal: spacing.ms,
    paddingVertical: spacing.sm,
  },
  failed: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
});
