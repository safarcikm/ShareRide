import { myConversationsRoute } from "@shareride/contracts";
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

interface Unread {
  /** Messages not yet read, across my conversations: the Messages badge. */
  readonly total: number;
  /** Asks the server again, as when a push arrives or a chat was read. */
  readonly refresh: () => void;
  /** The total from an answer already in hand, such as the conversations list's. */
  readonly show: (total: number) => void;
}

const UnreadContext = createContext<Unread>({
  total: 0,
  refresh: () => undefined,
  show: () => undefined,
});

/**
 * The unread total for the Messages badge (spec 7, 3.1, item 9; plan 4.3).
 * Fetched once signed in, when the app comes to the front, when a push
 * arrives, and on the web every minute while the page is on show. Nothing
 * when signed out.
 */
export function UnreadProvider({ children }: { readonly children: ReactNode }) {
  const state = useSessionState();
  const session = useSession();
  const userId = state.status === "signedIn" ? state.me.id : null;
  // Kept with whose it is, so an answer for someone who has signed out
  // since never shows.
  const [known, setKnown] = useState<{ userId: string; total: number } | null>(null);
  const total = known !== null && known.userId === userId ? known.total : 0;

  const show = useCallback(
    (count: number) => {
      if (userId !== null) setKnown({ userId, total: count });
    },
    [userId],
  );
  const refresh = useCallback(() => {
    if (userId === null) return;
    session
      .call(myConversationsRoute, {})
      .then((answer) => {
        // A failed answer keeps the count shown; the next refresh tries again.
        if (answer.ok) setKnown({ userId, total: answer.data.unread });
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

  const value = useMemo(() => ({ total, refresh, show }), [total, refresh, show]);
  return <UnreadContext value={value}>{children}</UnreadContext>;
}

export function useUnread(): Unread {
  return useContext(UnreadContext);
}
