import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { createLogger } from "./logger.ts";
import {
  fillPage,
  isIndexablePath,
  pageHead,
  robotsTxt,
  sitemapXml,
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
  writeFileSync(join(dir, "share.png"), "picture");
  return dir;
}

function setup(searchEngines?: SearchEngines) {
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
  });
}

describe("which pages search engines may index (spec 23, 3.4)", () => {
  it("lists Find, the meeting points, the places, the legal texts and Cookies", () => {
    for (const path of [
      "/",
      "/meeting-points",
      "/meeting-points/0190a1d6-0000-7000-8000-0000000000d1",
      "/places/0190a1d6-0000-7000-8000-0000000000e1",
      "/legal",
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
    expect(head.title).toBe("PuffinRide · Samferða um Ísland: far og samakstur");
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

  it("off production, keeps every answer out of the index, the front page too", async () => {
    for (const engines of [staging, undefined]) {
      const app = setup(engines);
      for (const path of ["/", "/meeting-points", "/robots.txt", "/v1/health", "/share.png"]) {
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
