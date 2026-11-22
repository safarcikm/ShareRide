/**
 * On the web, Google's or Apple's pop-up hands its answer to the window
 * that opened it (popup-hand-off.web.ts). Phones have no pop-up: the
 * browser sheet gives the answer to the app itself.
 */
export function handOffProviderPopup(): boolean {
  return false;
}

/** How long a pop-up that handed its answer over waits to be closed. */
export const popupGraceMs = 2000;
