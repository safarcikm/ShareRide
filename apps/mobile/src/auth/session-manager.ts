import type { ApiClient, CallFailure, CallInput, CallResult } from "@shareride/api-client";
import {
  getMeRoute,
  refreshRoute,
  signOutRoute,
  startPhoneSignInRoute,
  verifyPhoneCodeRoute,
  type Me,
  type RouteDefinition,
} from "@shareride/contracts";
import type { Locale } from "@shareride/i18n";

/** Where the refresh token lives: secure storage on phones; nothing on the web (cookie). */
export interface TokenStore {
  read(): Promise<string | null>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
}

export interface Device {
  readonly platform: "ios" | "android" | "web";
  readonly name?: string;
  readonly appVersion?: string;
}

export type SessionState =
  | { readonly status: "loading" }
  /** At start, the API could not be reached; `restore` tries again. */
  | { readonly status: "unreachable" }
  | { readonly status: "signedOut" }
  | { readonly status: "signedIn"; readonly me: Me };

export interface SessionManager {
  // Properties, not methods, so React can take them as they are (useSyncExternalStore).
  readonly state: () => SessionState;
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * At app start, and to try again after "unreachable": signs in again with
   * the stored refresh token or the web cookie.
   */
  restore(): Promise<void>;
  start(phoneNumber: string, locale: Locale): Promise<CallResult<typeof startPhoneSignInRoute>>;
  verify(
    phoneNumber: string,
    code: string,
    locale: Locale,
  ): Promise<CallResult<typeof verifyPhoneCodeRoute>>;
  /** A call as the signed-in person; refreshes the tokens once if they have expired. */
  call<R extends RouteDefinition>(route: R, input: CallInput<R>): Promise<CallResult<R>>;
  me(): Promise<CallResult<typeof getMeRoute>>;
  /** After a change to the account, such as a saved profile. */
  update(me: Me): void;
  /**
   * Forgets the tokens once the API confirms. On a phone, signing out of this
   * device forgets them even when the API cannot be reached, since deleting
   * the stored token is enough there. On the web only the API can delete the
   * cookie, and "all devices" must reach the API to mean anything, so those
   * stay signed in on failure and the person can try again.
   */
  signOut(options: { readonly all: boolean }): Promise<CallResult<typeof signOutRoute>>;
}

/**
 * Signs in and keeps the person signed in (ADR 0016). The access token stays
 * in memory; the refresh token is in the token store on phones and in an
 * HTTP-only cookie on the web. Only one refresh runs at a time, because each
 * refresh retires the token before it.
 */
/** How a refresh went: new tokens, the session is over, or no answer to go on. */
type RefreshOutcome =
  | { readonly outcome: "refreshed" }
  | { readonly outcome: "ended" }
  | { readonly outcome: "failed"; readonly failure: CallFailure };

export function createSessionManager(options: {
  readonly client: ApiClient;
  readonly tokenStore: TokenStore;
  readonly device: Device;
}): SessionManager {
  const { client, tokenStore, device } = options;
  const web = device.platform === "web";
  let current: SessionState = { status: "loading" };
  let accessToken: string | undefined;
  let refreshing: Promise<RefreshOutcome> | null = null;
  const listeners = new Set<() => void>();

  function set(next: SessionState): void {
    current = next;
    for (const listener of listeners) listener();
  }

  async function keep(tokens: { accessToken: string; refreshToken?: string | undefined }) {
    accessToken = tokens.accessToken;
    if (tokens.refreshToken === undefined) return;
    try {
      await tokenStore.write(tokens.refreshToken);
    } catch {
      // Still signed in for now; the next app start asks to sign in again.
    }
  }

  async function forget(): Promise<void> {
    accessToken = undefined;
    try {
      await tokenStore.clear();
    } catch {
      // Nothing more to do: the session is over on the API's side or ours.
    }
    set({ status: "signedOut" });
  }

  async function refreshNow(): Promise<RefreshOutcome> {
    const stored = await tokenStore.read();
    if (!web && stored === null) return { outcome: "ended" };
    const result = await client.call(refreshRoute, {
      body: stored === null ? {} : { refreshToken: stored },
    });
    if (result.ok) {
      await keep(result.data);
      return { outcome: "refreshed" };
    }
    // Only a refusal ends the session. Anything else (no network, a server
    // error, a limit) keeps the refresh token to try again later.
    if (result.status === 401) return { outcome: "ended" };
    return { outcome: "failed", failure: result };
  }

  function refresh(): Promise<RefreshOutcome> {
    refreshing ??= refreshNow().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function call<R extends RouteDefinition>(
    route: R,
    input: CallInput<R>,
  ): Promise<CallResult<R>> {
    const used = accessToken;
    const result = await client.call(route, { ...input, accessToken: used });
    if (result.ok || result.status !== 401 || result.error.code !== "unauthenticated") {
      return result;
    }
    // Another call may have refreshed already while this one was waiting.
    if (accessToken === used) {
      const refreshed = await refresh();
      if (refreshed.outcome === "failed") return refreshed.failure;
      if (refreshed.outcome === "ended") {
        if (current.status === "signedIn") await forget();
        return result;
      }
    }
    return client.call(route, { ...input, accessToken });
  }

  return {
    state: () => current,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async restore() {
      set({ status: "loading" });
      const refreshed = await refresh();
      if (refreshed.outcome === "ended") {
        await forget();
        return;
      }
      const me = refreshed.outcome === "refreshed" ? await call(getMeRoute, {}) : null;
      if (me?.ok === true) set({ status: "signedIn", me: me.data });
      else if (current.status === "loading") set({ status: "unreachable" });
    },

    start: (phoneNumber, locale) =>
      client.call(startPhoneSignInRoute, { body: { phoneNumber, locale } }),

    async verify(phoneNumber, code, locale) {
      const result = await client.call(verifyPhoneCodeRoute, {
        body: { phoneNumber, code, locale, device },
      });
      if (result.ok) {
        await keep(result.data);
        set({ status: "signedIn", me: result.data.user });
      }
      return result;
    },

    call,

    me: () => call(getMeRoute, {}),

    update(me) {
      set({ status: "signedIn", me });
    },

    async signOut({ all }) {
      const result = await call(signOutRoute, { body: { all } });
      if (result.ok || (!all && !web)) await forget();
      return result;
    },
  };
}
