import { focusRingCss } from "./pressable";
import { colors } from "./tokens";

const id = "shareride-focus-ring";

/** Adds the keyboard focus ring style sheet to the page, once. */
export function installFocusRing(): void {
  if (typeof document === "undefined" || document.getElementById(id) !== null) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = focusRingCss(colors.light, colors.dark);
  document.head.appendChild(style);
}
