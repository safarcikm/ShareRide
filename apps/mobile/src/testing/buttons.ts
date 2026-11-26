import { screen } from "@testing-library/react-native";

/** A part on a screen under test, with the part that holds it. */
interface Shown {
  readonly props: { readonly testID?: unknown };
  readonly parent: Shown | null;
}

function inside(part: Shown, testID: string): boolean {
  for (let around = part.parent; around !== null; around = around.parent) {
    if (around.props.testID === testID) return true;
  }
  return false;
}

/**
 * How many filled buttons the screen shows outside a `NeedsYouCard`: at
 * most one on any screen (spec 31, R31.1).
 */
export function filledButtons(): number {
  return screen
    .queryAllByTestId("filled-button")
    .filter((button) => !inside(button, "needs-you-card")).length;
}
