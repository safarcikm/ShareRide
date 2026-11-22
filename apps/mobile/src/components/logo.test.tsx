import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react-native";
import { Logo } from "./logo";

// Spec 15, section 4.9: the logo in the app is the app icon in small, so the
// Logo part draws the same shapes as the drawing the app icon is exported from.
const drawing = readFileSync(join(__dirname, "..", "..", "assets", "logo", "icon.svg"), "utf8");

/** The outline of every path in the drawing, in order. */
function outlinesInDrawing(): string[] {
  return [...drawing.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map(([, d]) => d ?? "");
}

/** The outline of every path in a rendered tree, in order. */
function outlinesDrawn(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(outlinesDrawn);
  if (typeof node !== "object" || node === null) return [];
  const own: string[] = [];
  if ("props" in node && typeof node.props === "object" && node.props !== null) {
    const { d } = node.props as { d?: unknown };
    if (typeof d === "string") own.push(d);
  }
  return "children" in node ? [...own, ...outlinesDrawn(node.children)] : own;
}

describe("Logo", () => {
  it("draws the same shapes as the app icon's drawing", async () => {
    await render(<Logo size={30} />);
    const outlines = outlinesInDrawing();
    expect(outlines.length).toBeGreaterThan(0);
    // The part adds its rounded corners as a rectangle, not as a path.
    expect(outlinesDrawn(screen.toJSON())).toEqual(outlines);
  });

  it("is hidden from screen readers, because the name always sits beside it", async () => {
    await render(<Logo size={30} />);
    expect(screen.queryByTestId("logo")).toBeNull();
    expect(screen.getByTestId("logo", { includeHiddenElements: true })).toBeTruthy();
  });
});
