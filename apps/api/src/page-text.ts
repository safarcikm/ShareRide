// Each public page's text for readers that do not run the app (spec 23,
// 3.9 item 5 and 3.11): the first answer's <noscript>, from the texts and
// data its screen shows, in the page's language. Never a ride or a person.
import type {
  MeetingPointDetails,
  MeetingPointSummary,
  NearestMeetingPoints,
} from "@shareride/contracts";
import { legalDocumentTypes, regions } from "@shareride/domain";
import {
  aboutCo2Values,
  aboutPage,
  amenityKeys,
  carpoolPage,
  deleteAccountPage,
  deleteAccountSteps,
  formatDate,
  formatDistance,
  placeKindKeys,
  regionKeys,
  seasonText,
  socialProfiles,
  typeKeys,
  type Locale,
  type MessageKey,
  type Translate,
} from "@shareride/i18n";
import type { LegalService } from "./modules/legal/index.ts";
import type { MeetingPointService } from "./modules/meeting-points/service.ts";

export const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** A legal document's current version, in both languages. */
export interface LegalContent {
  readonly version: number;
  readonly texts: Readonly<Record<Locale, { readonly title: string; readonly body: string }>>;
}

/** What a page of 3.4 shows from the database, for its text (3.11). */
export type PageContent =
  | { readonly kind: "meetingPoints"; readonly points: readonly MeetingPointSummary[] }
  | { readonly kind: "meetingPoint"; readonly point: Omit<MeetingPointDetails, "photos"> }
  | { readonly kind: "place"; readonly nearest: NearestMeetingPoints }
  | { readonly kind: "legal"; readonly document: LegalContent };

/** The content of an address, or undefined for one that has none. */
export type FindContent = (path: string) => Promise<PageContent | undefined>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isLegalType = (type: string): type is (typeof legalDocumentTypes)[number] =>
  (legalDocumentTypes as readonly string[]).includes(type);

/** Reads a page's content with the services its screen calls (3.11). */
export function contentFinder(services: {
  readonly meetingPoints: Pick<MeetingPointService, "list" | "details" | "nearest">;
  readonly legal: Pick<LegalService, "currentDocument">;
}): FindContent {
  const { meetingPoints, legal } = services;
  return async (path) => {
    if (path === "/meeting-points") {
      return { kind: "meetingPoints", points: await meetingPoints.list() };
    }
    const pointId = /^\/meeting-points\/([^/]+)$/.exec(path)?.[1];
    if (pointId !== undefined) {
      const point = uuid.test(pointId) ? await meetingPoints.details(pointId) : undefined;
      return point === undefined ? undefined : { kind: "meetingPoint", point };
    }
    const placeId = /^\/places\/([^/]+)$/.exec(path)?.[1];
    if (placeId !== undefined) {
      const nearest = uuid.test(placeId) ? await meetingPoints.nearest(placeId) : undefined;
      return nearest === undefined ? undefined : { kind: "place", nearest };
    }
    const type = /^\/legal\/([^/]+)$/.exec(path)?.[1];
    if (type !== undefined && isLegalType(type)) {
      const document = await legal.currentDocument(type);
      return document === undefined
        ? undefined
        : { kind: "legal", document: { version: document.version, texts: document.texts } };
    }
    return undefined;
  };
}

/** What the server knows of a page besides its address. */
export interface PageFacts {
  /** The operator's grams of CO2 per car km, for About's section; 0 leaves it out (spec 34, 3.9). */
  readonly gramsPerCarKm?: number | undefined;
  /** What the page shows from the database (3.11). */
  readonly content?: PageContent | undefined;
  /** Whether this site counts visits with Google Analytics, for Cookies (3.2). */
  readonly countsVisits?: boolean | undefined;
}

/** How a text writes its parts, with its links in the language the address named. */
interface Writer {
  readonly t: Translate;
  readonly locale: Locale;
  readonly link: (path: string, label: string) => string;
}

const paragraph = (html: string) => `<p>${html}</p>`;
const text = (words: string) => paragraph(escapeHtml(words));
const heading = (level: 1 | 2 | 3, words: string) =>
  `<h${String(level)}>${escapeHtml(words)}</h${String(level)}>`;
const list = (tag: "ol" | "ul", items: readonly string[]) =>
  `<${tag}>${items.map((item) => `<li>${item}</li>`).join("")}</${tag}>`;
const outsideLink = (href: string, label: string) =>
  `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;

/**
 * The page's whole text for readers that do not run the app (3.11): its
 * main part, the footer's links, and the line on JavaScript, which takes
 * the place of Expo's sentence; null for a page without one, such as a
 * meeting point or place the sitemap does not list (item 6).
 */
export function pageBody(page: {
  readonly path: string;
  readonly t: Translate;
  readonly locale: Locale;
  /** A path with the language the address named, if it named one. */
  readonly address: (path: string) => string;
  /** False for a meeting point or place the sitemap does not list. */
  readonly listed: boolean;
  readonly facts: PageFacts;
}): string | null {
  const { t, locale, address, facts } = page;
  const writer: Writer = {
    t,
    locale,
    link: (path, label) => outsideLink(address(path), label),
  };
  const main = page.listed ? mainText(page.path, writer, facts) : null;
  if (main === null) return null;
  // The export's style keeps the body still for the app's own scroll views;
  // without the app, the text scrolls.
  return `<main>${main.join("")}</main>${footerText(writer)}${text(t("seo.needsJavaScript"))}<style>body{overflow:auto}</style>`;
}

function mainText(path: string, writer: Writer, facts: PageFacts): string[] | null {
  const { content } = facts;
  if (path === "/") return findText(writer);
  if (path === carpoolPage.path) return carpoolText(writer);
  if (path === aboutPage.path) return aboutText(writer, facts.gramsPerCarKm ?? 0);
  if (path === deleteAccountPage.path) return deleteAccountText(writer);
  if (path === "/cookies") return cookiesText(writer, facts.countsVisits ?? false);
  // The content was read for this address; its ID may be written in either case.
  if (content?.kind === "meetingPoints" && path === "/meeting-points") {
    return meetingPointsText(writer, content.points);
  }
  if (content?.kind === "meetingPoint" && path.startsWith("/meeting-points/")) {
    return meetingPointText(writer, content.point);
  }
  if (content?.kind === "place" && path.startsWith("/places/")) {
    return placeText(writer, content.nearest);
  }
  if (content?.kind === "legal" && path.startsWith("/legal/")) {
    return legalText(writer, content.document);
  }
  return null;
}

/** The footer's links, as the screen's footer gives them (spec 30, 3.3). */
function footerText({ t, link }: Writer): string {
  const page = (label: MessageKey, path: string) => link(path, t(label));
  return `<footer>${list("ul", [
    page(aboutPage.title, aboutPage.path),
    page("carpool.title", carpoolPage.path),
    page("meetingPoints.title", "/meeting-points"),
    ...aboutPage.documents.map((document) => page(document.label, document.href)),
    outsideLink(`mailto:${aboutPage.email}`, aboutPage.email),
    outsideLink(socialProfiles.facebook, t("about.facebook")),
    outsideLink(socialProfiles.instagram, t("about.instagram")),
  ])}</footer>`;
}

/** Find, the front page, without its rides, which name their drivers (decision 13). */
function findText({ t, link }: Writer): string[] {
  const steps = [
    { title: t("welcome.findRide"), words: t("home.how.find") },
    { title: t("home.how.bookTitle"), words: t("home.how.book") },
    { title: t("home.how.meetTitle"), words: t("home.how.meet") },
  ];
  return [
    heading(1, t("home.title")),
    text(t("home.intro")),
    paragraph(`${link("/", t("welcome.findRide"))} · ${link("/offer", t("driver.offerRide"))}`),
    heading(2, t("home.how.title")),
    list(
      "ol",
      steps.map(({ title, words }) => `<strong>${escapeHtml(title)}</strong> ${escapeHtml(words)}`),
    ),
    paragraph(
      `<strong>${escapeHtml(t("home.how.driving"))}</strong> ${link("/offer", t("home.how.offer"))}`,
    ),
    paragraph(
      `${link(carpoolPage.path, t("home.howItWorks"))} · ${link("/meeting-points", t("meetingPoints.open"))}`,
    ),
  ];
}

/** Carpool in Iceland (3.9, item 5). */
function carpoolText({ t, link }: Writer): string[] {
  return [
    heading(1, t(carpoolPage.title)),
    text(t(carpoolPage.intro)),
    paragraph(`${link("/", t("welcome.findRide"))} · ${link("/offer", t("driver.offerRide"))}`),
    ...carpoolPage.sections.flatMap((section) => [
      heading(2, t(section.heading)),
      ...section.paragraphs.map((key) => text(t(key))),
      ...(section.questions ?? []).flatMap(({ question, answer }) => [
        heading(3, t(question)),
        text(t(answer)),
      ]),
      ...(section.link === undefined
        ? []
        : [paragraph(link(section.link.href, t(section.link.label)))]),
    ]),
  ];
}

/**
 * About (spec 30, 3.4). What a shared ride saves (spec 34, 3.9) follows How
 * it works, with the operator's value, unless the setting is 0.
 */
function aboutText(writer: Writer, gramsPerCarKm: number): string[] {
  const { t, link } = writer;
  return [
    heading(1, t(aboutPage.title)),
    ...aboutPage.intro.map((key) => text(t(key))),
    paragraph(link(aboutPage.howItWorks.href, t(aboutPage.howItWorks.label))),
    ...(gramsPerCarKm > 0 ? co2Text(writer, gramsPerCarKm) : []),
    heading(2, t(aboutPage.documentsTitle)),
    list(
      "ul",
      aboutPage.documents.map((document) => link(document.href, t(document.label))),
    ),
    paragraph(link(aboutPage.deleteAccount.href, t(aboutPage.deleteAccount.label))),
    heading(2, t(aboutPage.operatorTitle)),
    text(t(aboutPage.operator)),
    heading(2, t(aboutPage.contactTitle)),
    text(t(aboutPage.contact)),
    paragraph(outsideLink(`mailto:${aboutPage.email}`, aboutPage.email)),
  ];
}

/** About's section on the CO2 a shared ride saves, anchored for "How we estimate it". */
function co2Text({ t, locale }: Writer, gramsPerCarKm: number): string[] {
  const values = aboutCo2Values(gramsPerCarKm, locale);
  return [
    `<h2 id="co2">${escapeHtml(t(aboutPage.co2.title))}</h2>`,
    ...aboutPage.co2.paragraphs.map((key) => text(t(key, values))),
  ];
}

/**
 * The account deletion page (spec 32, section 5): Google Play's check reads
 * it without running the app.
 */
function deleteAccountText({ t, link }: Writer): string[] {
  const page = deleteAccountPage;
  const items = (words: readonly string[]) => words.map((item) => escapeHtml(item));
  return [
    heading(1, t(page.title)),
    text(t(page.intro)),
    heading(2, t(page.howTitle)),
    list("ol", items(deleteAccountSteps(t))),
    paragraph(link("/sign-in", t("auth.signIn"))),
    heading(2, t(page.afterTitle)),
    text(t(page.after)),
    heading(2, t(page.erasedTitle)),
    list("ul", items(page.erased.map((key) => t(key)))),
    heading(2, t(page.keptTitle)),
    list("ul", items(page.kept.map((key) => t(key)))),
    heading(2, t(page.helpTitle)),
    text(t(page.help)),
    paragraph(outsideLink(`mailto:${page.email}`, page.email)),
    paragraph(link(page.privacyPolicy.href, t(page.privacyPolicy.label))),
  ];
}

/** Cookies (3.2): what the site keeps to work, and whether it counts visits. */
function cookiesText({ t, link }: Writer, countsVisits: boolean): string[] {
  return [
    heading(1, t("cookies.title")),
    text(t("cookies.needed")),
    ...(countsVisits
      ? [heading(2, t("cookies.analytics")), text(t("cookies.analyticsHelp"))]
      : [text(t("cookies.none"))]),
    paragraph(link("/legal/privacy", t("legal.readPrivacy"))),
  ];
}

/** A meeting point's link with what and where it is, as its card says it. */
function pointItem(
  { t, locale, link }: Writer,
  point: MeetingPointSummary,
  detail?: string,
): string {
  const summary = t("meetingPoints.summary", {
    type: t(typeKeys[point.type]),
    municipality: point.municipality,
  });
  const words = detail === undefined ? summary : `${detail}, ${summary}`;
  return `${link(`/meeting-points/${point.id}`, point.name[locale])}: ${escapeHtml(words)}`;
}

/**
 * The meeting points (spec 2, 3.1): each region's, in the list's order, the
 * names in the language's order. Only those the sitemap lists: active, not
 * samples (3.11, item 6).
 */
function meetingPointsText(writer: Writer, points: readonly MeetingPointSummary[]): string[] {
  const { t, locale } = writer;
  const byName = new Intl.Collator(locale);
  const listed = points
    .filter((point) => point.status === "active" && !point.sample)
    .sort((a, b) => byName.compare(a.name[locale], b.name[locale]));
  return [
    heading(1, t("meetingPoints.title")),
    text(t("meetingPoints.intro")),
    ...regions.flatMap((region) => {
      const inRegion = listed.filter((point) => point.region === region);
      return inRegion.length === 0
        ? []
        : [
            heading(2, t(regionKeys[region])),
            list(
              "ul",
              inRegion.map((point) => pointItem(writer, point)),
            ),
          ];
    }),
  ];
}

/** A meeting point's details (spec 2, screen 2), without its photos, whose addresses last an hour. */
function meetingPointText(
  { t, locale, link }: Writer,
  point: Omit<MeetingPointDetails, "photos">,
): string[] {
  const name = point.name[locale];
  const otherName = point.name[locale === "is" ? "en" : "is"];
  return [
    heading(1, name),
    text(
      t("meetingPoints.detailsLine", {
        type: t(typeKeys[point.type]),
        municipality: point.municipality,
        region: t(regionKeys[point.region]),
      }),
    ),
    ...(otherName === name ? [] : [text(otherName)]),
    ...(point.aliases.length === 0
      ? []
      : [text(t("meetingPoints.alsoKnownAs", { names: point.aliases.join(", ") }))]),
    ...(point.whereToStand === null
      ? []
      : [heading(2, t("meetingPoints.whereToStand")), text(point.whereToStand[locale])]),
    ...(point.amenities.length === 0
      ? []
      : [
          heading(2, t("meetingPoints.amenities")),
          list(
            "ul",
            point.amenities.map((amenity) => escapeHtml(t(amenityKeys[amenity]))),
          ),
        ]),
    text(seasonText(t, locale, point.season)),
    ...(point.lastCheckedOn === null
      ? []
      : [text(t("meetingPoints.lastChecked", { date: formatDate(point.lastCheckedOn, locale) }))]),
    paragraph(link("/meeting-points", t("meetingPoints.title"))),
  ];
}

/** A place with its nearest meeting points and their distance (spec 2, 3.4.3). */
function placeText(writer: Writer, nearest: NearestMeetingPoints): string[] {
  const { t, locale } = writer;
  const { place } = nearest;
  return [
    heading(1, place.name[locale]),
    text(
      t("places.summary", {
        kind: t(placeKindKeys[place.kind]),
        region: t(regionKeys[place.region]),
      }),
    ),
    ...(nearest.withinReach ? [] : [text(t("search.noneWithinReach"))]),
    heading(2, t("search.nearest")),
    list(
      "ul",
      nearest.meetingPoints.map(({ meetingPoint, distanceM }) =>
        pointItem(
          writer,
          meetingPoint,
          t("search.distanceAway", { distance: formatDistance(distanceM, locale) }),
        ),
      ),
    ),
  ];
}

/** A legal document's current version, whole, as the screen shows it. */
function legalText({ t, locale }: Writer, document: LegalContent): string[] {
  const { title, body } = document.texts[locale];
  return [
    heading(1, title),
    text(t("legal.version", { version: document.version })),
    ...markdownHtml(body),
  ];
}

const listItem = /^[-*]\s+/;

/** Text with **bold** parts, escaped. */
const inline = (words: string) =>
  escapeHtml(words).replace(/\*\*(.+?)\*\*/g, (_match, bold: string) => `<strong>${bold}</strong>`);

/**
 * The few Markdown features legal texts use, as the screen reads them:
 * headings (under the page's own title), paragraphs, lists and bold.
 * Anything else is plain text.
 */
function markdownHtml(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block !== "")
    .map((block) => {
      const title = /^#{1,6}\s+(.*)$/.exec(block)?.[1];
      if (title !== undefined) return `<h2>${inline(title)}</h2>`;
      const lines = block.split("\n");
      if (lines.every((line) => listItem.test(line))) {
        return list(
          "ul",
          lines.map((line) => inline(line.replace(listItem, ""))),
        );
      }
      return paragraph(inline(block));
    });
}
