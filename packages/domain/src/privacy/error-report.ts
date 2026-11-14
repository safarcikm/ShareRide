import { redactDeep, redactText } from "./redact.ts";

/**
 * The parts of an error report (a Sentry event) that the rule below knows
 * about. Everything else in a report is scrubbed as text.
 */
export interface ErrorReportShape {
  message?: string | undefined;
  exception?: unknown;
  request?: {
    method?: string | undefined;
    url?: string | undefined;
    headers?: Record<string, string> | undefined;
  };
  user?: { id?: string | number | undefined };
  /** The SDK's own working data, removed before a report is sent. */
  sdkProcessingMetadata?: Record<string, unknown>;
}

export interface ErrorBreadcrumbShape {
  category?: string | undefined;
  data?: Record<string, unknown> | undefined;
}

/** Headers worth keeping on a report; every other header is dropped. */
const keptHeaders = new Set(["user-agent", "content-type", "accept-language"]);

/** Breadcrumbs of taps, clicks and typing: their labels can hold what was entered. */
const droppedCategories = new Set(["touch", "ui.click", "ui.input", "ui.keypress"]);

/** Breadcrumb data that holds an address or a screen's path. */
const urlKeys = new Set(["url", "from", "to"]);

const withoutQuery = (url: string) => url.split(/[?#]/)[0] ?? "";

/**
 * What an error report may carry when it leaves the API or the app (ADR
 * 0020, privacy and GDPR): no request bodies, cookies, query strings or
 * addresses; a few harmless headers; the user's ID only; and every other
 * text with phone numbers, codes, tokens, emails and kennitölur hidden.
 */
export function scrubErrorReport<T extends ErrorReportShape>(report: T): T {
  const { request, user, sdkProcessingMetadata, ...rest } = report;
  const scrubbed: Record<string, unknown> = redactDeep(rest);
  if (sdkProcessingMetadata !== undefined)
    scrubbed["sdkProcessingMetadata"] = sdkProcessingMetadata;
  if (request !== undefined) {
    const headers = Object.fromEntries(
      Object.entries(request.headers ?? {}).filter(([name]) => keptHeaders.has(name.toLowerCase())),
    );
    scrubbed["request"] = {
      ...(request.method === undefined ? {} : { method: request.method }),
      ...(request.url === undefined ? {} : { url: redactText(withoutQuery(request.url)) }),
      headers: redactDeep(headers),
    };
  }
  if (user?.id !== undefined) scrubbed["user"] = { id: user.id };
  return scrubbed as T;
}

/**
 * A breadcrumb (what happened before an error) as it may be kept, or null
 * to drop it.
 */
export function scrubErrorBreadcrumb<T extends ErrorBreadcrumbShape>(breadcrumb: T): T | null {
  if (breadcrumb.category !== undefined && droppedCategories.has(breadcrumb.category)) return null;
  const scrubbed = redactDeep(breadcrumb);
  if (scrubbed.data === undefined) return scrubbed;
  const data = Object.fromEntries(
    Object.entries(scrubbed.data).map(([key, value]) => [
      key,
      urlKeys.has(key) && typeof value === "string" ? withoutQuery(value) : value,
    ]),
  );
  return { ...scrubbed, data };
}
