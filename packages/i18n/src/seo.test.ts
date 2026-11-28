import { describe, expect, it } from "vitest";
import { aboutPage, carpoolPage, deleteAccountPage, deleteAccountSteps, pageText } from "./seo.ts";
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

  it("says what samferða means, also spelt without ð, for people who search for the word (3.9)", () => {
    const questions = carpoolPage.sections.flatMap((section) => section.questions ?? []);
    const word = questions.find(({ question }) => en(question).includes("samferða"));
    expect(word).toBeDefined();
    if (word === undefined) return;
    expect(en(word.question)).toBe("What does samferða mean?");
    expect(en(word.answer)).toContain("samferda");
    expect(is(word.question)).toContain("samferða");
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

describe("the About page (spec 30, 3.1 and 3.4)", () => {
  it("has its own title and description", () => {
    expect(pageText(en, { kind: "about" })).toEqual({
      title: "About PuffinRide · PuffinRide",
      description:
        "Who runs PuffinRide, how to reach us, and PuffinRide's Terms of Service, Community Rules and Privacy Policy.",
    });
    expect(pageText(is, { kind: "about" }).title).toBe("Um PuffinRide · PuffinRide");
  });

  it("lists the three documents and Cookies, and links to Carpool in Iceland", () => {
    expect(aboutPage.path).toBe("/about");
    expect(aboutPage.documents.map((document) => document.href)).toEqual([
      "/legal/terms",
      "/legal/community-rules",
      "/legal/privacy",
      "/cookies",
    ]);
    expect(aboutPage.documents.map((document) => en(document.label))).toEqual([
      "Terms of Service",
      "Community Rules",
      "Privacy Policy",
      "Cookies",
    ]);
    expect(aboutPage.howItWorks.href).toBe("/carpool-iceland");
  });

  // That it names who runs PuffinRide as the newest Terms do is the API's
  // test (search-engines.test.ts), which reads the published texts.
  it("gives an address that receives mail (R30.2)", () => {
    expect(aboutPage.email).toBe("admin@puffinride.is");
  });

  it("says nothing about money, in either language (R30.3)", () => {
    for (const t of [en, is]) {
      const text = [
        t(aboutPage.title),
        ...aboutPage.intro.map((key) => t(key)),
        t(aboutPage.howItWorks.label),
        t(aboutPage.documentsTitle),
        t(aboutPage.operatorTitle),
        t(aboutPage.operator),
        t(aboutPage.contactTitle),
        t(aboutPage.contact),
        pageText(t, { kind: "about" }).description,
      ].join(" ");
      expect(text).not.toMatch(
        /\b(pay|paid|payment|price|fee|fees|cost|costs|cheap|money|ISK|kr|greiða|greiðsl\w*|verð\w*|gjald\w*|kostnað\w*|ódýr\w*|krónu\w*)\b/iu,
      );
    }
  });
});

describe("the account deletion page (spec 32, section 5)", () => {
  it("has its own title and description, naming the app as the stores do", () => {
    expect(pageText(en, { kind: "deleteAccount" })).toEqual({
      title: "Delete your PuffinRide account · PuffinRide",
      description:
        "How to delete your PuffinRide account in the app or on the website, what we erase and what we keep, and for how long.",
    });
    expect(pageText(is, { kind: "deleteAccount" }).title).toBe(
      "Eyða PuffinRide-aðgangi · PuffinRide",
    );
  });

  it("names the places to go as the app names them, in both languages", () => {
    expect(deleteAccountPage.path).toBe("/delete-account");
    expect(deleteAccountSteps(en)[1]).toBe(
      `Open ${en("nav.profile")}, then ${en("settings.privacy")}.`,
    );
    expect(deleteAccountSteps(en)[2]).toContain(en("privacy.delete"));
    expect(deleteAccountSteps(is)[1]).toBe(
      `Opnaðu „${is("nav.profile")}“ og svo „${is("settings.privacy")}“.`,
    );
    expect(deleteAccountSteps(is)[2]).toContain(is("privacy.delete"));
  });

  it("gives the same address as About, and links to the Privacy Policy", () => {
    expect(deleteAccountPage.email).toBe(aboutPage.email);
    expect(deleteAccountPage.privacyPolicy.href).toBe("/legal/privacy");
    expect(aboutPage.deleteAccount).toEqual({
      label: "deleteAccount.link",
      href: "/delete-account",
    });
  });
});
