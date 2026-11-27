import { useSyncExternalStore } from "react";
import { Platform, useWindowDimensions } from "react-native";

/**
 * How high the window is that the page is laid out in. On the web that is
 * not what `useWindowDimensions` tells: its height is what is seen of the
 * page, which a phone's keyboard makes shorter while a field is written
 * in. A layout that went by it would change under the fingers each time
 * the keyboard came and went.
 */
export const useLaidOutHeight = Platform.OS === "web" ? useHeightOnWeb : useWindowHeight;

function useWindowHeight() {
  return useWindowDimensions().height;
}

function useHeightOnWeb() {
  return useSyncExternalStore(onResize, heightOnWeb);
}

/** A window that is resized, turned or zoomed says so; a keyboard over the page does not. */
function onResize(changed: () => void) {
  window.addEventListener("resize", changed);
  return () => {
    window.removeEventListener("resize", changed);
  };
}

function heightOnWeb() {
  return document.documentElement.clientHeight;
}
