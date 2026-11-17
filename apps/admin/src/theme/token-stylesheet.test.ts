import { colors, edges, mapDrawing, typeScale } from "@shareride/ui";
import { describe, expect, it } from "vitest";
import { faceParts, tokenStylesheet } from "./token-stylesheet.ts";

describe("tokenStylesheet", () => {
  const css = tokenStylesheet();

  it("has every colour, light and dark", () => {
    expect(css).toContain(`--color-text-muted: ${colors.light.textMuted};`);
    expect(css).toContain(`--color-text-muted: ${colors.dark.textMuted};`);
    const count = (css.match(/--color-/g) ?? []).length;
    expect(count).toBe(Object.keys(colors.light).length * 2);
  });

  it("has the map's colours, light and dark (ADR 0024)", () => {
    expect(css).toContain(`--map-ring-road: ${mapDrawing.light.ringRoad};`);
    expect(css).toContain(`--map-ring-road: ${mapDrawing.dark.ringRoad};`);
    const count = (css.match(/--map-/g) ?? []).length;
    expect(count).toBe(Object.keys(mapDrawing.light).length * 2);
  });

  it("has a class for each type style, weighted by its face", () => {
    for (const name of Object.keys(typeScale)) {
      expect(css).toContain(`.type-${name.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`)} {`);
    }
    expect(css).toContain("font-family: Fredoka, system-ui, sans-serif;\n  font-weight: 600;");
    expect(css).not.toContain("NaN");
  });

  it("has the sizes the console's parts are drawn with", () => {
    for (const name of ["--space-md", "--radius-card", "--edge-card", "--edge-button-primary"]) {
      expect(css).toContain(`${name}: `);
    }
    expect(css).toContain(`--edge-button-secondary: ${String(edges.buttonSecondary)}px;`);
  });

  it("reads the family and weight from a face name", () => {
    expect(faceParts("Nunito_700Bold")).toEqual({ family: "Nunito", weight: 700 });
    expect(() => faceParts("Nunito")).toThrow();
  });
});
