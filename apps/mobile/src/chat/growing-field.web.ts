import { useLayoutEffect, useRef, type ComponentRef, type RefObject } from "react";
import { useWindowDimensions, type TextInput } from "react-native";

type Field = ComponentRef<typeof TextInput>;

/**
 * On the web a field of several lines keeps the height it was given, so
 * its height is set from what is written in it, each time that changes
 * and each time the window does: one line when empty, and back to one
 * line once a message went. Its style's least and greatest heights still
 * hold; past the greatest, it scrolls inside. The ref goes on the field.
 */
export function useGrowingField(text: string): RefObject<Field | null> {
  const ref = useRef<Field>(null);
  const { width } = useWindowDimensions();
  useLayoutEffect(() => {
    // On the web the field's ref is its <textarea>.
    const field = ref.current as unknown as HTMLTextAreaElement | null;
    if (field === null) return;
    // What is written shows its own height only while the field has none.
    field.style.height = "auto";
    const outline = field.offsetHeight - field.clientHeight;
    field.style.height = `${String(field.scrollHeight + outline)}px`;
  }, [text, width]);
  return ref;
}
