import { handOffProviderPopup, popupGraceMs } from "./src/sign-in/popup-hand-off";

// The app's entry. First, in Google's or Apple's pop-up on the web (ADR
// 0034), the answer goes to the window that opened it and the ticket leaves
// this window's address, before the router, error reporting or the session
// could see it. That window then closes the pop-up, so the app does not
// load there at all: it would refresh the session the two windows share.
// Only if the pop-up is still open a moment later does the app load, to say
// it can be closed. Everywhere else the app loads at once.

function loadApp(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loads only after the pop-up's hand-off
  require("expo-router/entry");
}

if (handOffProviderPopup()) setTimeout(loadApp, popupGraceMs);
else loadApp();
