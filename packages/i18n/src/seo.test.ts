import { describe, expect, it } from "vitest";
import { pageText } from "./seo.ts";
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
