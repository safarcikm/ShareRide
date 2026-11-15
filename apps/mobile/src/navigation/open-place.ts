import { router } from "expo-router";
import type { MenuTab } from "./menu";

/**
 * Goes to a place of the menu, closing the screens opened on top, sign-in
 * included, back to the menu, so the stack never holds a second menu behind
 * Back. With no menu underneath, as after a shared link, the menu takes the
 * screen's place.
 */
export function openPlace(href: MenuTab["href"]) {
  router.dismissTo(href);
  // Closing stops at the menu as it was; this chooses the place in it.
  router.navigate(href);
}
