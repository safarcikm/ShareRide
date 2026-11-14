import * as Sentry from "@sentry/node";
import type { Breadcrumb, ErrorEvent, NodeOptions } from "@sentry/node";
import { withoutQueryValues } from "@shareride/db";
import { redactDeep, redactText } from "@shareride/domain";
import type { ErrorReporter } from "../app.ts";

export interface ErrorReportingOptions {
  /** SENTRY_DSN; without it nothing is sent. */
  readonly dsn: string | undefined;
  /** APP_ENV: local, staging or production. */
  readonly environment: string;
  /** The commit the code was built from. */
  readonly release: string | undefined;
  /** Tests replace how reports are sent. */
  readonly transport?: NodeOptions["transport"];
}

/** Headers worth keeping on a report; every other header is dropped. */
const keptHeaders = new Set(["user-agent", "content-type", "accept-language"]);

/**
 * What leaves for Sentry (ADR 0020): no request bodies, cookies, query
 * strings or addresses; a few harmless headers; the user's ID only; and
 * every other text with phone numbers, codes, tokens, emails and kennitölur
 * hidden.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  // The SDK's own working data, removed before sending: left as it is.
  const { request, user, sdkProcessingMetadata, ...rest } = event;
  const scrubbed: ErrorEvent = redactDeep(rest);
  if (sdkProcessingMetadata !== undefined) scrubbed.sdkProcessingMetadata = sdkProcessingMetadata;
  if (request !== undefined) {
    const headers = Object.fromEntries(
      Object.entries(request.headers ?? {}).filter(([name]) => keptHeaders.has(name.toLowerCase())),
    );
    scrubbed.request = {
      ...(request.method === undefined ? {} : { method: request.method }),
      ...(request.url === undefined ? {} : { url: redactText(request.url.split("?")[0] ?? "") }),
      headers: redactDeep(headers),
    };
  }
  if (user?.id !== undefined) scrubbed.user = { id: user.id };
  return scrubbed;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  return redactDeep(breadcrumb);
}

/**
 * Starts Sentry for the API or a command, errors only (no tracing, logs or
 * metrics), and returns the reporter for unexpected errors. Returns undefined
 * when no DSN is set, as in local development and tests.
 */
export function startErrorReporting(options: ErrorReportingOptions): ErrorReporter | undefined {
  if (options.dsn === undefined) return undefined;
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    ...(options.release === undefined ? {} : { release: options.release }),
    ...(options.transport === undefined ? {} : { transport: options.transport }),
    // Render's host name for the container says nothing a fix needs.
    includeServerName: false,
    // Collect as little as the SDK allows; scrubEvent then removes the rest.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: [...keptHeaders] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
    // Errors only. Tracing stays off (config refuses SENTRY_TRACES_SAMPLE_RATE),
    // no trace headers go to other services, and nothing sends logs or metrics.
    tracePropagationTargets: [],
    beforeSendLog: () => null,
    beforeSendMetric: () => null,
    // Report a promise nobody handled, then stop as Node.js would without Sentry.
    integrations: [Sentry.onUnhandledRejectionIntegration({ mode: "strict" })],
  });
  return (error, context) => {
    captureError(error, {
      method: context.method,
      route: context.route,
      ...(context.requestId === undefined ? {} : { request_id: context.requestId }),
    });
  };
}

/**
 * Reports an error with tags, without the values of a failed query. Does
 * nothing while error reporting is off.
 */
export function captureError(error: unknown, tags: Readonly<Record<string, string>>): void {
  Sentry.captureException(withoutQueryValues(error), { tags: { ...tags } });
}
