import { myConversationsRoute, type Conversation } from "@shareride/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import { useSession, useSessionState } from "@/auth/session";
import { reportError } from "@/lib/error-reporting";

/** How often the web app asks again while its page is on show. */
const webEveryMs = 60_000;

/** My conversations as the server last answered: the list and the unread total. */
interface Answered {
  readonly unread: number;
  readonly conversations: readonly Conversation[];
}

interface Unread {
  /** Messages not yet read, across my conversations: the Messages badge. */
  readonly total: number;
  /**
   * My conversations as last answered, or null before the first answer.
   * The list shows them at once where it opens, such as beside a
   * conversation on a wide screen, and follows each later answer.
   */
  readonly conversations: readonly Conversation[] | null;
  /** Asks the server again, as when a push arrives or a chat was read. */
  readonly refresh: () => void;
  /** An answer already in hand, such as the conversations list's own. */
  readonly show: (answer: Answered) => void;
}

const UnreadContext = createContext<Unread>({
  total: 0,
  conversations: null,
  refresh: () => undefined,
  show: () => undefined,
});

/**
 * The unread total for the Messages badge (spec 7, 3.1, item 9; plan 4.3),
 * with the conversations the same answer lists. Fetched once signed in,
 * when the app comes to the front, when a push arrives, and on the web
 * every minute while the page is on show. Nothing when signed out.
 */
export function UnreadProvider({ children }: { readonly children: ReactNode }) {
  const state = useSessionState();
  const session = useSession();
  const userId = state.status === "signedIn" ? state.me.id : null;
  // Kept with whose it is, so an answer for someone who has signed out
  // since never shows.
  const [known, setKnown] = useState<{ userId: string; answer: Answered } | null>(null);
  const mine = known !== null && known.userId === userId ? known.answer : null;
  const total = mine?.unread ?? 0;
  const conversations = mine?.conversations ?? null;

  const show = useCallback(
    (answer: Answered) => {
      if (userId !== null) setKnown({ userId, answer });
    },
    [userId],
  );
  const refresh = useCallback(() => {
    if (userId === null) return;
    session
      .call(myConversationsRoute, {})
      .then((answer) => {
        // A failed answer keeps the count shown; the next refresh tries again.
        if (answer.ok) setKnown({ userId, answer: answer.data });
      })
      .catch(reportError);
  }, [session, userId]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") refresh();
    });
    return () => {
      subscription.remove();
    };
  }, [refresh]);

  useEffect(() => {
    if (Platform.OS !== "web" || userId === null) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, webEveryMs);
    return () => {
      clearInterval(timer);
    };
  }, [refresh, userId]);

  const value = useMemo(
    () => ({ total, conversations, refresh, show }),
    [total, conversations, refresh, show],
  );
  return <UnreadContext value={value}>{children}</UnreadContext>;
}

export function useUnread(): Unread {
  return useContext(UnreadContext);
}
