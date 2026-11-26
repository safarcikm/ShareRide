import { passkeySetupOptionsRoute } from "@shareride/contracts";
import { passkeyOfferDue } from "@shareride/domain";
import { router, useIsFocused, type Href } from "expo-router";
import { useEffect, useRef } from "react";
import { useSession } from "@/auth/session";
import type { SessionManager } from "@/auth/session-manager";
import { useConfig } from "@/beta/config";
import { now } from "@/lib/clock";
import { reportError } from "@/lib/error-reporting";
import { takeKeptChoice } from "@/navigation/kept-choice";
import { devicePasskeys } from "./passkey";
import { markPasskeyHere, offerDeclinedAt, passkeyHere, rememberWay } from "./this-browser";
import { savePasskey } from "./use-passkeys";

/** "Use Face ID or fingerprint next time?" (spec 29, 3.2). */
export const passkeyOfferHref = "/onboarding/face-id";

/**
 * Once the account is ready after signing in, and only while the menu is on
 * screen (a redirect from a screen underneath, while sign-up is still on
 * top, would be lost): what opens next, once.
 */
export function useAfterSignIn(ready: boolean): void {
  const session = useSession();
  const { passkeySignIn } = useConfig();
  const focused = useIsFocused();
  const taken = useRef(false);
  useEffect(() => {
    if (!ready) {
      taken.current = false;
      return;
    }
    if (!focused || taken.current) return;
    taken.current = true;
    void afterSignIn(session, passkeySignIn, (href) => {
      router.navigate(href);
    }).catch(reportError);
  }, [focused, ready, session, passkeySignIn]);
}

/**
 * After a sign-in: this browser remembers the way (spec 29, 3.5) and a
 * passkey it signed in with (3.2, item 5). Then the choice kept through
 * sign-in opens first (a booking, Offer, a report form, a link: spec 5,
 * 3.1; spec 20, 3.2). After a password, the browser may save a passkey by
 * itself (3.3). Otherwise "Use Face ID or fingerprint next time?" opens
 * when it is due (R29.2). A session restored at start opens only the kept
 * choice.
 */
export async function afterSignIn(
  session: SessionManager,
  serverHasPasskeys: boolean,
  open: (href: Href) => void,
): Promise<void> {
  const just = session.takeJustSignedIn();
  if (just !== null) {
    await rememberWay(just.way);
    if (just.credentialId !== null) await markPasskeyHere(just.credentialId);
  }
  const kept = await takeKeptChoice(now());
  if (kept !== null) open(kept);
  if (just === null || !serverHasPasskeys || just.isNewUser) return;
  if (just.way === "password" && (await passkeyHere()) === null && (await savedQuietly(session))) {
    return;
  }
  const due = passkeyOfferDue({
    isNewUser: just.isNewUser,
    way: just.way,
    deviceHasLock: await devicePasskeys.available(),
    serverHasPasskeys,
    passkeyHere: (await passkeyHere()) !== null,
    declinedAt: await offerDeclinedAt(),
    keptChoice: kept !== null,
    now: now(),
  });
  if (due) open(passkeyOfferHref);
}

/**
 * The browser asked to save a passkey by itself, with quiet options, which
 * the API gives only straight after a sign-in (ADR 0050); true when it did
 * and the passkey is saved. With 10 set up, or a browser that does not,
 * nothing happens (spec 29, 3.3).
 */
async function savedQuietly(session: SessionManager): Promise<boolean> {
  if (!(await devicePasskeys.quietCreateAvailable())) return false;
  const asked = await session.call(passkeySetupOptionsRoute, { body: { quiet: true } });
  if (!asked.ok) return false;
  const outcome = await savePasskey(session, asked.data.options, (options) =>
    devicePasskeys.createQuietly(options),
  );
  return outcome.kind === "saved";
}
