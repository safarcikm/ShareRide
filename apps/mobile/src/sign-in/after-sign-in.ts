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
 * 3.1; spec 20, 3.2). Then "Use Face ID or fingerprint next time?" opens
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
