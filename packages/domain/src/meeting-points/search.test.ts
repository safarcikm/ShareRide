import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  normaliseSearchText,
  placeMatch,
  rankPlaceMatches,
  type PlaceCandidate,
} from "./search.ts";

/**
 * Any text people might type: Icelandic letters, Latin, combining accents,
 * Greek, Cyrillic, punctuation, symbols and emoji. Cheaper to build than
 * fast-check's "binary" strings, whose first use takes a second or more.
 */
const anyText = fc.string({
  unit: fc.oneof(
    fc.constantFrom(...Array.from("ÞþÐðÆæÖöÁáÉéÍíÓóÚúÝýØøŒœß")),
    fc.integer({ min: 0x20, max: 0x2fff }).map((code) => String.fromCharCode(code)),
    fc.integer({ min: 0x1f300, max: 0x1faff }).map((code) => String.fromCodePoint(code)),
  ),
});

describe("normaliseSearchText (rule R2.6)", () => {
  it.each([
    ["Höfn", "hofn"],
    ["Þorlákshöfn", "thorlakshofn"],
    ["Egilsstaðir", "egilsstadir"],
    ["Æðey", "aedey"],
    ["ÞINGVELLIR", "thingvellir"],
    ["Ýdalir Úthlíð Éljagangur Íshús Ósar", "ydalir uthlid eljagangur ishus osar"],
    ["  BSÍ  bus   terminal ", "bsi bus terminal"],
    ["Keflavík Airport (KEF)", "keflavik airport kef"],
    ["N1 Borgarnes", "n1 borgarnes"],
    ["Fjarðarkaup–Hafnarfjörður", "fjardarkaup hafnarfjordur"],
  ])("turns %j into %j", (text, expected) => {
    expect(normaliseSearchText(text)).toBe(expected);
  });

  it("gives plain ASCII letters, digits and single spaces", () => {
    fc.assert(
      fc.property(anyText, (text) => {
        expect(normaliseSearchText(text)).toMatch(/^(?:[a-z0-9]+(?: [a-z0-9]+)*)?$/);
      }),
    );
  });

  it("changes nothing the second time", () => {
    fc.assert(
      fc.property(anyText, (text) => {
        const once = normaliseSearchText(text);
        expect(normaliseSearchText(once)).toBe(once);
      }),
    );
  });

  it("treats Icelandic letters and their ASCII spellings alike", () => {
    const icelandic = fc.constantFrom(...Array.from("þðæöáéíóúýÞÐÆÖÁÉÍÓÚÝ"));
    const ascii: Record<string, string> = {
      þ: "th",
      ð: "d",
      æ: "ae",
      ö: "o",
      á: "a",
      é: "e",
      í: "i",
      ó: "o",
      ú: "u",
      ý: "y",
    };
    fc.assert(
      fc.property(
        fc.array(fc.oneof(icelandic, fc.constantFrom(...Array.from("abcdefg ")))),
        (letters) => {
          const word = letters.join("");
          const spelt = letters.map((letter) => ascii[letter.toLowerCase()] ?? letter).join("");
          expect(normaliseSearchText(word)).toBe(normaliseSearchText(spelt));
        },
      ),
    );
  });
});

describe("placeMatch (spec 2, section 3.4)", () => {
  const akureyri = { names: ["Akureyri"], aliases: ["AEY"] };

  it("needs at least two characters", () => {
    expect(placeMatch("a", akureyri)).toBeNull();
    expect(placeMatch(" ", akureyri)).toBeNull();
    expect(placeMatch("ak", akureyri)).toBe("prefix");
  });

  it("finds a name exactly, without Icelandic letters", () => {
    expect(placeMatch("hofn", { names: ["Höfn"], aliases: [] })).toBe("exact");
    expect(placeMatch("THORLAKSHOFN", { names: ["Þorlákshöfn"], aliases: [] })).toBe("exact");
  });

  it("finds the start of a name or of any word in it", () => {
    expect(placeMatch("egilss", { names: ["Egilsstaðir"], aliases: [] })).toBe("prefix");
    expect(placeMatch("terminal", { names: ["BSÍ bus terminal"], aliases: [] })).toBe("prefix");
    expect(placeMatch("bus term", { names: ["BSÍ bus terminal"], aliases: [] })).toBe("prefix");
    expect(placeMatch("national park", { names: ["Þingvellir National Park"], aliases: [] })).toBe(
      "prefix",
    );
  });

  it("finds an alias", () => {
    expect(placeMatch("kef", { names: ["Keflavík Airport"], aliases: ["KEF"] })).toBe("prefix");
    expect(placeMatch("aey", akureyri)).toBe("alias");
  });

  it("tolerates a small typo from four letters", () => {
    expect(placeMatch("akureyi", akureyri)).toBe("close");
    expect(placeMatch("akurery", akureyri)).toBe("close");
    expect(placeMatch("borgarbes", { names: ["Borgarnes"], aliases: [] })).toBe("close");
    expect(placeMatch("selfos", { names: ["Selfoss"], aliases: [] })).toBe("prefix");
  });

  it("tolerates a typo in a name of several words, from any word", () => {
    expect(placeMatch("blue lagon", { names: ["Blue Lagoon"], aliases: [] })).toBe("close");
    const kef = { names: ["Keflavíkurflugvöllur", "Keflavík Airport"], aliases: ["KEF"] };
    expect(placeMatch("keflavik airprot", kef)).toBe("close");
    expect(placeMatch("airprot", kef)).toBe("close");
    expect(placeMatch("bus termnal", { names: ["BSÍ bus terminal"], aliases: [] })).toBe("close");
  });

  it("does not guess from short or distant queries", () => {
    expect(placeMatch("aku", { names: ["Vík"], aliases: [] })).toBeNull();
    expect(placeMatch("vok", { names: ["Vík"], aliases: [] })).toBeNull();
    expect(placeMatch("reykjavik", akureyri)).toBeNull();
  });
});

describe("rankPlaceMatches", () => {
  const candidate = (
    id: string,
    kind: PlaceCandidate["kind"],
    names: string[],
    aliases: string[] = [],
  ): PlaceCandidate => ({ id, kind, names, aliases });

  it("puts exact and prefix matches first, then aliases, then close matches", () => {
    const ranked = rankPlaceMatches("hella", [
      candidate("close", "place", ["Hellu"]),
      candidate("alias", "meetingPoint", ["Olís Rangárþing"], ["Hella"]),
      candidate("prefix", "place", ["Hellatún"]),
      candidate("exact", "place", ["Hella"]),
      candidate("none", "place", ["Vík"]),
    ]);
    expect(ranked.map((match) => match.id)).toEqual(["exact", "prefix", "alias", "close"]);
  });

  it("puts meeting points before places when equally good, then sorts by name", () => {
    const ranked = rankPlaceMatches("borg", [
      candidate("town", "place", ["Borgarnes"]),
      candidate("point-b", "meetingPoint", ["N1 Borgarnes"]),
      candidate("point-a", "meetingPoint", ["Borgarfjörður bridge"]),
    ]);
    expect(ranked.map((match) => match.id)).toEqual(["point-a", "point-b", "town"]);
  });

  it("returns at most the given number", () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      candidate(`p${String(index)}`, "place", [`Staður ${String(index)}`]),
    );
    expect(rankPlaceMatches("stadur", many, 10)).toHaveLength(10);
  });
});
