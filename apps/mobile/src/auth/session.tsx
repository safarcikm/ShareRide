import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Me } from "@shareride/contracts";
import { createClient, thisDevice } from "./api";
import { createSessionManager, type SessionManager, type SessionState } from "./session-manager";
import { tokenStore } from "./token-store";

const SessionContext = createContext<SessionManager | null>(null);

/** Holds the signed-in session for the whole app and restores it at start. */
export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const [session] = useState(() =>
    createSessionManager({ client: createClient(), tokenStore, device: thisDevice() }),
  );
  useEffect(() => {
    void session.restore();
  }, [session]);
  return <SessionContext value={session}>{children}</SessionContext>;
}

export function useSession(): SessionManager {
  const session = useContext(SessionContext);
  if (session === null) throw new Error("useSession must be used inside SessionProvider");
  return session;
}

/** The session state, updated when it changes. */
export function useSessionState(): SessionState {
  const session = useSession();
  return useSyncExternalStore(session.subscribe, session.state, session.state);
}

/**
 * The signed-in person, for screens only signed-in people can open. Null
 * for the moment between signing out and the screen closing.
 */
export function useMe(): Me | null {
  const state = useSessionState();
  return state.status === "signedIn" ? state.me : null;
}
