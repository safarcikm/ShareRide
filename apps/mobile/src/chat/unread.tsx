import { myConversationsRoute, type Conversation } from "@shareride/contracts";
import type { CallResult } from "@shareride/api-client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

type ConversationsAnswer = CallResult<typeof myConversationsRoute>;

interface Unread {
  /** Messages not yet read, across my conversations: the Messages badge. */
  readonly total: number;
  /**
   * My conversations as last answered, or null before the first answer.
   * A list beside an open conversation shows them at once and follows
   * each later answer (spec 18, 3.11).
   */
  readonly conversations: readonly Conversation[] | null;
  /** Asks the server again, as when a push arrives or a chat was read. */
  readonly refresh: () => void;
  /**
   * Asks the server, keeps the answer as `refresh` does, and returns it:
   * for the conversations list, which shows why when it could not be
   * loaded.
   */
  readonly load: () => Promise<ConversationsAnswer>;
}

const UnreadContext = createContext<Unread>({
  total: 0,
  conversations: null,
  refresh: () => undefined,
  load: () => {
    throw new Error("The conversations list needs an UnreadProvider above it.");
  },
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

  // Answers come back in any order: one asked for before the answer now
  // shown is older than it, and is not kept.
  const asked = useRef(0);
  const kept = useRef(0);
  const load = useCallback(async () => {
    asked.current += 1;
    const turn = asked.current;
    const answer = await session.call(myConversationsRoute, {});
    // A failed answer keeps what is shown; the next one tries again.
    if (answer.ok && userId !== null && turn > kept.current) {
      kept.current = turn;
      setKnown({ userId, answer: answer.data });
    }
    return answer;
  }, [session, userId]);
  const refresh = useCallback(() => {
    if (userId !== null) load().catch(reportError);
  }, [load, userId]);

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
    () => ({ total, conversations, refresh, load }),
    [total, conversations, refresh, load],
  );
  return <UnreadContext value={value}>{children}</UnreadContext>;
}

export function useUnread(): Unread {
  return useContext(UnreadContext);
}
