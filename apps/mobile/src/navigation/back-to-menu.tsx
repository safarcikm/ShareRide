import { useEffect } from "react";
import { Loading } from "@/components/loading";
import { openPlace } from "./open-place";

/**
 * Shown by a screen that no longer fits the session, such as sign-in once
 * signed in or Settings once signed out: it closes back to the menu, on
 * Find, which leads on from there (spec 16, 3.1 item 5). Closing, rather
 * than opening the menu again, keeps one menu behind Back.
 */
export function BackToMenu() {
  useEffect(() => {
    openPlace("/");
  }, []);
  return <Loading />;
}
