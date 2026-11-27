import { useRef, type ComponentRef, type RefObject } from "react";
import type { TextInput } from "react-native";

type Field = ComponentRef<typeof TextInput>;

/**
 * A field of one line that grows as it is written in (spec 31, 3.13). On a
 * phone a field of several lines does that by itself, between its least
 * and its greatest height; the web's needs growing-field.web.ts. The ref
 * goes on the field.
 */
export function useGrowingField(_text: string): RefObject<Field | null> {
  return useRef<Field>(null);
}
