import { describe, expect, it } from "vitest";
import { carpoolPage, pageText } from "./seo.ts";
import { createTranslator } from "./translator.ts";

const en = createTranslator("en");
const is = createTranslator("is");

describe("a public page's title and description (spec 23, 3.6)", () => {
  it("gives Find the site's own title", () => {
    expect(pageText(en, { kind: "find" }).title).toBe(
      "PuffinRide · Carpool and shared rides across Iceland",
    );
    expect(pageText(is, { kind: "find" }).title).toBe(
      "PuffinRide · Samferða um Ísland: far og samakstur",
    );
  });

  it("names a meeting point as a carpool meeting point, in the title and the description", () => {
    const page = { kind: "meetingPoint", name: "Reynisfjara" } as const;
    expect(pageText(en, page)).toEqual({
      title: "Reynisfjara: carpool meeting point · PuffinRide",
      description:
        "Reynisfjara: a PuffinRide meeting point, where drivers and passengers meet to carpool.",
    });
    expect(pageText(is, page).title).toBe("Reynisfjara: mótsstaður fyrir samakstur · PuffinRide");
  });

  it("names a place with its nearest carpool meeting points", () => {
    const page = { kind: "place", name: "Akureyri" } as const;
    expect(pageText(en, page)).toEqual({
      title: "Akureyri: nearest carpool meeting points · PuffinRide",
      description:
        "The PuffinRide carpool meeting points nearest to Akureyri, for finding or offering a shared ride.",
    });
  });

  it("gives the meeting points their own title", () => {
    expect(pageText(en, { kind: "meetingPoints" }).title).toBe("Meeting points · PuffinRide");
    expect(pageText(is, { kind: "meetingPoints" }).title).toBe("Mótsstaðir · PuffinRide");
  });
});

describe("the Carpool in Iceland page (spec 23, 3.9)", () => {
  it("has a title and description with the words people search for", () => {
    expect(pageText(en, { kind: "carpool" })).toEqual({
      title: "Carpool in Iceland: find or offer a ride · PuffinRide",
      description:
        "How carpooling in Iceland works with PuffinRide: find a seat in a car going your way, or offer the empty seats in yours, and meet at public meeting points around the country.",
    });
    expect(pageText(is, { kind: "carpool" }).title).toBe(
      "Samferða um Ísland: finndu far eða bjóddu far · PuffinRide",
    );
  });

  it("links to the meeting points and the community rules", () => {
    const links = carpoolPage.sections.flatMap((section) =>
      section.link === undefined ? [] : [section.link.href],
    );
    expect(links).toEqual(["/meeting-points", "/legal/community-rules"]);
  });

  it("says nothing about money, in either language (Martin's rule for marketing texts)", () => {
    for (const t of [en, is]) {
      const text = [
        t(carpoolPage.title),
        t(carpoolPage.intro),
        ...carpoolPage.sections.flatMap((section) => [
          t(section.heading),
          ...section.paragraphs.map((paragraph) => t(paragraph)),
          ...(section.questions ?? []).flatMap(({ question, answer }) => [t(question), t(answer)]),
        ]),
      ].join(" ");
      expect(text).not.toMatch(
        /\b(pay|paid|payment|price|fee|fees|cost|costs|cheap|money|ISK|kr|greiða|greiðsl\w*|verð\w*|gjald\w*|kostnað\w*|ódýr\w*|krónu\w*)\b/iu,
      );
    }
  });
});
