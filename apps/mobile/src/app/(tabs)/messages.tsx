import { StyleSheet, View } from "react-native";
import { useMe } from "@/auth/session";
import { Screen, useWideScreen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { Body } from "@/components/text";
import { ConversationList, useConversations } from "@/chat/conversation-list";
import { Panes } from "@/chat/panes";
import { useLanguage } from "@/i18n/language";
import { SignInFirst } from "@/navigation/sign-in-first";
import { spacing } from "@/theme/tokens";

/**
 * Messages, a place of the menu: my conversations (spec 7, 3.1, item 9,
 * screen 1). One row per confirmed booking, the latest message first, with
 * the other person, the trip day and part, the last message and the unread
 * count. It loads again each time it comes into view, and sets the badge
 * from the same answer. On a phone its title is at the left, as a list's
 * is (spec 31, 3.17), and pulling down loads it again (spec 16, 3.9).
 * Signed out, it asks to sign in.
 *
 * On a wide screen the list is the left pane of a card, and the right pane
 * asks to choose a conversation (spec 18, 3.11). None opens by itself:
 * opening one tells the other person their messages were seen.
 */
export default function MessagesScreen() {
  const { t } = useLanguage();
  const me = useMe();
  if (me === null) return <SignInFirst title={t("nav.messagesSignedOut")} />;
  return <Conversations />;
}

function Conversations() {
  const { t } = useLanguage();
  const wide = useWideScreen();
  const state = useConversations(wide);
  if (wide) {
    // With nothing to choose from, the list's words have the whole card.
    const some = state.rows !== null && state.rows.length > 0;
    const loading = state.rows === null && state.failed === null;
    return (
      <Panes list={<ConversationList state={state} pane />}>
        {some || loading ? (
          <View style={styles.choose}>{some ? <Body>{t("chat.choose")}</Body> : null}</View>
        ) : undefined}
      </Panes>
    );
  }
  return (
    <Screen refresh={state.pull}>
      <ScreenHead title={t("chat.title")} back={null} />
      <ConversationList state={state} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  choose: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.md },
});
