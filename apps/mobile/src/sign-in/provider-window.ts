import { providerStartPath } from "@shareride/contracts";
import type { SignInProvider } from "@shareride/domain";
import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytes,
} from "expo-crypto";
import { dismissAuthSession, openAuthSessionAsync } from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { apiBaseUrl } from "@/auth/api";
import { providerReturnUrl } from "./return-address";

// Google's or Apple's own sign-in page, in the phone's browser sheet or a
// pop-up on the web (spec 19, 3.2; ADR 0034). The window comes back to
// sign-in/return with a one-time ticket in the address's fragment; only
// this app, which holds the secret the start was made from, can trade it.

/** The names on the buttons and in the texts: the brands' own, in every language. */
export const providerNames: Readonly<Record<SignInProvider, string>> = {
  google: "Google",
  apple: "Apple",
};

/** One try: the secret this app keeps, and its SHA-256 that the start gets. */
export interface Attempt {
  readonly verifier: string;
  readonly challenge: string;
}

export type WindowOutcome =
  | { readonly kind: "ticket"; readonly ticket: string; readonly verifier: string }
  /** Closed, or "Cancel" on Google's or Apple's page: nothing to say. */
  | { readonly kind: "cancelled" }
  /** More than 10 minutes in the window: "That took too long". */
  | { readonly kind: "expired" }
  | { readonly kind: "failed" };

const base64url = /^[A-Za-z0-9_-]+$/;
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * A new secret of 43 characters (258 random bits; each byte picks one of
 * 64 characters, so every character is as likely) and its challenge.
 */
export async function makeAttempt(): Promise<Attempt> {
  const verifier = Array.from(getRandomBytes(43), (byte) => alphabet.charAt(byte % 64)).join("");
  const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: CryptoEncoding.BASE64,
  });
  const challenge = digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { verifier, challenge };
}

/** What the window came back with, from the fragment only (`#ticket=…` or `#error=…`). */
export function readReturn(url: string):
  | Exclude<WindowOutcome, { kind: "ticket" }>
  | {
      readonly kind: "ticket";
      readonly ticket: string;
    } {
  const hash = url.indexOf("#");
  const fragment = new URLSearchParams(hash === -1 ? "" : url.slice(hash + 1));
  const ticket = fragment.get("ticket");
  if (ticket !== null) {
    const shaped = ticket.startsWith("sr_pt_") && ticket.length === 49 && base64url.test(ticket);
    return shaped ? { kind: "ticket", ticket } : { kind: "failed" };
  }
  switch (fragment.get("error")) {
    case "cancelled":
      return { kind: "cancelled" };
    case "expired":
      return { kind: "expired" };
    default:
      return { kind: "failed" };
  }
}

/**
 * Opens the window. On the web the pop-up opens before this returns, while
 * the tap is still being handled, so browsers do not block it: nothing is
 * awaited before it opens.
 */
export function openProviderWindow(options: {
  readonly provider: SignInProvider;
  readonly attempt: Attempt;
  readonly apiBaseUrl: string;
  readonly returnUrl: string;
}): Promise<WindowOutcome> {
  const { provider, attempt, returnUrl } = options;
  const query = new URLSearchParams({ challenge: attempt.challenge, returnUrl });
  const startUrl = `${options.apiBaseUrl}${providerStartPath(provider)}?${query.toString()}`;
  let opened: ReturnType<typeof openAuthSessionAsync>;
  try {
    opened = openAuthSessionAsync(startUrl, returnUrl);
  } catch {
    return Promise.resolve({ kind: "failed" });
  }
  return opened.then(
    (result): WindowOutcome => {
      if (result.type !== "success") return { kind: "cancelled" };
      const back = readReturn(result.url);
      return back.kind === "ticket" ? { ...back, verifier: attempt.verifier } : back;
    },
    (): WindowOutcome => ({ kind: "failed" }),
  );
}

/**
 * The window for the sign-in buttons and for adding one in Settings. The
 * secret for the next try is made in advance, so a tap opens the window at
 * once; each try gets a new one. `ready` is false for the moment it takes.
 * If no secret can be made, a tap says sign-in didn't work. Leaving the
 * screen while the pop-up is open closes it, so a later tap opens a new
 * one rather than finding the old one.
 */
export function useProviderWindow(): {
  readonly ready: boolean;
  readonly open: (provider: SignInProvider) => Promise<WindowOutcome>;
} {
  const next = useRef<Attempt | "unavailable" | null>(null);
  const [ready, setReady] = useState(false);
  const mounted = useRef(true);
  const windowOpen = useRef(false);

  const prepare = useCallback(() => {
    makeAttempt().then(
      (attempt) => {
        if (!mounted.current) return;
        next.current = attempt;
        setReady(true);
      },
      () => {
        // Such as no secure random numbers on a page that is not https.
        if (!mounted.current) return;
        next.current = "unavailable";
        setReady(true);
      },
    );
  }, []);

  useEffect(() => {
    mounted.current = true;
    prepare();
    return () => {
      mounted.current = false;
      if (windowOpen.current && Platform.OS === "web") dismissAuthSession();
    };
  }, [prepare]);

  const open = useCallback(
    (provider: SignInProvider): Promise<WindowOutcome> => {
      const attempt = next.current;
      // A second tap while a window is open, or before the first secret.
      if (attempt === null) return Promise.resolve({ kind: "cancelled" });
      if (attempt === "unavailable") return Promise.resolve({ kind: "failed" });
      next.current = null;
      setReady(false);
      windowOpen.current = true;
      const outcome = openProviderWindow({
        provider,
        attempt,
        apiBaseUrl: apiBaseUrl(),
        returnUrl: providerReturnUrl(),
      });
      return outcome.finally(() => {
        windowOpen.current = false;
        prepare();
      });
    },
    [prepare],
  );

  return { ready, open };
}
