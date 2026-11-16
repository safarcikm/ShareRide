import { router, type Href } from "expo-router";

/**
 * Back to the screen this one was opened from, which loads again, such as
 * step 5 of posting a trip or My cars; to `fallback` when it was opened
 * from a link.
 */
export function backTo(fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
