import { bodyOf, publishedVersions } from "@shareride/db/testing";
import { createTranslator, locales, type Locale } from "@shareride/i18n";
import { describe, expect, it } from "vitest";

// The legal texts say where in the app a thing is done. The app's places
// changed name once (spec 31: Settings went, its pages moved under Profile;
// spec 30: the page of terms, rules and privacy became About PuffinRide),
// and the texts kept the old names until a new version of each. These tests
// hold the newest version of each text to the names the app has now, so the
// next renaming fails here and not in front of a reader.
//
// The ways to sign in changed too (spec 26: a code by email, and a text
// message only to check a number; spec 27: a password, and Face ID or
// fingerprint), and the texts went on saying "a code sent to your phone". The
// second group holds them to the ways the sign-in screen offers.

type Named = "terms" | "privacy" | "community-rules";
const named = ["terms", "privacy", "community-rules"] as const satisfies readonly Named[];

const newest = (type: Named) =>
  publishedVersions
    .filter((version) => version.type === type)
    .reduce((last, version) => (version.version > last.version ? version : last));

const textOf = (type: Named, language: Locale) => bodyOf(newest(type), language);

/**
 * "in Profile, under Notifications", as the app's own texts say where a page
 * is. In Icelandic the place's name takes its case, "í Prófílnum", so it is
 * written out here, and a test below holds it to the name it is a case of.
 */
function places(language: Locale) {
  const t = createTranslator(language);
  const quoted = (name: string) => (language === "is" ? `„${name}“` : `"${name}"`);
  const inProfile = (page: string) =>
    language === "is" ? `í Prófílnum, undir ${page}` : `in ${t("nav.profile")}, under ${page}`;
  return {
    notifications: inProfile(t("settings.notifications")),
    privacy: inProfile(t("settings.privacy")),
    signInMethods: inProfile(t("settings.signInMethods")),
    cookies:
      language === "is"
        ? `síðunni ${t("cookies.title")}, undir ${t("about.title")}`
        : `the ${t("cookies.title")} page, under ${t("about.title")}`,
    notices:
      language === "is"
        ? `í appinu undir ${t("notices.title")}`
        : `in the app under ${t("notices.title")}`,
    ask: quoted(t("privacy.ask")),
    download: quoted(t("privacy.download")),
    delete: quoted(t("privacy.delete")),
    imHere: quoted(t("tripDay.imHere")),
  };
}

describe("where the newest legal texts send people (spec 31, 3.22)", () => {
  it("the Icelandic texts' „í Prófílnum“ is a case of the name Profile has in the app", () => {
    expect(createTranslator("is")("nav.profile")).toBe("Prófíll");
  });

  it("the Terms name the pages for notifications and for deleting an account as the app does", () => {
    for (const language of locales) {
      const place = places(language);
      const terms = textOf("terms", language);
      expect(terms, language).toContain(place.notifications);
      expect(terms, language).toContain(place.privacy);
    }
  });

  it("the Terms and the Community Rules name the page of notices, and the Terms the button at a meeting point, as the app does", () => {
    for (const language of locales) {
      const place = places(language);
      expect(textOf("terms", language), language).toContain(place.notices);
      expect(textOf("community-rules", language), language).toContain(place.notices);
      expect(textOf("terms", language), language).toContain(place.imHere);
    }
  });

  it("the Privacy Policy names the pages for one's data, the ways to sign in and cookies as the app does", () => {
    for (const language of locales) {
      const place = places(language);
      const privacy = textOf("privacy", language);
      expect(privacy, language).toContain(`${place.ask} ${place.privacy}`);
      expect(privacy, language).toContain(`${place.download} ${place.privacy}`);
      expect(privacy, language).toContain(`${place.delete} ${place.privacy}`);
      expect(privacy, language).toContain(place.signInMethods);
      expect(privacy, language).toContain(place.cookies);
    }
  });

  it("name no place the app no longer has: Settings, and the page of terms, rules and privacy", () => {
    const gone = [
      /\bSettings\b/,
      /stilling/i,
      "Terms, rules and privacy",
      "Skilmálar, reglur og persónuvernd",
    ];
    for (const type of named) {
      for (const language of locales) {
        for (const name of gone) {
          expect(textOf(type, language), `${type} (${language})`).not.toMatch(name);
        }
      }
    }
  });
});

describe("how the newest legal texts say you sign in (specs 26 and 27)", () => {
  /** The ways in, by the names the sign-in screen gives them. */
  function ways(language: Locale) {
    const t = createTranslator(language);
    return {
      password: t("auth.password").toLowerCase(),
      // In Icelandic the name takes its case after "með", "fingrafari", which
      // still holds the name as the app writes it.
      passkey: t("auth.passkey"),
    };
  }

  /** The first paragraph of a text that names Face ID or fingerprint: where it says how one signs in. */
  const paragraphOn = (text: string, name: string) =>
    text.split("\n\n").find((paragraph) => paragraph.includes(name)) ?? "";

  it("the Terms say a code by email signs you in, with a password and Face ID or fingerprint beside it, named as the app does", () => {
    const byEmail = {
      en: "You sign in with a code we send to your email address.",
      is: "Þú skráir þig inn með kóða sem við sendum á netfangið þitt.",
    };
    for (const language of locales) {
      const way = ways(language);
      const account = paragraphOn(textOf("terms", language), way.passkey);
      expect(account, language).toContain(byEmail[language]);
      expect(account, language).toContain(way.password);
    }
  });

  it("the Privacy Policy says in one place what is kept of a password and of Face ID or fingerprint, and where to remove them", () => {
    for (const language of locales) {
      const way = ways(language);
      const records = paragraphOn(textOf("privacy", language), way.passkey);
      expect(records, language).toContain(way.password);
      expect(records, language).toContain(places(language).signInMethods);
    }
  });

  it("say nowhere that a text message signs you in: no code sent to the phone to sign in, and no sign-in code by SMS", () => {
    const gone = [
      "a code sent to your phone",
      "kóða sem er sendur í símann þinn",
      // One sentence with both a sign-in code and SMS in it, as the old texts
      // had twice. It is a net for those words, not for every way of saying it:
      // the sentence the Terms must have, above, is what holds the rule.
      /sign-in codes?[^.]*\bSMS\b|\bSMS\b[^.]*sign-in codes?/i,
      /innskráningarkóð[^.]*\bSMS\b|\bSMS\b[^.]*innskráningarkóð/i,
    ];
    for (const type of named) {
      for (const language of locales) {
        for (const phrase of gone) {
          expect(textOf(type, language), `${type} (${language})`).not.toMatch(phrase);
        }
      }
    }
  });
});
