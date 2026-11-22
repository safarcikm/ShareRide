import type { ApiClient, CallFailure, CallInput, CallResult } from "@shareride/api-client";
import {
  finishProviderSignInRoute,
  getMeRoute,
  refreshRoute,
  signOutRoute,
  startPhoneSignInRoute,
  verifyPhoneCodeRoute,
  type Me,
  type ProviderLink,
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

/**
 * What the last sign-in told the screens after it (spec 19, 3.3): a Google or
 * Apple account linked, swapped or refused, for a notice the person closes,
 * and a new account's first name from Google or Apple, which step 3 fills
 * in. Never stored: it goes when the app closes or the person signs out.
 */
export interface SignInNews {
  /** Linked, replaced or in use; null once closed, or when there is nothing to say. */
  readonly providerLink: ProviderLink | null;
  readonly suggestedFirstName: string | null;
}

/** The outcomes of a waiting Google or Apple sign-in that the person is told about. */
const toldOutcomes: ReadonlySet<ProviderLink["outcome"]> = new Set([
  "linked",
  "replaced",
  "in_use",
]);

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
    /** For a new account while the beta is closed; a member's is ignored. */
    inviteCode?: string,
    /**
     * A Google or Apple sign-in waiting for this phone step, as the finish
     * answer gave it (spec 19, 3.3); never from an address or a link.
     */
    pendingSignIn?: string,
  ): Promise<CallResult<typeof verifyPhoneCodeRoute>>;
  /**
   * Trades the ticket of a Google or Apple window, with the secret its start
   * was made from, for a session; or answers that the phone step comes
   * first, signed out still (spec 19, 3.2; ADR 0034).
   */
  finishProviderSignIn(
    ticket: string,
    verifier: string,
  ): Promise<CallResult<typeof finishProviderSignInRoute>>;
  /** What the last sign-in said; null when nothing. Changes call the listeners. */
  readonly signInNews: () => SignInNews | null;
  /** The person closed the notice about their Google or Apple account. */
  dismissProviderLink(): void;
  /** A call as the signed-in person; refreshes the tokens once if they have expired. */
  call<R extends RouteDefinition>(route: R, input: CallInput<R>): Promise<CallResult<R>>;
  me(): Promise<CallResult<typeof getMeRoute>>;
  /** After a change to the account, such as a saved profile. */
  update(me: Me): void;
  /**
   * Reads the account again while signed in, keeping the last copy if the
   * API cannot be reached: when the app comes back into view, and after a
   * refusal that says the account changed, such as a suspension (spec 9,
   * 3.6.2).
   */
  reloadMe(): Promise<void>;
  /**
   * Forgets the tokens once the API confirms. On a phone, signing out of this
   * device forgets them even when the API cannot be reached, since deleting
   * the stored token is enough there. On the web only the API can delete the
   * cookie, and "all devices" must reach the API to mean anything, so those
   * stay signed in on failure and the person can try again.
   */
  signOut(options: { readonly all: boolean }): Promise<CallResult<typeof signOutRoute>>;
  /**
   * After the API ended this session itself, as deleting the account ends
   * every session (spec 11, 3.4.3): forgets the tokens without a call.
   */
  ended(): Promise<void>;
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
  let news: SignInNews | null = null;
  const listeners = new Set<() => void>();

  function tell(): void {
    for (const listener of listeners) listener();
  }

  function set(next: SessionState): void {
    current = next;
    tell();
  }

  /** Before the signed-in state, so the screens that open next find it. */
  function keepNews(signedIn: {
    readonly providerLink?: ProviderLink | undefined;
    readonly suggestedFirstName?: string | undefined;
  }): void {
    const link = signedIn.providerLink;
    const providerLink = link !== undefined && toldOutcomes.has(link.outcome) ? link : null;
    const suggestedFirstName = signedIn.suggestedFirstName ?? null;
    news =
      providerLink === null && suggestedFirstName === null
        ? null
        : { providerLink, suggestedFirstName };
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
    news = null;
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
    const result = await callOnce(route, input);
    // Suspended since the account was read: the screens follow (spec 9, 3.6.2).
    if (!result.ok && result.error.code === "account_suspended") void reloadMe();
    return result;
  }

  async function reloadMe(): Promise<void> {
    if (current.status !== "signedIn") return;
    const me = await callOnce(getMeRoute, {});
    // Read again: signing out may have happened while the answer was on its way.
    const now = stateNow();
    if (!me.ok || now.status !== "signedIn") return;
    if (JSON.stringify(me.data) === JSON.stringify(now.me)) return;
    set({ status: "signedIn", me: me.data });
  }

  function stateNow(): SessionState {
    return current;
  }

  async function callOnce<R extends RouteDefinition>(
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

    async verify(phoneNumber, code, locale, inviteCode, pendingSignIn) {
      const result = await client.call(verifyPhoneCodeRoute, {
        body: {
          phoneNumber,
          code,
          locale,
          device,
          ...(inviteCode === undefined || inviteCode === "" ? {} : { inviteCode }),
          ...(pendingSignIn === undefined ? {} : { pendingSignIn }),
        },
      });
      if (result.ok) {
        await keep(result.data);
        keepNews(result.data);
        set({ status: "signedIn", me: result.data.user });
      }
      return result;
    },

    async finishProviderSignIn(ticket, verifier) {
      const result = await client.call(finishProviderSignInRoute, {
        body: { ticket, verifier, device },
      });
      if (result.ok && result.data.status === "signedIn") {
        await keep(result.data);
        keepNews(result.data);
        set({ status: "signedIn", me: result.data.user });
      }
      return result;
    },

    signInNews: () => news,

    dismissProviderLink() {
      if (news === null || news.providerLink === null) return;
      news = news.suggestedFirstName === null ? null : { ...news, providerLink: null };
      tell();
    },

    call,

    me: () => call(getMeRoute, {}),

    update(me) {
      set({ status: "signedIn", me });
    },

    reloadMe,

    async signOut({ all }) {
      const result = await call(signOutRoute, { body: { all } });
      if (result.ok || (!all && !web)) await forget();
      return result;
    },

    ended: forget,
  };
}
