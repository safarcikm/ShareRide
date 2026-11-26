// What search engines may index, and what they read first (spec 23, 3.4 to
// 3.7): the public pages without a person's data, on production only; the
// page's head filled per request and language; robots.txt and the sitemap.
import { schema, type Database } from "@shareride/db";
import { legalDocumentTypes } from "@shareride/domain";
import {
  carpoolPage,
  createTranslator,
  isLocale,
  locales,
  pageText,
  pickLocale,
  type Locale,
  type PublicPage,
  type Translate,
} from "@shareride/i18n";
import { and, asc, eq } from "drizzle-orm";
import { rideCard, type Ride } from "./modules/search/link-preview.ts";

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
  /^\/carpool-iceland$/,
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

/**
 * The site's icons and link preview picture. Google shows a site's icon in
 * its results only when it may read the icon file, so on production these
 * carry no noindex either (spec 23, 3.6).
 */
const siteFiles: ReadonlySet<string> = new Set([
  "/favicon.ico",
  "/icon-192.png",
  "/apple-touch-icon.png",
  "/share.png",
]);

/** Whether an answer for this path may be indexed here. */
export const mayIndex = (engines: SearchEngines, path: string): boolean =>
  engines.indexable && (isIndexablePath(path) || siteFiles.has(path));

/**
 * The icons besides Expo's /favicon.ico (16 to 48 pixels): one of 192, a
 * multiple of 48 as Google asks for in its results, and the one a phone puts
 * on its home screen. Not marked for the app's head, which so leaves them.
 */
const iconLinks =
  '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">' +
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">';

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
    carpoolPage.path,
    "/meeting-points",
    ...points.map(({ id }) => `/meeting-points/${id}`),
    ...placeRows.map(({ id }) => `/places/${id}`),
    "/legal",
    ...legalDocumentTypes.map((type) => `/legal/${type}`),
    "/cookies",
  ];
}

/**
 * What a meeting point's or a place's address is about: its name, so the
 * first answer carries the page's own title (3.6, item 2); or `missing` for
 * one the sitemap does not list, which is kept out of the index.
 */
export type PageSubject =
  | {
      readonly kind: "meetingPoint" | "place";
      readonly name: Readonly<Record<Locale, string>>;
    }
  | { readonly kind: "missing" };

/** The subject of an address, or undefined for an address that has none. */
export type FindSubject = (path: string) => Promise<PageSubject | undefined>;

const subjectPaths = [
  { kind: "meetingPoint", pattern: /^\/meeting-points\/([^/]+)$/ },
  { kind: "place", pattern: /^\/places\/([^/]+)$/ },
] as const;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const missing: PageSubject = { kind: "missing" };

/** Looks up the subjects of 3.4's meeting point and place pages, as the sitemap lists them. */
export function subjectFinder(db: Database): FindSubject {
  const { meetingPoints, places } = schema;
  return async (path) => {
    for (const { kind, pattern } of subjectPaths) {
      const id = pattern.exec(path)?.[1];
      if (id === undefined) continue;
      if (!uuid.test(id)) return missing;
      const [row] =
        kind === "meetingPoint"
          ? await db
              .select({ nameIs: meetingPoints.nameIs, nameEn: meetingPoints.nameEn })
              .from(meetingPoints)
              .where(
                and(
                  eq(meetingPoints.id, id),
                  eq(meetingPoints.status, "active"),
                  eq(meetingPoints.sample, false),
                ),
              )
          : await db
              .select({ nameIs: places.nameIs, nameEn: places.nameEn })
              .from(places)
              .where(and(eq(places.id, id), eq(places.sample, false)));
      if (row === undefined) return missing;
      return { kind, name: { is: row.nameIs, en: row.nameEn ?? row.nameIs } };
    }
    return undefined;
  };
}

/** The page of 3.4 an address shows, for its title and description. */
function publicPageOf(path: string, subject: PageSubject | undefined, locale: Locale): PublicPage {
  if (subject !== undefined && subject.kind !== "missing") {
    return { kind: subject.kind, name: subject.name[locale] };
  }
  if (path === carpoolPage.path) return { kind: "carpool" };
  return path === "/meeting-points" ? { kind: "meetingPoints" } : { kind: "find" };
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
  /** The page's text for search engines that do not run the app, where it has one (3.9). */
  readonly noscript: string | null;
  /**
   * On the front page, the site's name for Google, which shows it above a
   * result (3.6, item 7): WebSite structured data, unmarked, so the app keeps it.
   */
  readonly website: string | null;
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
 * preview in, otherwise the browser's, as the app picks it; the page's own
 * title and description (Find's where it has none), and the words people
 * search with; on production, for a public page, its canonical address and
 * alternates; and the general link preview, or a shared ride's own card
 * (3.10), both naming nobody (R23.7, R23.8). The app's screens set the same
 * title once it runs.
 */
export function pageHead(
  request: PageRequest,
  engines: SearchEngines,
  subject?: PageSubject,
  ride?: Ride,
): PageHead {
  const named = request.lang !== null && isLocale(request.lang) ? request.lang : null;
  const locale =
    named ??
    facebookLanguage(request.facebookLocale) ??
    pickLocale(languagesOf(request.acceptLanguage));
  const t = createTranslator(locale);
  const { title, description } = pageText(t, publicPageOf(request.path, subject, locale));
  // A shared ride's link has a card of its own (3.10); every other address Find's.
  const card = ride === undefined ? undefined : rideCard(ride, locale);
  const preview = card ?? pageText(t, { kind: "find" });
  const meta = (attribute: "name" | "property", key: string, content: string) =>
    `<meta data-rh="true" ${attribute}="${key}" content="${escapeHtml(content)}">`;
  const link = (attributes: string) => `<link data-rh="true" ${attributes}>`;
  const tags = [
    meta("name", "description", description),
    meta("name", "keywords", t("seo.keywords")),
    meta("property", "og:type", "website"),
    meta("property", "og:site_name", t("app.name")),
    meta("property", "og:title", preview.title),
    meta("property", "og:description", preview.description),
    meta("property", "og:locale", ogLocales[locale]),
    ...locales
      .filter((other) => other !== locale)
      .map((other) => meta("property", "og:locale:alternate", ogLocales[other])),
    meta("name", "twitter:card", "summary_large_image"),
  ];
  const origin = engines.siteOrigin;
  if (origin !== null) {
    tags.push(
      meta("property", "og:image", `${origin}${card?.imagePath ?? "/share.png"}`),
      meta("property", "og:image:width", "1200"),
      meta("property", "og:image:height", "630"),
      meta("property", "og:image:alt", card?.imageAlt ?? t("seo.shareImage")),
    );
  }
  if (origin !== null && mayIndex(engines, request.path) && subject?.kind !== "missing") {
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
  const noscript =
    request.path === carpoolPage.path ? carpoolText(t, (path) => addressOf("", path, named)) : null;
  const website =
    origin !== null && request.path === "/" ? websiteData(t("app.name"), `${origin}/`) : null;
  return { locale, fromBrowser: named === null, title, tags: tags.join(""), noscript, website };
}

/**
 * The site's name as Google reads it from the home page (3.6, item 7), so a
 * result shows "PuffinRide" rather than the address. `<` is written as
 * `\u003c`, so nothing in it can close the script.
 */
function websiteData(name: string, url: string): string {
  const data = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url,
  }).replaceAll("<", "\\u003c");
  return `<script type="application/ld+json">${data}</script>`;
}

/**
 * Carpool in Iceland's text as HTML (3.9, item 5), from the texts the
 * screen shows; its links keep the language the address named.
 */
function carpoolText(t: Translate, address: (path: string) => string): string {
  const link = (path: string, label: string) =>
    `<a href="${escapeHtml(address(path))}">${escapeHtml(label)}</a>`;
  const paragraph = (text: string) => `<p>${text}</p>`;
  return [
    "<main>",
    `<h1>${escapeHtml(t(carpoolPage.title))}</h1>`,
    paragraph(escapeHtml(t(carpoolPage.intro))),
    paragraph(`${link("/", t("welcome.findRide"))} · ${link("/offer", t("driver.offerRide"))}`),
    ...carpoolPage.sections.flatMap((section) => [
      `<h2>${escapeHtml(t(section.heading))}</h2>`,
      ...section.paragraphs.map((key) => paragraph(escapeHtml(t(key)))),
      ...(section.questions ?? []).flatMap(({ question, answer }) => [
        `<h3>${escapeHtml(t(question))}</h3>`,
        paragraph(escapeHtml(t(answer))),
      ]),
      ...(section.link === undefined
        ? []
        : [paragraph(link(section.link.href, t(section.link.label)))]),
    ]),
    "</main>",
  ].join("");
}

/** The exported page with the head's language, title, icons, site name and tags, and its text where it has one. */
export function fillPage(html: string, head: PageHead): string {
  const withText =
    head.noscript === null
      ? html
      : html.replace(/<\/noscript>/, () => `${head.noscript ?? ""}</noscript>`);
  const withLanguage = /<html[^>]*>/.test(withText)
    ? withText.replace(/<html[^>]*>/, () => `<html lang="${head.locale}">`)
    : withText;
  const title = `<title>${escapeHtml(head.title)}</title>${iconLinks}${head.website ?? ""}${head.tags}`;
  return /<title>[^<]*<\/title>/.test(withLanguage)
    ? withLanguage.replace(/<title>[^<]*<\/title>/, () => title)
    : withLanguage.replace("</head>", () => `${title}</head>`);
}
