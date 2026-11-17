import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sidePanelFrom } from "@shareride/ui";
import { describe, expect, it } from "vitest";

// The console's look comes from the shared tokens only (spec 15, CLAUDE.md).
const css = readFileSync(join(import.meta.dirname, "styles.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

describe("the console's stylesheet", () => {
  it("uses no raw sizes outside the width it lays out from", () => {
    const rules = css.replace(/@media[^{]*\{/g, "");
    expect(rules.match(/-?\d*\.?\d+(px|rem|em|vh|vw|dvh)\b/g) ?? []).toEqual([]);
  });

  it("puts the menu beside the page from the tokens' side panel width", () => {
    const widths = [...css.matchAll(/@media \(min-width: (\d+)px\)/g)].map((match) => match[1]);
    expect(widths).toEqual([String(sidePanelFrom)]);
  });

  it("never shows a disabled button with opacity alone", () => {
    expect(css).not.toMatch(/opacity/);
  });
});
