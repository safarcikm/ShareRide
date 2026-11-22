import { providerReturnPath } from "@shareride/domain";
import { maybeCompleteAuthSession } from "expo-web-browser";

// Runs from the app's entry (index.ts) before the app loads, so it imports
// nothing of the app's own.

/**
 * In Google's or Apple's pop-up, back on sign-in/return (ADR 0034): hands
 * the address with its ticket to the window of this app that opened the
 * pop-up, which then closes it, and takes the ticket out of this window's
 * address and history. True when the answer was handed over.
 */
export function handOffProviderPopup(): boolean {
  if (window.location.pathname !== `/${providerReturnPath}`) return false;
  let handedOff = false;
  if (openedByThisApp()) {
    try {
      handedOff = maybeCompleteAuthSession().type === "success";
    } catch {
      // Nothing to hand over to: the return screen says to close this window.
    }
  }
  window.history.replaceState(null, "", window.location.pathname);
  return handedOff;
}

/** A window of this app's own address opened the pop-up. */
function openedByThisApp(): boolean {
  const opener = window.opener as Window | null;
  if (opener === null) return false;
  try {
    return opener.location.origin === window.location.origin;
  } catch {
    // Another site's window: its address cannot be read.
    return false;
  }
}

/** How long a pop-up that handed its answer over waits to be closed. */
export const popupGraceMs = 2000;
