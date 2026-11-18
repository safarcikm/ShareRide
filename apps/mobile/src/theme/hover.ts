import { useMemo, useState } from "react";

/** What a `Pressable` takes to tell where the pointer is. */
export interface HoverProps {
  readonly onHoverIn: () => void;
  readonly onHoverOut: () => void;
}

/**
 * Whether the pointer is over a part, and the props that tell it (spec 18,
 * 3.4). A part shows this only where there is a pointer: a phone never
 * calls them, and a touch shows the pressed look. A part that is turned
 * `off`, such as a disabled or busy button, is never under the pointer, and
 * hears nothing of it leaving, so it forgets the pointer.
 */
export function useHover(off = false): readonly [boolean, HoverProps] {
  const [hovered, setHovered] = useState(false);
  if (off && hovered) setHovered(false);
  const props = useMemo<HoverProps>(
    () => ({
      onHoverIn: () => {
        setHovered(true);
      },
      onHoverOut: () => {
        setHovered(false);
      },
    }),
    [],
  );
  return [hovered && !off, props];
}
