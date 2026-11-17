import { reportCategories, reportOutcomes } from "@shareride/domain";
import { describe, expect, it } from "vitest";
import { reportCategoryText, reportOutcomeText } from "./safety.ts";
import { createTranslator } from "./translator.ts";

const en = createTranslator("en");
const is = createTranslator("is");

describe("reports in the reader's language (spec 9, 3.1)", () => {
  it("name every category, each differently, in both languages", () => {
    for (const t of [en, is]) {
      const texts = reportCategories.map((category) => reportCategoryText(t, category));
      expect(new Set(texts).size).toBe(reportCategories.length);
      for (const text of texts) expect(text).not.toContain("{");
    }
    expect(reportCategoryText(en, "not_as_listed")).toBe("The trip wasn't as listed");
  });

  it("say every outcome in general terms, in both languages", () => {
    for (const t of [en, is]) {
      const texts = reportOutcomes.map((outcome) => reportOutcomeText(t, outcome));
      expect(new Set(texts).size).toBe(reportOutcomes.length);
    }
    expect(reportOutcomeText(en, "no_breach")).toBe(
      "We've looked into your report and found no breach of our rules.",
    );
  });
});
