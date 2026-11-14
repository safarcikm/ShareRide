// Error reports on the web. Sentry's SDK is larger than the rest of the
// app's first screen, so it loads after it, and only in a build that
// reports errors. An error caught before it has loaded waits for it.
import type * as SentrySdk from "@sentry/react-native";
import { buildErrorReportingOptions } from "./error-reporting-options";

let sdk: typeof SentrySdk | undefined;
let waiting: unknown[] | undefined;

/** Starts error reporting once, when the app loads. */
export function startErrorReporting(): void {
  const options = buildErrorReportingOptions();
  if (options === undefined) return;
  waiting = [];
  import("@sentry/react-native")
    .then((loaded) => {
      loaded.init(options);
      sdk = loaded;
      for (const error of waiting ?? []) loaded.captureException(error);
      waiting = undefined;
    })
    .catch(() => {
      // Offline or a removed bundle: the app works on without reports.
      waiting = undefined;
    });
}

/** Reports an error the app caught. Does nothing while reporting is off. */
export function reportError(error: unknown): void {
  if (sdk !== undefined) sdk.captureException(error);
  else waiting?.push(error);
}
