import { useEffect, useRef, type ComponentRef, type ReactNode } from "react";
import { AccessibilityInfo, Platform, View } from "react-native";

/**
 * Moves keyboard and screen-reader focus to its content when it appears,
 * such as a sheet that replaced the button just pressed, or the outcome
 * once that sheet closes. Without it, focus falls back to the top of the
 * page on the web. `when` false leaves focus where it is, such as on a
 * screen that has just opened. `onFocused` runs once it has moved focus,
 * so a page can announce something only the first time.
 */
export function TakesFocus({
  children,
  when = true,
  onFocused,
}: {
  readonly children: ReactNode;
  readonly when?: boolean;
  readonly onFocused?: () => void;
}) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  // Only on appearing: a later change of `when` does not move focus.
  const focusOnMount = useRef(when);
  const focusedOnMount = useRef(onFocused);
  useEffect(() => {
    const view = ref.current;
    if (!focusOnMount.current || view === null) return;
    if (Platform.OS === "web") {
      // On the web the view is an element, focusable through tabIndex -1.
      (view as unknown as { focus: () => void }).focus();
    } else {
      AccessibilityInfo.sendAccessibilityEvent(view, "focus");
    }
    focusedOnMount.current?.();
  }, []);
  return (
    <View ref={ref} tabIndex={-1}>
      {children}
    </View>
  );
}
