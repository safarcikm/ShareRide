import { legalDocumentTypes } from "@shareride/domain";
import { describe, expect, it } from "vitest";
import {
  bodyOf,
  languages,
  publishedDocuments,
  publishedVersions,
  sha256Of,
  type PublishedVersion,
} from "./published.ts";

const eachText = (check: (text: string, version: PublishedVersion, language: string) => void) => {
  for (const version of publishedVersions) {
    for (const language of languages) check(bodyOf(version, language), version, language);
  }
};

const nameOf = (version: PublishedVersion, language: string) =>
  `${version.type} version ${String(version.version)} (${language})`;

describe("the legal documents published from the repository (ADR 0043)", () => {
  it("include every document the app shows", () => {
    for (const type of legalDocumentTypes) {
      expect(publishedVersions.some((version) => version.type === type)).toBe(true);
    }
  });

  it("number each document's versions once, from 2: version 1 is the placeholder draft", () => {
    for (const type of legalDocumentTypes) {
      const numbers = publishedVersions
        .filter((version) => version.type === type)
        .map((version) => version.version);
      expect(new Set(numbers).size).toBe(numbers.length);
      expect(Math.min(...numbers)).toBeGreaterThanOrEqual(2);
    }
  });

  it("never change once published: each text matches the hash recorded with it", () => {
    eachText((text, version, language) => {
      expect(sha256Of(text), `${nameOf(version, language)} changed; publish a new version`).toBe(
        version.sha256[language as "is" | "en"],
      );
    });
  });

  it("have no blanks left to fill in", () => {
    eachText((text, version, language) => {
      expect(text, nameOf(version, language)).not.toMatch(/[[\]]/);
    });
  });

  it("use only the Markdown the app shows: section headings, paragraphs and bold", () => {
    eachText((text, version, language) => {
      const name = nameOf(version, language);
      // The title is the document's own, so no top-level heading.
      expect(text, name).not.toMatch(/^# /m);
      expect(text, name).not.toMatch(/\]\(|<[a-z/]|^\|/im);
      expect(text, name).toMatch(/^## /m);
    });
  });

  it("have the same sections in both languages, with a title and a summary in each", () => {
    for (const version of publishedVersions) {
      const headings = languages.map(
        (language) => bodyOf(version, language).match(/^## .*/gm)?.length ?? 0,
      );
      expect(headings[0], nameOf(version, "both")).toBe(headings[1]);
      for (const language of languages) {
        expect(version.title[language].trim()).not.toBe("");
        expect(version.summary[language].trim()).not.toBe("");
      }
    }
  });

  it("are read with Unix line ends whatever the checkout has", () => {
    for (const document of publishedDocuments()) {
      for (const language of languages) expect(document.texts[language].body).not.toMatch(/\r/);
    }
  });
});
