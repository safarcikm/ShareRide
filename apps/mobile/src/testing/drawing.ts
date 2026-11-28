// Drawings are hidden from screen readers, so their tests look at what
// they draw: the props react-native-svg hands to its native views.

/** A colour as react-native-svg hands it to the native view: 0xAARRGGBB. */
export const drawn = (hex: string) => ({
  type: 0,
  payload: 0xff000000 + Number.parseInt(hex.slice(1), 16),
});

/** Every value of a prop inside a drawn part, nested shapes included. */
export function valuesIn(node: unknown, prop: string): unknown[] {
  if (Array.isArray(node)) return node.flatMap((child) => valuesIn(child, prop));
  if (typeof node !== "object" || node === null) return [];
  const own: unknown[] = [];
  if ("props" in node && typeof node.props === "object" && node.props !== null) {
    const value = (node.props as Record<string, unknown>)[prop];
    if (value !== undefined) own.push(value);
  }
  return "children" in node ? [...own, ...valuesIn(node.children, prop)] : own;
}

/** Every fill inside a drawn part, nested shapes included. */
export const fillsIn = (node: unknown) => valuesIn(node, "fill");
