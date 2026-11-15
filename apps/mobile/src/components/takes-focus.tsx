import { useEffect, useRef, type ComponentRef, type ReactNode } from "react";
import { AccessibilityInfo, Platform, View } from "react-native";

/**
 * Moves keyboard and screen-reader focus to its content when it appears,
 * such as a sheet that replaced the button just pressed, or the outcome
 * once that sheet closes. Without it, focus falls back to the top of the
 * page on the web. `when` false leaves focus where it is, such as on a
 * screen that has just opened.
 */
export function TakesFocus({
  children,
  when = true,
}: {
  readonly children: ReactNode;
  readonly when?: boolean;
}) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  // Only on appearing: a later change of `when` does not move focus.
  const focusOnMount = useRef(when);
  useEffect(() => {
    const view = ref.current;
    if (!focusOnMount.current || view === null) return;
    if (Platform.OS === "web") {
      // On the web the view is an element, focusable through tabIndex -1.
      (view as unknown as { focus: () => void }).focus();
      return;
    }
    AccessibilityInfo.sendAccessibilityEvent(view, "focus");
  }, []);
  return (
    <View ref={ref} tabIndex={-1}>
      {children}
    </View>
  );
}
