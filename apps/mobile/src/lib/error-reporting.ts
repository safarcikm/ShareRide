// Error reports on phones: Sentry starts with the app, so it also sees a
// crash while the app opens. The web has its own version of this file.
import * as Sentry from "@sentry/react-native";
import { buildErrorReportingOptions } from "./error-reporting-options";

/** Starts error reporting once, when the app loads. */
export function startErrorReporting(): void {
  const options = buildErrorReportingOptions();
  if (options !== undefined) Sentry.init(options);
}

/** Reports an error the app caught. Does nothing while reporting is off. */
export function reportError(error: unknown): void {
  Sentry.captureException(error);
}
