// What search engines may index, and what they read first (spec 23, 3.4 to
// 3.7): the public pages without a person's data, on production only; the
// page's head filled per request and language; robots.txt and the sitemap.
import { schema, type Database } from "@shareride/db";
import { legalDocumentTypes } from "@shareride/domain";
import { createTranslator, isLocale, locales, pickLocale, type Locale } from "@shareride/i18n";
import { and, asc, eq } from "drizzle-orm";

export interface SearchEngines {
  /** Search engines may index the public pages: production, with its address (R23.6). */
  readonly indexable: boolean;
  /** The web app's origin, such as https://puffinride.is, where it is known. */
  readonly siteOrigin: string | null;
}

/** Tests, development and any copy that is not production. */
export const notIndexed: SearchEngines = { indexable: false, siteOrigin: null };

/** The answer every address outside the public pages carries. */
export const noIndex = "noindex, nofollow";

const indexablePaths: readonly RegExp[] = [
  /^\/$/,
  /^\/meeting-points$/,
  /^\/meeting-points\/[^/]+$/,
  /^\/places\/[^/]+$/,
  /^\/legal$/,
  new RegExp(`^/legal/(${legalDocumentTypes.join("|")})$`),
  /^\/cookies$/,
];

/**
 * The web app's pages that hold no person's data (spec 23, 3.4). Trip pages,
 * results, All rides and people show first names and travel plans, and the
 * rest needs an account (R4.6, R23.6).
 */
export const isIndexablePath = (path: string): boolean =>
  indexablePaths.some((pattern) => pattern.test(path));

/** Whether an answer for this path may be indexed here. */
export const mayIndex = (engines: SearchEngines, path: string): boolean =>
  engines.indexable && isIndexablePath(path);

/**
 * robots.txt (3.7). Off production crawling stays allowed, so a crawler sees
 * the noindex on every answer and drops a copy it found, rather than
 * listing its address without the content.
 */
export function robotsTxt(engines: SearchEngines): string {
  if (!engines.indexable || engines.siteOrigin === null) {
    return "# Not PuffinRide's public site: every answer here is noindex (spec 23).\nUser-agent: *\nAllow: /\n";
  }
  return `# PuffinRide (spec 23, 3.7)\nUser-agent: *\nDisallow: /admin\n\nSitemap: ${engines.siteOrigin}/sitemap.xml\n`;
}

const escapeXml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

/** A page's address in a language, or the plain one that follows the browser. */
const addressOf = (origin: string, path: string, lang: Locale | null) =>
  `${origin}${path}${lang === null ? "" : `?lang=${lang}`}`;

/** Each page in Icelandic and in English, each naming both and the plain address (3.5). */
export function sitemapXml(origin: string, paths: readonly string[]): string {
  const urls = paths.flatMap((path) => {
    const alternates = [
      ...locales.map(
        (lang) =>
          `<xhtml:link rel="alternate" hreflang="${lang}" href="${escapeXml(addressOf(origin, path, lang))}"/>`,
      ),
      `<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(addressOf(origin, path, null))}"/>`,
    ].join("");
    return locales.map(
      (lang) => `<url><loc>${escapeXml(addressOf(origin, path, lang))}</loc>${alternates}</url>`,
    );
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

/** The pages of 3.4 that exist now: active meeting points and places, not the seed's samples. */
export async function publicPages(db: Database): Promise<string[]> {
  const { meetingPoints, places } = schema;
  const [points, placeRows] = await Promise.all([
    db
      .select({ id: meetingPoints.id })
      .from(meetingPoints)
      .where(and(eq(meetingPoints.status, "active"), eq(meetingPoints.sample, false)))
      .orderBy(asc(meetingPoints.nameIs)),
    db
      .select({ id: places.id })
      .from(places)
      .where(eq(places.sample, false))
      .orderBy(asc(places.nameIs)),
  ]);
  return [
    "/",
    "/meeting-points",
    ...points.map(({ id }) => `/meeting-points/${id}`),
    ...placeRows.map(({ id }) => `/places/${id}`),
    "/legal",
    ...legalDocumentTypes.map((type) => `/legal/${type}`),
    "/cookies",
  ];
}

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export interface PageRequest {
  readonly path: string;
  /** The address's `lang`, as given. */
  readonly lang: string | null;
  readonly acceptLanguage: string | null;
  /**
   * The locale Facebook's crawler asks a link's preview in, such as is_IS,
   * from its X-Facebook-Locale header or `fb_locale` (it asks again in each
   * `og:locale:alternate`).
   */
  readonly facebookLocale?: string | null;
}

export interface PageHead {
  readonly locale: Locale;
  /** Whether the language came from the browser or Facebook, so the answer varies with it. */
  readonly fromBrowser: boolean;
  readonly title: string;
  /** The tags to add, marked as the app's head component marks its own, so it replaces them. */
  readonly tags: string;
}

const ogLocales: Readonly<Record<Locale, string>> = { is: "is_IS", en: "en_GB" };

/** The language of a Facebook locale such as is_IS, if it is one of ours. */
function facebookLanguage(locale: string | null | undefined): Locale | null {
  const language = locale?.split("_")[0]?.toLowerCase() ?? "";
  return isLocale(language) ? language : null;
}

/** The languages of an Accept-Language header, best first. */
function languagesOf(header: string | null): string[] {
  if (header === null) return [];
  return header
    .split(",")
    .map((part) => {
      const [tag = "", ...parameters] = part.trim().split(";");
      const q = parameters.find((parameter) => parameter.trim().startsWith("q="));
      return { tag: tag.trim(), q: q === undefined ? 1 : Number(q.trim().slice(2)) };
    })
    .filter(({ tag, q }) => tag !== "" && Number.isFinite(q) && q > 0)
    .sort((a, b) => b.q - a.q)
    .map(({ tag }) => tag);
}

/**
 * What a crawler that does not run the app reads (3.6, item 2): the
 * language the address names, otherwise the one Facebook asks a link's
 * preview in, otherwise the browser's, as the app picks it; Find's title and description; on production, for a public page, its
 * canonical address and alternates; and the same link preview everywhere,
 * which names nobody (R23.7). The app's screens set their own once it runs.
 */
export function pageHead(request: PageRequest, engines: SearchEngines): PageHead {
  const named = request.lang !== null && isLocale(request.lang) ? request.lang : null;
  const locale =
    named ??
    facebookLanguage(request.facebookLocale) ??
    pickLocale(languagesOf(request.acceptLanguage));
  const t = createTranslator(locale);
  const title = t("seo.findTitle");
  const description = t("seo.findDescription");
  const meta = (attribute: "name" | "property", key: string, content: string) =>
    `<meta data-rh="true" ${attribute}="${key}" content="${escapeHtml(content)}">`;
  const link = (attributes: string) => `<link data-rh="true" ${attributes}>`;
  const tags = [
    meta("name", "description", description),
    meta("property", "og:type", "website"),
    meta("property", "og:site_name", t("app.name")),
    meta("property", "og:title", title),
    meta("property", "og:description", description),
    meta("property", "og:locale", ogLocales[locale]),
    ...locales
      .filter((other) => other !== locale)
      .map((other) => meta("property", "og:locale:alternate", ogLocales[other])),
    meta("name", "twitter:card", "summary_large_image"),
  ];
  const origin = engines.siteOrigin;
  if (origin !== null) {
    tags.push(
      meta("property", "og:image", `${origin}/share.png`),
      meta("property", "og:image:width", "1200"),
      meta("property", "og:image:height", "630"),
      meta("property", "og:image:alt", t("seo.shareImage")),
    );
  }
  if (origin !== null && mayIndex(engines, request.path)) {
    const canonical = addressOf(origin, request.path, named);
    tags.push(
      link(`rel="canonical" href="${escapeHtml(canonical)}"`),
      meta("property", "og:url", canonical),
      ...locales.map((lang) =>
        link(
          `rel="alternate" hreflang="${lang}" href="${escapeHtml(addressOf(origin, request.path, lang))}"`,
        ),
      ),
      link(
        `rel="alternate" hreflang="x-default" href="${escapeHtml(addressOf(origin, request.path, null))}"`,
      ),
    );
  }
  return { locale, fromBrowser: named === null, title, tags: tags.join("") };
}

/** The exported page with the head's language, title and tags. */
export function fillPage(html: string, head: PageHead): string {
  const withLanguage = /<html[^>]*>/.test(html)
    ? html.replace(/<html[^>]*>/, () => `<html lang="${head.locale}">`)
    : html;
  const title = `<title>${escapeHtml(head.title)}</title>${head.tags}`;
  return /<title>[^<]*<\/title>/.test(withLanguage)
    ? withLanguage.replace(/<title>[^<]*<\/title>/, () => title)
    : withLanguage.replace("</head>", () => `${title}</head>`);
}
