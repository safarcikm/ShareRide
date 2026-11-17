import { useIsFocused } from "expo-router";
import { useEffect } from "react";
import { Loading } from "@/components/loading";
import { openPlace } from "./open-place";

/**
 * Shown by a screen that no longer fits the session, such as sign-in once
 * signed in or Settings once signed out: it closes back to the menu, on
 * Find, which leads on from there (spec 16, 3.1 item 5). Closing, rather
 * than opening the menu again, keeps one menu behind Back. Only the screen
 * on top closes: one underneath, such as Settings under "Delete my
 * account" while it says when the data goes, waits until it is on top.
 */
export function BackToMenu() {
  const focused = useIsFocused();
  useEffect(() => {
    if (focused) openPlace("/");
  }, [focused]);
  return <Loading />;
}
