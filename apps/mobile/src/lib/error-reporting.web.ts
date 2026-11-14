// Error reports on the web. Sentry's SDK is larger than the rest of the
// app's first screen, so it loads separately, and only in a build that
// reports errors. An error caught before it has loaded waits for it.
import type * as SentrySdk from "@sentry/react-native";
import { buildErrorReportingOptions } from "./error-reporting-options";

type Sdk = Pick<typeof SentrySdk, "init" | "captureException">;

/** Error reporting that loads the SDK when it starts (exported for tests). */
export function lazyErrorReporting(
  options: SentrySdk.ReactNativeOptions | undefined,
  loadSdk: () => Promise<Sdk>,
) {
  let sdk: Sdk | undefined;
  let waiting: unknown[] | undefined;
  return {
    /** Starts error reporting once, when the app loads. */
    startErrorReporting: (): void => {
      if (options === undefined) return;
      waiting = [];
      loadSdk()
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
    },
    /** Reports an error the app caught. Does nothing while reporting is off. */
    reportError: (error: unknown): void => {
      if (sdk !== undefined) sdk.captureException(error);
      else waiting?.push(error);
    },
  };
}

export const { startErrorReporting, reportError } = lazyErrorReporting(
  buildErrorReportingOptions(),
  () => import("@sentry/react-native"),
);
