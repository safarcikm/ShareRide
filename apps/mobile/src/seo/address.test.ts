import { localeFromQuery, pageLinks } from "./address";

describe("the language an address names (spec 23, 3.5)", () => {
  it("reads lang=is or lang=en, and nothing else", () => {
    expect(localeFromQuery("?lang=is")).toBe("is");
    expect(localeFromQuery("?from=abc&lang=en")).toBe("en");
    expect(localeFromQuery("?lang=fr")).toBeNull();
    expect(localeFromQuery("")).toBeNull();
  });
});

describe("a public page's addresses", () => {
  const origin = "https://puffinride.is";

  it("names itself in the language the address named, with both languages and the plain one", () => {
    expect(pageLinks(origin, "/meeting-points", "is")).toEqual({
      canonical: "https://puffinride.is/meeting-points?lang=is",
      alternates: [
        { hreflang: "is", href: "https://puffinride.is/meeting-points?lang=is" },
        { hreflang: "en", href: "https://puffinride.is/meeting-points?lang=en" },
        { hreflang: "x-default", href: "https://puffinride.is/meeting-points" },
      ],
    });
  });

  it("names the plain address when the address named no language", () => {
    expect(pageLinks(origin, "/", null).canonical).toBe("https://puffinride.is/");
  });
});
