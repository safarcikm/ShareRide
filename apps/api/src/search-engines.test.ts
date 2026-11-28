import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { bodyOf, publishedVersions } from "@shareride/db/testing";
import type { MeetingPointSummary, NearestMeetingPoints } from "@shareride/contracts";
import {
  aboutPage,
  createTranslator,
  formatDistance,
  locales,
  socialProfiles,
  typeKeys,
} from "@shareride/i18n";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { createLogger } from "./logger.ts";
import { rideOf, type FindRide, type Ride } from "./modules/search/link-preview.ts";
import {
  fillPage,
  isIndexablePath,
  pageHead,
  robotsTxt,
  sitemapXml,
  type FindSubject,
  type PageFacts,
  type PageSubject,
  type SearchEngines,
} from "./search-engines.ts";

const site = "https://puffinride.is";
const production: SearchEngines = { indexable: true, siteOrigin: site };
const staging: SearchEngines = { indexable: false, siteOrigin: "https://staging.puffinride.is" };

/** The page `expo export --platform web` writes, as Expo's template has it. */
const exportedPage =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><title>PuffinRide</title>' +
  '<link rel="icon" href="/favicon.ico" /></head><body><div id="root"></div></body></html>';

function webApp(): string {
  const dir = mkdtempSync(join(tmpdir(), "puffinride-web-"));
  writeFileSync(join(dir, "index.html"), exportedPage);
  mkdirSync(join(dir, "_expo", "static", "js", "web"), { recursive: true });
  writeFileSync(join(dir, "_expo", "static", "js", "web", "entry-abc123.js"), "console.log(1);");
  for (const file of ["share.png", "favicon.ico", "icon-192.png", "apple-touch-icon.png"]) {
    writeFileSync(join(dir, file), "picture");
  }
  return dir;
}

function setup(searchEngines?: SearchEngines, findSubject?: FindSubject, findRide?: FindRide) {
  const destination = new Writable({
    write: (_chunk, _encoding, callback) => {
      callback();
    },
  });
  return createApp({
    logger: createLogger({ level: "silent", destination }),
    checkDatabase: () => Promise.resolve(),
    webAppDir: webApp(),
    ...(searchEngines === undefined ? {} : { searchEngines }),
    ...(findSubject === undefined ? {} : { findSubject }),
    ...(findRide === undefined ? {} : { findRide }),
  });
}

const tripId = "6f1c2f9e-3b1a-4c7d-9e2f-0a1b2c3d4e5f";

/** Selfoss to Vík on Friday 27 November 2026 at 09:00, by Hella. */
function sampleRide(): Ride {
  const stop = (is: string, en: string, plannedAt: string) => ({
    meetingPoint: { name: { is, en } },
    plannedAt,
  });
  const ride = rideOf({
    id: tripId,
    stops: [
      stop("Selfoss – Olís", "Selfoss – Olís", "2026-11-27T09:00:00.000Z"),
      stop("Hella – N1", "Hella – N1", "2026-11-27T09:40:00.000Z"),
      stop("Vík – N1", "Vík – N1", "2026-11-27T11:00:00.000Z"),
    ],
    part: { board: 0, alight: 2, state: "open" },
  });
  if (ride === undefined) throw new Error("no ride");
  return ride;
}

describe("which pages search engines may index (spec 23, 3.4)", () => {
  it("lists Find, Carpool in Iceland, About, deleting an account, the meeting points, the places, the legal texts and Cookies", () => {
    for (const path of [
      "/",
      "/carpool-iceland",
      "/about",
      "/delete-account",
      "/meeting-points",
      "/meeting-points/0190a1d6-0000-7000-8000-0000000000d1",
      "/places/0190a1d6-0000-7000-8000-0000000000e1",
      "/legal/terms",
      "/legal/community-rules",
      "/legal/privacy",
      "/cookies",
    ]) {
      expect(isIndexablePath(path), path).toBe(true);
    }
  });

  it("leaves out trips, results, people and everything behind sign-in", () => {
    for (const path of [
      "/trips/0190a1d6-0000-7000-8000-0000000000d1",
      "/search",
      "/search/results",
      "/rides",
      "/people/abc",
      "/sign-in",
      "/settings",
      "/my-rides",
      "/meeting-points/abc/problem",
      "/legal/unknown",
      // About's old address, which answers with a redirect (spec 30, 3.2).
      "/legal",
      "/admin",
      "/v1/meeting-points",
    ]) {
      expect(isIndexablePath(path), path).toBe(false);
    }
  });
});

describe("robots.txt (spec 23, 3.7)", () => {
  it("on production, allows all but the console and names the sitemap", () => {
    const text = robotsTxt(production);
    expect(text).toContain("User-agent: *\nDisallow: /admin\n");
    expect(text).toContain(`Sitemap: ${site}/sitemap.xml`);
  });

  it("elsewhere, allows crawling so the noindex on every answer is seen, and names no sitemap", () => {
    const text = robotsTxt(staging);
    expect(text).toContain("User-agent: *\nAllow: /\n");
    expect(text).not.toContain("Sitemap");
  });

  it("is served as text in every environment", async () => {
    const response = await setup(production).request("/robots.txt");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toContain("Sitemap: https://puffinride.is/sitemap.xml");
    expect(await (await setup().request("/robots.txt")).text()).toContain("Allow: /");
  });
});

describe("the sitemap (spec 23, 3.7)", () => {
  const xml = sitemapXml(site, ["/", "/meeting-points/abc"]);

  it("lists each page in Icelandic and English, each naming both and the plain address", () => {
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset /);
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    for (const lang of ["is", "en"]) {
      expect(xml).toContain(`<loc>${site}/meeting-points/abc?lang=${lang}</loc>`);
      expect(xml).toContain(`<loc>${site}/?lang=${lang}</loc>`);
    }
    expect(xml.match(/<url>/g)).toHaveLength(4);
    expect(xml).toContain(
      `<xhtml:link rel="alternate" hreflang="is" href="${site}/meeting-points/abc?lang=is"/>`,
    );
    expect(xml).toContain(
      `<xhtml:link rel="alternate" hreflang="en" href="${site}/meeting-points/abc?lang=en"/>`,
    );
    expect(xml).toContain(
      `<xhtml:link rel="alternate" hreflang="x-default" href="${site}/meeting-points/abc"/>`,
    );
  });

  it("is not there off production", async () => {
    expect((await setup(staging).request("/sitemap.xml")).status).toBe(404);
  });
});

describe("the page's head (spec 23, 3.6)", () => {
  it("is in the language the address asks for, with canonical and alternates on production", () => {
    const head = pageHead(
      { path: "/meeting-points", lang: "is", acceptLanguage: "en" },
      production,
    );
    expect(head.locale).toBe("is");
    expect(head.title).toBe("Mótsstaðir · PuffinRide");
    expect(head.tags).toContain(
      `<link data-rh="true" rel="canonical" href="${site}/meeting-points?lang=is">`,
    );
    expect(head.tags).toContain(
      `<link data-rh="true" rel="alternate" hreflang="en" href="${site}/meeting-points?lang=en">`,
    );
    expect(head.tags).toContain(
      `<link data-rh="true" rel="alternate" hreflang="x-default" href="${site}/meeting-points">`,
    );
    expect(head.tags).toContain('<meta data-rh="true" property="og:locale" content="is_IS">');
  });

  it("follows the browser's language without one, as the app does", () => {
    expect(
      pageHead({ path: "/", lang: null, acceptLanguage: "is-IS,is;q=0.9" }, production).locale,
    ).toBe("is");
    expect(pageHead({ path: "/", lang: null, acceptLanguage: "pl,de" }, production).locale).toBe(
      "en",
    );
    expect(pageHead({ path: "/", lang: "fr", acceptLanguage: null }, production).locale).toBe("en");
    expect(pageHead({ path: "/", lang: null, acceptLanguage: null }, production).tags).toContain(
      `<link data-rh="true" rel="canonical" href="${site}/">`,
    );
  });

  it("follows the locale Facebook asks a link's preview in (3.6, item 3)", () => {
    const facebook = (facebookLocale: string) =>
      pageHead(
        { path: "/trips/abc", lang: null, acceptLanguage: "en-US", facebookLocale },
        production,
      );
    expect(facebook("is_IS").locale).toBe("is");
    expect(facebook("is_IS").tags).toContain(
      '<meta data-rh="true" property="og:locale" content="is_IS">',
    );
    expect(facebook("en_GB").locale).toBe("en");
    expect(facebook("de_DE").locale).toBe("en");
    // The address's own language still wins.
    expect(
      pageHead({ path: "/", lang: "en", acceptLanguage: null, facebookLocale: "is_IS" }, production)
        .locale,
    ).toBe("en");
  });

  it("names no canonical address for a page that is not indexed, or off production", () => {
    expect(
      pageHead({ path: "/trips/abc", lang: null, acceptLanguage: null }, production).tags,
    ).not.toContain("canonical");
    expect(pageHead({ path: "/", lang: "en", acceptLanguage: null }, staging).tags).not.toContain(
      "canonical",
    );
  });

  it("names the words people search for a shared ride with, in the page's language", () => {
    const english = pageHead({ path: "/", lang: "en", acceptLanguage: null }, production);
    expect(english.tags).toMatch(
      /<meta data-rh="true" name="keywords" content="carpool, [^"]*ride share[^"]*">/,
    );
    const icelandic = pageHead({ path: "/", lang: "is", acceptLanguage: null }, production);
    expect(icelandic.tags).toMatch(
      /<meta data-rh="true" name="keywords" content="samferða, far, [^"]*samakstur[^"]*deila bíl[^"]*">/,
    );
  });

  it("gives every address the same preview, which names nobody (R23.7)", () => {
    const trip = pageHead({ path: "/trips/abc", lang: "en", acceptLanguage: null }, production);
    expect(trip.tags).toContain(
      '<meta data-rh="true" property="og:title" content="PuffinRide · Carpool and shared rides across Iceland">',
    );
    expect(trip.tags).toContain(
      `<meta data-rh="true" property="og:image" content="${site}/share.png">`,
    );
    expect(trip.tags).toContain(
      '<meta data-rh="true" name="twitter:card" content="summary_large_image">',
    );
    expect(trip.tags).toContain(
      '<meta data-rh="true" name="description" content="Carpool and ride share between towns',
    );
    expect(trip.tags).not.toContain("og:url");
  });

  it("fills the exported page's language, title and tags", () => {
    const head = pageHead({ path: "/", lang: "is", acceptLanguage: null }, production);
    const page = fillPage(exportedPage, head);
    expect(page).toContain('<html lang="is">');
    expect(page).toContain("<title>PuffinRide · Samferða um Ísland: far og samakstur</title>");
    expect(page).toContain(head.tags);
    expect(page.match(/<title>/g)).toHaveLength(1);
    expect(page).toContain('<div id="root"></div>');
  });

  it("gives a meeting point and a place their own title and description (3.6, item 2)", () => {
    const point = pageHead(
      { path: "/meeting-points/p1", lang: "en", acceptLanguage: null },
      production,
      { kind: "meetingPoint", name: { is: "Reynisfjara", en: "Reynisfjara beach" } },
    );
    expect(point.title).toBe("Reynisfjara beach: carpool meeting point · PuffinRide");
    expect(point.tags).toContain(
      '<meta data-rh="true" name="description" content="Reynisfjara beach: a PuffinRide meeting point, where drivers and passengers meet to carpool.">',
    );
    expect(point.tags).toContain(
      `<link data-rh="true" rel="canonical" href="${site}/meeting-points/p1?lang=en">`,
    );
    // The link preview stays the same for every address (3.6, item 4).
    expect(point.tags).toContain(
      '<meta data-rh="true" property="og:title" content="PuffinRide · Carpool and shared rides across Iceland">',
    );
    const place = pageHead({ path: "/places/p2", lang: "is", acceptLanguage: null }, production, {
      kind: "place",
      name: { is: "Akureyri", en: "Akureyri" },
    });
    expect(place.title).toBe("Akureyri: næstu mótsstaðir fyrir samakstur · PuffinRide");
  });

  it("names no canonical address for a meeting point or place that is not listed", () => {
    const head = pageHead(
      { path: "/meeting-points/gone", lang: "en", acceptLanguage: null },
      production,
      { kind: "missing" },
    );
    expect(head.title).toBe("PuffinRide · Carpool and shared rides across Iceland");
    expect(head.tags).not.toContain("canonical");
  });

  it("gives Carpool in Iceland its title, with the words people search for (3.9)", () => {
    const head = pageHead(
      { path: "/carpool-iceland", lang: "en", acceptLanguage: null },
      production,
    );
    expect(head.title).toBe("Carpool in Iceland: find or offer a ride · PuffinRide");
    expect(head.tags).toContain(
      `<link data-rh="true" rel="canonical" href="${site}/carpool-iceland?lang=en">`,
    );
  });

  it("writes Carpool in Iceland's text for search engines that do not run the app (3.9, item 5)", () => {
    const head = pageHead(
      { path: "/carpool-iceland", lang: "is", acceptLanguage: null },
      production,
    );
    const page = fillPage(
      exportedPage.replace(
        '<div id="root">',
        '<noscript> You need to enable JavaScript to run this app. </noscript><div id="root">',
      ),
      head,
    );
    const noscript = /<noscript>([\s\S]*)<\/noscript>/.exec(page)?.[1] ?? "";
    // Expo's sentence gives way to the page's own text (3.11, item 3).
    expect(noscript).not.toContain("You need to enable JavaScript to run this app.");
    expect(noscript.startsWith("<main><h1>Samferða um Ísland</h1>")).toBe(true);
    expect(noscript).toContain("<h2>Svona virkar þetta</h2>");
    expect(noscript).toContain("<h3>Er PuffinRide leigubíll?</h3>");
    expect(noscript).toContain("<h3>Hvað er PuffinRide?</h3>");
    expect(noscript).toContain("<h3>Hvað þýðir að vera samferða?</h3>");
    // Its links keep the language the address asked for.
    expect(noscript).toContain('<a href="/meeting-points?lang=is">Skoða mótsstaði</a>');
    expect(noscript).toContain('<a href="/legal/community-rules?lang=is">');
    // A page outside 3.4 keeps the export's own.
    const trip = fillPage(
      exportedPage.replace('<div id="root">', '<noscript>JS</noscript><div id="root">'),
      pageHead({ path: "/trips/abc", lang: "en", acceptLanguage: null }, production),
    );
    expect(trip).toContain("<noscript>JS</noscript>");
  });

  it("gives About its own title and canonical address (spec 30, 3.4)", () => {
    const head = pageHead({ path: "/about", lang: "en", acceptLanguage: null }, production);
    expect(head.title).toBe("About PuffinRide · PuffinRide");
    expect(head.tags).toContain(
      `<meta data-rh="true" name="description" content="Who runs PuffinRide, how to reach us, and PuffinRide's Terms of Service, Community Rules and Privacy Policy.">`,
    );
    expect(head.tags).toContain(
      `<link data-rh="true" rel="canonical" href="${site}/about?lang=en">`,
    );
  });

  it("writes About's text for search engines that do not run the app (spec 30, 3.4)", () => {
    const head = pageHead({ path: "/about", lang: "is", acceptLanguage: null }, production);
    const page = fillPage(
      exportedPage.replace('<div id="root">', '<noscript>JS</noscript><div id="root">'),
      head,
    );
    const noscript = /<noscript>([\s\S]*)<\/noscript>/.exec(page)?.[1] ?? "";
    expect(noscript).toContain("<h1>Um PuffinRide</h1>");
    expect(noscript).toContain("<h2>Skilmálar og reglur</h2>");
    expect(noscript).toContain('<a href="/legal/terms?lang=is">Notendaskilmálar</a>');
    expect(noscript).toContain('<a href="/cookies?lang=is">Vafrakökur</a>');
    expect(noscript).toContain('<a href="/carpool-iceland?lang=is">');
    expect(noscript).toContain(`<p>${createTranslator("is")(aboutPage.operator)}</p>`);
    expect(noscript).toContain('<a href="mailto:admin@puffinride.is">admin@puffinride.is</a>');
  });

  it("writes About's CO2 section with the operator's value, and none at 0 (spec 34, 3.9)", () => {
    const textOf = (gramsPerCarKm: number) => {
      const head = pageHead(
        { path: "/about", lang: "en", acceptLanguage: null },
        production,
        undefined,
        undefined,
        { gramsPerCarKm },
      );
      return head.noscript ?? "";
    };
    const page = textOf(150);
    expect(page).toContain('<h2 id="co2">What a shared ride saves</h2>');
    expect(page).toContain("Iceland: 150\u00a0g per kilometre.</p>");
    expect(page).toContain("so a passenger saves about 58\u00a0kg of CO₂");
    expect(page.indexOf('id="co2"')).toBeLessThan(page.indexOf("<h2>Terms and policies</h2>"));
    expect(textOf(0)).not.toContain('id="co2"');
  });

  it("links About to the page on deleting an account (spec 32, section 5)", () => {
    const head = pageHead({ path: "/about", lang: "en", acceptLanguage: null }, production);
    expect(head.noscript).toContain('<a href="/delete-account?lang=en">Delete your account</a>');
  });

  it("gives the account deletion page its own title and canonical address (spec 32, section 5)", () => {
    const head = pageHead(
      { path: "/delete-account", lang: "en", acceptLanguage: null },
      production,
    );
    expect(head.title).toBe("Delete your PuffinRide account · PuffinRide");
    expect(head.tags).toContain(
      `<meta data-rh="true" name="description" content="How to delete your PuffinRide account in the app or on the website, what we erase and what we keep, and for how long.">`,
    );
    expect(head.tags).toContain(
      `<link data-rh="true" rel="canonical" href="${site}/delete-account?lang=en">`,
    );
  });

  it("writes the account deletion page for search engines and for Google Play's check, which run no app", () => {
    const head = pageHead(
      { path: "/delete-account", lang: "is", acceptLanguage: null },
      production,
    );
    const page = fillPage(
      exportedPage.replace('<div id="root">', '<noscript>JS</noscript><div id="root">'),
      head,
    );
    const noscript = /<noscript>([\s\S]*)<\/noscript>/.exec(page)?.[1] ?? "";
    expect(noscript).toContain("<h1>Eyða PuffinRide-aðgangi</h1>");
    expect(noscript).toContain(
      "<ol><li>Skráðu þig inn í PuffinRide, í appinu eða á puffinride.is.</li>",
    );
    expect(noscript).toContain("<li>Opnaðu „Prófíll“ og svo „Persónuvernd og gögnin þín“.</li>");
    expect(noscript).toContain("<h2>Það sem við eyðum</h2>");
    expect(noscript).toContain("<h2>Það sem við geymum, og hve lengi</h2>");
    expect(noscript).toContain('<a href="/sign-in?lang=is">Skrá inn</a>');
    expect(noscript).toContain('<a href="/legal/privacy?lang=is">');
    expect(noscript).toContain('<a href="mailto:admin@puffinride.is">admin@puffinride.is</a>');
  });

  it("says who runs PuffinRide on About as the newest Terms do (R30.2)", () => {
    const newest = publishedVersions
      .filter((version) => version.type === "terms")
      .reduce((last, version) => (version.version > last.version ? version : last));
    for (const language of locales) {
      const operator = createTranslator(language)(aboutPage.operator).replace(/\.$/, "");
      expect(bodyOf(newest, language), language).toContain(operator);
    }
  });

  it("tells Google on the front page who we are, which the app keeps (3.6, items 7 and 8)", () => {
    const siteData = (page: string): unknown => {
      const found = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(page);
      return found?.[1] === undefined ? null : JSON.parse(found[1]);
    };
    const expected = (description: string) => ({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": `${site}/#website`,
          name: "PuffinRide",
          alternateName: "Puffin Ride",
          url: `${site}/`,
          inLanguage: ["is", "en"],
          publisher: { "@id": `${site}/#organization` },
        },
        {
          "@type": "Organization",
          "@id": `${site}/#organization`,
          name: "PuffinRide",
          alternateName: "Puffin Ride",
          url: `${site}/`,
          logo: `${site}/icon-192.png`,
          description,
          email: "admin@puffinride.is",
          sameAs: [
            "https://www.facebook.com/profile.php?id=61597055066444",
            "https://www.instagram.com/puffinride.is/",
          ],
        },
      ],
    });
    const front = (lang: string | null) =>
      fillPage(exportedPage, pageHead({ path: "/", lang, acceptLanguage: null }, production));
    // In the page's language: English when nothing names one.
    for (const lang of [null, "en"]) {
      expect(siteData(front(lang)), String(lang)).toEqual(
        expected(
          "PuffinRide is carpooling across Iceland. Drivers who are making a trip anyway offer the empty seats in their car, and passengers book a seat for the whole way or part of it, from one meeting point to another.",
        ),
      );
    }
    expect(siteData(front("is"))).toEqual(expected(createTranslator("is")("about.intro")));
    // Unmarked, so the app's head keeps it.
    expect(front("en")).toContain('<script type="application/ld+json">{');
    // Only the front page: Google reads a site's name from its home page.
    for (const path of ["/meeting-points", "/carpool-iceland", "/about", "/legal/terms"]) {
      const page = fillPage(
        exportedPage,
        pageHead({ path, lang: null, acceptLanguage: null }, production),
      );
      expect(page, path).not.toContain("application/ld+json");
    }
  });

  it("escapes what it writes into the page", () => {
    const head = pageHead(
      { path: '/meeting-points/"><script>$&', lang: null, acceptLanguage: null },
      production,
    );
    const page = fillPage(exportedPage, head);
    expect(page).not.toContain("<script>");
    expect(page).toContain("/meeting-points/&quot;&gt;&lt;script&gt;$&amp;");
  });
});

/** A meeting point as the service lists it, at Selfoss unless told otherwise. */
function summaryOf(
  id: string,
  name: string,
  more: Partial<MeetingPointSummary> = {},
): MeetingPointSummary {
  return {
    id,
    name: { is: name, en: name },
    region: "south",
    municipality: "Árborg",
    type: "fuel-station",
    amenities: [],
    position: { latitude: 63.94, longitude: -21.0 },
    status: "active",
    season: null,
    pauseReason: null,
    sample: false,
    ...more,
  };
}

/** The text a page of 3.4 has before the app runs, in the language asked for. */
function textOf(path: string, lang: "is" | "en", facts: PageFacts = {}, subject?: PageSubject) {
  const head = pageHead(
    { path, lang, acceptLanguage: null },
    production,
    subject,
    undefined,
    facts,
  );
  const page = fillPage(
    exportedPage.replace(
      '<div id="root">',
      '<noscript> You need to enable JavaScript to run this app. </noscript><div id="root">',
    ),
    head,
  );
  return /<noscript>([\s\S]*)<\/noscript>/.exec(page)?.[1] ?? "";
}

describe("every public page's text before the app runs (spec 23, 3.11)", () => {
  it("writes Find's title, line, how it works and links, and no ride", () => {
    const text = textOf("/", "is");
    const is = createTranslator("is");
    expect(text.startsWith("<main><h1>Verum samferða</h1>")).toBe(true);
    expect(text).toContain(`<p>${is("home.intro")}</p>`);
    expect(text).toContain('<a href="/offer?lang=is">Bjóða far</a>');
    expect(text).toContain(`<h2>${is("home.how.title")}</h2>`);
    for (const key of [
      "home.how.find",
      "home.how.book",
      "home.how.meet",
      "home.how.offer",
    ] as const) {
      expect(text).toContain(is(key));
    }
    expect(text).toContain(`<a href="/carpool-iceland?lang=is">${is("home.howItWorks")}</a>`);
    expect(text).toContain(`<a href="/meeting-points?lang=is">${is("meetingPoints.open")}</a>`);
    // The rides name their drivers: never in the text (decision 13, R23.9).
    expect(text).not.toContain(is("welcome.soon"));
    expect(text).not.toContain("/trips/");
  });

  it("ends every page's text with the footer's links and a line on JavaScript, not Expo's sentence", () => {
    const en = createTranslator("en");
    for (const path of [
      "/",
      "/carpool-iceland",
      "/about",
      "/delete-account",
      "/meeting-points",
      "/cookies",
    ]) {
      const text = textOf(path, "en", { content: { kind: "meetingPoints", points: [] } });
      expect(text, path).not.toContain("You need to enable JavaScript to run this app.");
      const footer = /<footer>([\s\S]*)<\/footer>/.exec(text)?.[1] ?? "";
      for (const [href, label] of [
        ["/about?lang=en", "About PuffinRide"],
        ["/carpool-iceland?lang=en", "Carpool in Iceland"],
        ["/meeting-points?lang=en", "Meeting points"],
        ["/legal/terms?lang=en", "Terms of Service"],
        ["/legal/community-rules?lang=en", "Community Rules"],
        ["/legal/privacy?lang=en", "Privacy Policy"],
        ["/cookies?lang=en", "Cookies"],
        ["mailto:admin@puffinride.is", "admin@puffinride.is"],
        [socialProfiles.facebook, en("about.facebook")],
        [socialProfiles.instagram, en("about.instagram")],
      ] as const) {
        expect(footer, `${path} ${href}`).toContain(`<a href="${href}">${label}</a>`);
      }
      // The export's style keeps the body from scrolling, for the app's own scroll views:
      // without the app, the text scrolls.
      expect(
        text.endsWith(
          `</footer><p>${en("seo.needsJavaScript")}</p><style>body{overflow:auto}</style>`,
        ),
        path,
      ).toBe(true);
    }
    expect(createTranslator("is")("seo.needsJavaScript")).toBe(
      "Til að finna, bjóða og bóka far þarf JavaScript að vera virkt.",
    );
  });

  it("writes the active meeting points by region, as the list shows them, each a link", () => {
    const points = [
      summaryOf("p-vik", "Vík – N1", { municipality: "Mýrdalshreppur" }),
      summaryOf("p-hlemmur", "Hlemmur", {
        region: "capital",
        municipality: "Reykjavík",
        type: "bus-hub",
      }),
      summaryOf("p-hella", "Hella – Olís", { municipality: "Rangárþing ytra" }),
      summaryOf("p-paused", "Lokað", { status: "paused" }),
      summaryOf("p-sample", "Sýnishorn", { sample: true }),
    ];
    const text = textOf("/meeting-points", "en", { content: { kind: "meetingPoints", points } });
    expect(text.startsWith("<main><h1>Meeting points</h1>")).toBe(true);
    expect(text).toContain("<p>Passengers get in and out only at these public places.</p>");
    // Regions in the list's order, names in the language's order within each.
    const order = [
      "<h2>Capital area</h2>",
      "Hlemmur",
      "<h2>South</h2>",
      "Hella – Olís",
      "Vík – N1",
    ];
    const at = order.map((part) => text.indexOf(part));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(text).toContain(
      '<li><a href="/meeting-points/p-hlemmur?lang=en">Hlemmur</a>: Bus hub · Reykjavík</li>',
    );
    // As the sitemap: no paused point or sample (3.11, item 6).
    expect(text).not.toContain("Lokað");
    expect(text).not.toContain("Sýnishorn");
  });

  it("writes no text for the meeting points when they cannot be read", () => {
    const head = pageHead(
      { path: "/meeting-points", lang: "en", acceptLanguage: null },
      production,
    );
    expect(head.noscript).toBeNull();
  });

  it("writes the text into the body's noscript, never one in the head", () => {
    const head = pageHead({ path: "/cookies", lang: "en", acceptLanguage: null }, production);
    const page = fillPage(
      exportedPage
        .replace("</head>", "<noscript><style>.x{}</style></noscript></head>")
        .replace('<div id="root">', '<noscript>JS</noscript><div id="root">'),
      head,
    );
    expect(page).toContain("<noscript><style>.x{}</style></noscript>");
    expect(page).not.toContain("<noscript>JS</noscript>");
    expect(page.indexOf("<main>")).toBeGreaterThan(page.indexOf("<body>"));
  });

  it("writes a meeting point's and a place's text whatever the case of the address's ID", () => {
    const point = {
      ...summaryOf("3f2504e0-4f89-41d3-9a0c-0305e82c3301", "N1"),
      aliases: [],
      whereToStand: null,
      pausedUntil: null,
      lastCheckedOn: null,
    };
    const text = textOf(
      "/meeting-points/3F2504E0-4F89-41D3-9A0C-0305E82C3301",
      "en",
      { content: { kind: "meetingPoint", point } },
      { kind: "meetingPoint", name: point.name },
    );
    expect(text.startsWith("<main><h1>N1</h1>")).toBe(true);
  });

  it("writes a meeting point's details, without its photos", () => {
    const point = {
      ...summaryOf("p-hella", "Hella – Olís", {
        name: { is: "Hella – Olís", en: "Hella – Olís station" },
        municipality: "Rangárþing ytra",
        amenities: ["toilets", "shop"],
        season: { startMonth: 5, endMonth: 9 },
      }),
      aliases: ["Olís Hellu"],
      whereToStand: { is: "Við dælurnar.", en: "By the pumps." },
      pausedUntil: null,
      lastCheckedOn: "2026-11-20",
    };
    const subject: PageSubject = { kind: "meetingPoint", name: point.name };
    const text = textOf(
      "/meeting-points/p-hella",
      "en",
      { content: { kind: "meetingPoint", point } },
      subject,
    );
    expect(text.startsWith("<main><h1>Hella – Olís station</h1>")).toBe(true);
    expect(text).toContain("<p>Fuel station · Rangárþing ytra, South</p>");
    expect(text).toContain("<p>Hella – Olís</p>");
    expect(text).toContain("<p>Also known as Olís Hellu</p>");
    expect(text).toContain("<h2>Where to stand</h2><p>By the pumps.</p>");
    expect(text).toContain("<h2>Amenities</h2><ul><li>Toilets</li><li>Shop</li></ul>");
    expect(text).toContain("<p>In use from May to September</p>");
    expect(text).toContain("<p>Last checked 20 November 2026</p>");
    expect(text).toContain('<a href="/meeting-points?lang=en">Meeting points</a>');
    expect(text).not.toContain("<img");
  });

  it("writes no text for a meeting point or place the sitemap leaves out (3.11, item 6)", () => {
    const point = {
      ...summaryOf("p", "Lokað", { status: "paused" }),
      aliases: [],
      whereToStand: null,
      pausedUntil: null,
      lastCheckedOn: null,
    };
    const head = pageHead(
      { path: "/meeting-points/p", lang: "en", acceptLanguage: null },
      production,
      { kind: "missing" },
      undefined,
      { content: { kind: "meetingPoint", point } },
    );
    expect(head.noscript).toBeNull();
  });

  it("writes a place's nearest meeting points with their distance, each a link", () => {
    const nearest: NearestMeetingPoints = {
      place: { id: "pl", name: { is: "Hella", en: "Hella" }, kind: "village", region: "south" },
      withinReach: true,
      meetingPoints: [
        {
          meetingPoint: summaryOf("p-hella", "Hella – Olís", { municipality: "Rangárþing ytra" }),
          distanceM: 400,
        },
        {
          meetingPoint: summaryOf("p-hvols", "Hvolsvöllur – N1", {
            municipality: "Rangárþing eystra",
          }),
          distanceM: 12400,
        },
      ],
    };
    const subject: PageSubject = { kind: "place", name: nearest.place.name };
    const text = textOf("/places/pl", "is", { content: { kind: "place", nearest } }, subject);
    const is = createTranslator("is");
    expect(text.startsWith("<main><h1>Hella</h1>")).toBe(true);
    expect(text).toContain(`<h2>${is("search.nearest")}</h2>`);
    const summary = is("meetingPoints.summary", {
      type: is(typeKeys["fuel-station"]),
      municipality: "Rangárþing ytra",
    });
    const away = is("search.distanceAway", { distance: formatDistance(400, "is") });
    expect(text).toContain(
      `<li><a href="/meeting-points/p-hella?lang=is">Hella – Olís</a>: ${away}, ${summary}</li>`,
    );
    expect(text.indexOf("Hella – Olís")).toBeLessThan(text.indexOf("Hvolsvöllur – N1"));
    expect(text).not.toContain(is("search.noneWithinReach"));
    const far = textOf(
      "/places/pl",
      "en",
      { content: { kind: "place", nearest: { ...nearest, withinReach: false } } },
      subject,
    );
    expect(far).toContain(createTranslator("en")("search.noneWithinReach"));
  });

  it("writes a legal document's whole text: headings, paragraphs, lists and bold, escaped", () => {
    const document = {
      version: 4,
      texts: {
        is: { title: "Notendaskilmálar", body: "# Inngangur\n\nTexti." },
        en: {
          title: "Terms of Service",
          body: "# 1. Who we are\n\nPuffinRide is run by **Martin**, <b>not</b> a company yet.\n\n- one\n- two & three",
        },
      },
    };
    const text = textOf("/legal/terms", "en", { content: { kind: "legal", document } });
    expect(text.startsWith("<main><h1>Terms of Service</h1><p>Version 4</p>")).toBe(true);
    expect(text).toContain("<h2>1. Who we are</h2>");
    expect(text).toContain(
      "<p>PuffinRide is run by <strong>Martin</strong>, &lt;b&gt;not&lt;/b&gt; a company yet.</p>",
    );
    expect(text).toContain("<ul><li>one</li><li>two &amp; three</li></ul>");
    expect(textOf("/legal/terms", "is", { content: { kind: "legal", document } })).toContain(
      "<h1>Notendaskilmálar</h1><p>Útgáfa 4</p><h2>Inngangur</h2><p>Texti.</p>",
    );
  });

  it("writes Cookies, saying whether visits are counted", () => {
    const en = createTranslator("en");
    const counted = textOf("/cookies", "en", { countsVisits: true });
    expect(counted.startsWith("<main><h1>Cookies</h1>")).toBe(true);
    expect(counted).toContain(`<p>${en("cookies.needed")}</p>`);
    expect(counted).toContain(`<p>${en("cookies.analyticsHelp")}</p>`);
    expect(counted).toContain(`<a href="/legal/privacy?lang=en">${en("legal.readPrivacy")}</a>`);
    expect(textOf("/cookies", "en")).toContain(`<p>${en("cookies.none")}</p>`);
  });
});

describe("a shared ride's own card (spec 23, 3.10)", () => {
  it("names the ride and points at its picture, in the language asked for", () => {
    const head = pageHead(
      { path: `/trips/${tripId}`, lang: null, acceptLanguage: null, facebookLocale: "is_IS" },
      production,
      undefined,
      sampleRide(),
    );
    expect(head.tags).toContain(
      '<meta data-rh="true" property="og:title" content="Selfoss – Olís → Vík – N1 · fös. 27. nóv. kl. 09:00">',
    );
    expect(head.tags).toContain(
      '<meta data-rh="true" property="og:description" content="Far á PuffinRide, samferða um Ísland. Sjáðu ferðina og bókaðu sæti.">',
    );
    expect(head.tags).toMatch(
      new RegExp(
        `<meta data-rh="true" property="og:image" content="${site}/v1/trips/${tripId}/preview\\.png\\?fromStop=0&amp;toStop=2&amp;lang=is&amp;v=[0-9a-f]{12}">`,
      ),
    );
    expect(head.tags).toContain(
      '<meta data-rh="true" property="og:image:alt" content="Selfoss – Olís → Vík – N1, föstudagur 27. nóvember kl. 09:00, á PuffinRide">',
    );
    expect(head.tags).not.toContain("/share.png");
    expect(head.tags).not.toContain("og:url");
  });

  it("keeps the page's own title and the search words", () => {
    const head = pageHead(
      { path: `/trips/${tripId}`, lang: "en", acceptLanguage: null },
      production,
      undefined,
      sampleRide(),
    );
    expect(head.title).toBe("PuffinRide · Carpool and shared rides across Iceland");
    expect(head.tags).toContain('name="keywords"');
  });

  it("writes the card into the first answer of a trip's page", async () => {
    const asked: string[] = [];
    const findRide: FindRide = (path, query) => {
      asked.push(`${path}?from=${query("from") ?? ""}&to=${query("to") ?? ""}`);
      return Promise.resolve(path === `/trips/${tripId}` ? sampleRide() : undefined);
    };
    const app = setup(production, undefined, findRide);
    const page = await (await app.request(`/trips/${tripId}?from=0&to=2&lang=en`)).text();
    expect(page).toContain(
      '<meta data-rh="true" property="og:title" content="Selfoss – Olís → Vík – N1 · Fri 27 Nov at 09:00">',
    );
    expect(asked).toEqual([`/trips/${tripId}?from=0&to=2`]);
    const other = await (await app.request("/trips/other?lang=en")).text();
    expect(other).toContain(
      `<meta data-rh="true" property="og:image" content="${site}/share.png">`,
    );
  });
});

describe("the web app for search engines", () => {
  it("serves the filled page, in the language asked for", async () => {
    const response = await setup(production).request("/meeting-points?lang=is");
    expect(response.status).toBe(200);
    const page = await response.text();
    expect(page).toContain('<html lang="is">');
    expect(page).toContain(`rel="canonical" href="${site}/meeting-points?lang=is"`);
    expect(response.headers.get("x-robots-tag")).toBeNull();
  });

  it("answers Facebook's crawler in the locale it asks for, by header or address", async () => {
    const app = setup(production);
    const byHeader = await app.request("/", { headers: { "X-Facebook-Locale": "is_IS" } });
    expect(await byHeader.text()).toContain(
      "<title>PuffinRide · Samferða um Ísland: far og samakstur</title>",
    );
    expect(byHeader.headers.get("vary")).toContain("X-Facebook-Locale");
    const byAddress = await app.request("/trips/abc?fb_locale=is_IS");
    expect(await byAddress.text()).toContain('<html lang="is">');
  });

  it("says the page depends on the browser's language when the address does not name one", async () => {
    const app = setup(production);
    expect((await app.request("/")).headers.get("vary")).toContain("Accept-Language");
    expect((await app.request("/?lang=en")).headers.get("vary") ?? "").not.toContain(
      "Accept-Language",
    );
  });

  it("on production, keeps every other answer out of the index (R23.6, R4.6)", async () => {
    const app = setup(production);
    for (const path of [
      "/trips/abc",
      "/search/results",
      "/rides",
      "/sign-in",
      "/v1/health",
      "/admin",
    ]) {
      expect((await app.request(path)).headers.get("x-robots-tag"), path).toBe("noindex, nofollow");
    }
    for (const path of ["/", "/legal/privacy", "/places/abc"]) {
      expect((await app.request(path)).headers.get("x-robots-tag"), path).toBeNull();
    }
  });

  it("writes a meeting point's own title into the first answer", async () => {
    const app = setup(production, (path) =>
      Promise.resolve(
        path === "/meeting-points/p1"
          ? { kind: "meetingPoint", name: { is: "Hlemmur", en: "Hlemmur" } }
          : undefined,
      ),
    );
    const response = await app.request("/meeting-points/p1?lang=en");
    expect(await response.text()).toContain(
      "<title>Hlemmur: carpool meeting point · PuffinRide</title>",
    );
    expect(response.headers.get("x-robots-tag")).toBeNull();
  });

  it("still serves a page whose text cannot be read, without the text (3.11)", async () => {
    const app = createApp({
      logger: createLogger({
        level: "silent",
        destination: new Writable({
          write: (_c, _e, done) => {
            done();
          },
        }),
      }),
      checkDatabase: () => Promise.resolve(),
      webAppDir: webApp(),
      searchEngines: production,
      findContent: () => Promise.reject(new Error("the database is away")),
    });
    const response = await app.request("/legal/terms?lang=en");
    expect(response.status).toBe(200);
    const page = await response.text();
    expect(page).toContain("<title>");
    expect(page).not.toContain("<main>");
  });

  it("keeps a meeting point or place that is not listed out of the index", async () => {
    const app = setup(production, () => Promise.resolve({ kind: "missing" }));
    for (const path of ["/meeting-points/gone", "/places/gone"]) {
      expect((await app.request(path)).headers.get("x-robots-tag"), path).toBe("noindex, nofollow");
    }
  });

  it("on production, lets Google read the site's icons and preview picture, to show our icon", async () => {
    const app = setup(production);
    for (const path of ["/favicon.ico", "/icon-192.png", "/apple-touch-icon.png", "/share.png"]) {
      expect((await app.request(path)).headers.get("x-robots-tag"), path).toBeNull();
    }
  });

  it("links a sharp icon for Google and the phones' home screens, which the app keeps", async () => {
    const page = await (await setup(production).request("/")).text();
    expect(page).toContain(
      '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">',
    );
    expect(page).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
  });

  it("off production, keeps every answer out of the index, the front page too", async () => {
    for (const engines of [staging, undefined]) {
      const app = setup(engines);
      for (const path of [
        "/",
        "/meeting-points",
        "/robots.txt",
        "/v1/health",
        "/share.png",
        "/favicon.ico",
      ]) {
        expect((await app.request(path)).headers.get("x-robots-tag"), path).toBe(
          "noindex, nofollow",
        );
      }
    }
  });

  it("serves the preview picture from the export", async () => {
    const response = await setup(production).request("/share.png");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
  });
});
