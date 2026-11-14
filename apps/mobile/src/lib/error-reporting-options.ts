import type { ReactNativeOptions } from "@sentry/react-native";
import { scrubErrorBreadcrumb, scrubErrorReport } from "@shareride/domain";

export interface ErrorReportingSources {
  /** EXPO_PUBLIC_SENTRY_DSN, inlined at build time. */
  readonly dsn: unknown;
  /** EXPO_PUBLIC_APP_ENV: local, staging or production. */
  readonly environment: unknown;
  /** EXPO_PUBLIC_RELEASE, the commit of a web build; phones name their own. */
  readonly release: unknown;
  /** True in the Expo development server. */
  readonly development: boolean;
}

const environments = ["local", "staging", "production"] as const;

const isText = (value: unknown): value is string => typeof value === "string" && value !== "";

/** Reports are stored in Sentry's EU region only (ADR 0020). */
function isEuDsn(dsn: string): boolean {
  try {
    const url = new URL(dsn);
    return url.protocol === "https:" && url.hostname.endsWith(".ingest.de.sentry.io");
  } catch {
    return false;
  }
}

/**
 * How the app reports errors to Sentry, or undefined to send nothing: in
 * development, without a DSN, or when the build does not say its
 * environment. Errors only (no tracing, replay, screenshots or logs), with
 * the scrubbing rule the API uses (privacy and GDPR, "Logs and error
 * reports").
 */
export function errorReportingOptions(
  sources: ErrorReportingSources,
): ReactNativeOptions | undefined {
  const { dsn, environment, release } = sources;
  if (sources.development || !isText(dsn) || !isEuDsn(dsn)) return undefined;
  const known = environments.find((name) => name === environment);
  if (known === undefined) return undefined;
  return {
    dsn,
    environment: known,
    ...(isText(release) ? { release } : {}),
    sendDefaultPii: false,
    // No trace headers on the app's requests, so none to the API either.
    tracePropagationTargets: [],
    enableAutoPerformanceTracing: false,
    enableUserInteractionTracing: false,
    enableCaptureFailedRequests: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    reportAccessibilityIdentifier: false,
    beforeSend: scrubErrorReport,
    beforeBreadcrumb: scrubErrorBreadcrumb,
  };
}

/** The options this build was made with. */
export function buildErrorReportingOptions(): ReactNativeOptions | undefined {
  return errorReportingOptions({
    // Expo inlines EXPO_PUBLIC_ variables at build time.
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: process.env.EXPO_PUBLIC_APP_ENV,
    release: process.env.EXPO_PUBLIC_RELEASE,
    development: __DEV__,
  });
}
