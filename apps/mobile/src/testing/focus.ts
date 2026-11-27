import type { screen } from "@testing-library/react-native";

type Part = ReturnType<typeof screen.getByRole>;

/** The view that takes focus around a part (`TakesFocus`): the nearest one above it, or null. */
export function taker(part: Part) {
  let above = part.parent;
  while (above !== null && (above.props as { tabIndex?: number }).tabIndex !== -1) {
    above = above.parent;
  }
  return above;
}

/**
 * Whether the first event a spy on `AccessibilityInfo.sendAccessibilityEvent`
 * holds was sent to the view that takes focus around `part`, and not to
 * another. The event goes to the view itself and a test sees what was
 * drawn of it: the two hold the same children. It answers yes or no, as
 * Jest prints the views it is given to compare, without end.
 */
export function focusWentTo(focus: { readonly mock: { readonly calls: unknown[][] } }, part: Part) {
  const [[on] = []] = focus.mock.calls;
  const around = taker(part);
  if (on === undefined || around === null) return false;
  const held = (on as { readonly props?: { readonly children?: unknown } }).props?.children;
  return held !== undefined && held === (around.props as { children?: unknown }).children;
}
