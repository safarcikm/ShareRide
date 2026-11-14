import * as Sentry from "@sentry/node";
import type { NodeOptions } from "@sentry/node";
import { withoutQueryValues } from "@shareride/db";
import { scrubErrorBreadcrumb, scrubErrorReport } from "@shareride/domain";
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
    // Collect as little as the SDK allows; the shared rule then removes the rest.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { allow: ["user-agent", "content-type", "accept-language"] },
        response: false,
      },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    beforeSend: scrubErrorReport,
    beforeBreadcrumb: scrubErrorBreadcrumb,
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
