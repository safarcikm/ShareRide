import {
  cancelReasons,
  exportSections,
  reportCategories,
  reportOutcomes,
  type CancelReason,
  type ReportCategory,
  type ReportOutcome,
} from "@shareride/domain";
import {
  cancelReasonText,
  createTranslator,
  formatClock,
  formatDate,
  isMessageKey,
  languageNames,
  reportCategoryText,
  reportOutcomeText,
  type Locale,
  type Translate,
} from "@shareride/i18n";
import type { ExportData } from "./export-data.ts";

// The readable page in the ZIP (spec 11, 3.2.3): the same data as the JSON
// file, in the person's language, with inline styles and no scripts or
// outside links, so it opens anywhere without the internet.

/**
 * Fields the page leaves out: IDs that only tie the JSON's records together,
 * and what a message's text was made from, which the text already says.
 */
const hidden = new Set(["id", "tripId", "bookingId", "key", "params"]);

/** Fields shown as they are stored, since their keys are not the person's words. */
const asStored = new Set(["before", "after"]);

type Say = (code: string) => string | undefined;

const legalDocumentKeys: Readonly<Record<string, string>> = {
  terms: "legal.terms",
  "community-rules": "legal.rules",
  privacy: "legal.privacy",
};

const isCancelReason = (code: string): code is CancelReason =>
  (cancelReasons as readonly string[]).includes(code);
const isReportCategory = (code: string): code is ReportCategory =>
  (reportCategories as readonly string[]).includes(code);
const isReportOutcome = (code: string): code is ReportOutcome =>
  (reportOutcomes as readonly string[]).includes(code);

/**
 * Fields that hold a stored code, and how to say each code in the person's
 * language. The page shows a code with no words as it is stored.
 */
function codeWords(t: Translate, locale: Locale): Readonly<Record<string, Say>> {
  const keyed =
    (prefix: string): Say =>
    (code) => {
      const key = `${prefix}.${code}`;
      return isMessageKey(key) ? t(key) : undefined;
    };
  const language: Say = (code) => (languageNames[locale] as Record<string, string>)[code];
  return {
    status: keyed("export.value.status"),
    kind: keyed("export.value.kind"),
    channel: keyed("export.value.channel"),
    platform: keyed("export.value.platform"),
    endReason: keyed("export.value.endReason"),
    roles: keyed("export.value.role"),
    cancelledBy: keyed("export.value.role"),
    reportedBy: keyed("export.value.role"),
    answer: keyed("export.value.answer"),
    decidedBy: keyed("export.value.decidedBy"),
    from: keyed("export.value.from"),
    bookingMode: keyed("trip.bookingMode"),
    luggage: keyed("trip.prefs.luggage"),
    pets: keyed("trip.prefs.pets"),
    smoking: keyed("trip.prefs.smoking"),
    chat: keyed("trip.prefs.chat"),
    colour: keyed("vehicle.colour"),
    declineReason: keyed("request.reason"),
    cancelReason: (code) => (isCancelReason(code) ? cancelReasonText(t, code) : undefined),
    subject: keyed("export.value.subject"),
    category: (code) => (isReportCategory(code) ? reportCategoryText(t, code) : undefined),
    // A ride report's outcome and a safety report's outcome share the field;
    // their codes differ.
    outcome: (code) =>
      keyed("export.value.outcome")(code) ??
      (isReportOutcome(code) ? reportOutcomeText(t, code) : undefined),
    document: (code) => {
      const key = legalDocumentKeys[code];
      return key !== undefined && isMessageKey(key) ? t(key) : undefined;
    },
    locale: language,
    languages: language,
  };
}

/**
 * A stored code in `locale`'s words, or undefined when the field holds no
 * codes or the code has no words; a test keeps every known code covered.
 */
export function codeText(field: string, code: string, locale: Locale): string | undefined {
  return codeWords(createTranslator(locale), locale)[field]?.(code);
}

const isoMoment = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const icelandDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Atlantic/Reykjavik",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function escape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const labelKey = (field: string) => `export.field.${field}`;

/**
 * The fields in an export that have no label in the catalog, so the page
 * would show their names as they are; a test keeps this empty.
 */
export function unlabelledFields(data: ExportData): string[] {
  const missing = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (isRecord(value)) {
      for (const [field, inner] of Object.entries(value)) {
        if (hidden.has(field)) continue;
        if (!isMessageKey(labelKey(field))) missing.add(field);
        if (!asStored.has(field)) walk(inner);
      }
    }
  };
  for (const section of Object.values(data.sections)) walk(section);
  return [...missing].sort();
}

/** Renders the export as one HTML page in its language. */
export function renderExportPage(data: ExportData): string {
  const locale: Locale = data.locale;
  const t = createTranslator(locale);
  const words = codeWords(t, locale);
  const said = (field: string, text: string) => words[field]?.(text) ?? text;
  const moment = (iso: string) => {
    const at = new Date(iso);
    return `${formatDate(icelandDate.format(at), locale)} ${formatClock(at)}`;
  };

  const value = (field: string, inner: unknown): string => {
    if (inner === null || inner === undefined || inner === "") return "—";
    if (asStored.has(field)) return `<code>${escape(JSON.stringify(inner))}</code>`;
    if (typeof inner === "boolean") return escape(t(inner ? "export.yes" : "export.no"));
    if (typeof inner === "number") return escape(String(inner));
    if (typeof inner === "string") {
      return escape(isoMoment.test(inner) ? moment(inner) : said(field, inner));
    }
    if (Array.isArray(inner)) {
      if (inner.length === 0) return escape(t("export.none"));
      if (inner.every((item) => typeof item === "string")) {
        return escape(inner.map((item) => said(field, item)).join(", "));
      }
      return list(inner);
    }
    if (isRecord(inner)) return fields(inner);
    return escape(JSON.stringify(inner));
  };

  const label = (field: string) => {
    const key = labelKey(field);
    return isMessageKey(key) ? t(key) : field;
  };

  const fields = (record: Readonly<Record<string, unknown>>): string => {
    const rows = Object.entries(record)
      .filter(([field]) => !hidden.has(field))
      .map(([field, inner]) => `<dt>${escape(label(field))}</dt><dd>${value(field, inner)}</dd>`);
    return `<dl>${rows.join("")}</dl>`;
  };

  const list = (items: readonly unknown[]): string =>
    items
      .map((item) => `<div class="item">${isRecord(item) ? fields(item) : value("", item)}</div>`)
      .join("");

  const sections = exportSections.map((section) => {
    const content: unknown = data.sections[section];
    const body = Array.isArray(content)
      ? content.length === 0
        ? `<p>${escape(t("export.none"))}</p>`
        : list(content)
      : isRecord(content)
        ? fields(content)
        : value(section, content);
    return `<section><h2>${escape(t(`export.section.${section}`))}</h2>${body}</section>`;
  });

  return [
    "<!doctype html>",
    `<html lang="${locale}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="color-scheme" content="light dark">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escape(t("export.title"))}</title>`,
    `<style>${style}</style>`,
    "</head>",
    "<body>",
    `<h1>${escape(t("export.title"))}</h1>`,
    `<p>${escape(t("export.intro", { date: moment(data.createdAt) }))}</p>`,
    ...sections,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

// Structure only: the page has no brand colours, like the emails, and
// follows the reader's own light or dark settings.
const style = [
  "body{font-family:system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem;line-height:1.5}",
  "h1{font-size:1.75rem}",
  "h2{font-size:1.25rem;margin-top:2rem;border-bottom:1px solid;padding-bottom:.25rem}",
  "dl{display:grid;grid-template-columns:minmax(8rem,14rem) 1fr;gap:.25rem 1rem;margin:0}",
  "dt{font-weight:600}",
  "dd{margin:0;overflow-wrap:anywhere}",
  "dd dl{grid-template-columns:minmax(6rem,10rem) 1fr}",
  ".item{border:1px solid;border-radius:.5rem;padding:.75rem;margin:.5rem 0}",
  "code{font-size:.875rem}",
].join("");
