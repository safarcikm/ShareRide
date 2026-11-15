import { router } from "expo-router";

/** Back to Offer, which loads again; there directly if opened from a link. */
export function backToDrive(): void {
  if (router.canGoBack()) router.back();
  else router.replace("/offer");
}
