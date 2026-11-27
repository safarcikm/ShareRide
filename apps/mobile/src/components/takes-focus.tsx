import { useEffect, useRef, type ComponentRef, type ReactNode } from "react";
import { AccessibilityInfo, Platform, View } from "react-native";

/**
 * Moves keyboard and screen-reader focus to its content when it appears,
 * such as a sheet that replaced the button just pressed, or the outcome
 * once that sheet closes. Without it, focus falls back to the top of the
 * page on the web. `when` false leaves focus where it is, such as on a
 * screen that has just opened. `onFocused` runs once it has moved focus,
 * so a page can announce something only the first time.
 *
 * Where the content is one thing to press and nothing else, as a row
 * that came or the button that opened what has closed, the web puts the
 * keyboard on that thing itself, so Enter presses it. A phone's screen
 * reader lands on the first thing in the content either way.
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
      focusOnWeb(view as unknown as HTMLElement);
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

/** What the keyboard stops at: links, buttons, fields and what is made one of them. */
const stops =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]';

/**
 * Puts the keyboard on the content's one thing to press where that is all
 * the content says, and on the content as a whole otherwise: a notice
 * with a button under it is read from its first word.
 */
function focusOnWeb(content: HTMLElement) {
  const found = content.querySelectorAll<HTMLElement>(stops);
  const [only] = found;
  if (found.length === 1 && only !== undefined && only.textContent === content.textContent) {
    only.focus();
    if (document.activeElement === only) return;
  }
  content.focus();
}
