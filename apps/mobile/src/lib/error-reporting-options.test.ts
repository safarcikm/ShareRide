import { scrubErrorBreadcrumb, scrubErrorReport } from "@shareride/domain";
import { buildErrorReportingOptions, errorReportingOptions } from "./error-reporting-options";

const dsn = "https://public@o1.ingest.de.sentry.io/2";

describe("errorReportingOptions", () => {
  it("sends nothing without a DSN or in development", () => {
    expect(
      errorReportingOptions({
        dsn: undefined,
        environment: "staging",
        release: undefined,
        development: false,
      }),
    ).toBeUndefined();
    expect(
      errorReportingOptions({
        dsn: "",
        environment: "staging",
        release: undefined,
        development: false,
      }),
    ).toBeUndefined();
    expect(
      errorReportingOptions({ dsn, environment: "staging", release: undefined, development: true }),
    ).toBeUndefined();
  });

  it("sends nothing to a project outside Sentry's EU region (ADR 0020)", () => {
    for (const other of [
      "https://public@o1.ingest.us.sentry.io/2",
      "https://public@o1.ingest.sentry.io/2",
      "http://public@o1.ingest.de.sentry.io/2",
      "not a URL",
    ]) {
      expect(
        errorReportingOptions({
          dsn: other,
          environment: "staging",
          release: undefined,
          development: false,
        }),
      ).toBeUndefined();
    }
  });

  it("names the environment and, for a web build, the commit", () => {
    expect(
      errorReportingOptions({
        dsn,
        environment: "staging",
        release: "abc1234",
        development: false,
      }),
    ).toMatchObject({ dsn, environment: "staging", release: "abc1234" });
    // A phone build names its own release (app version and build).
    expect(
      errorReportingOptions({ dsn, environment: "production", release: "", development: false }),
    ).not.toHaveProperty("release");
  });

  it("sends nothing from a build that does not say which environment it is", () => {
    for (const environment of [undefined, "", "prod"]) {
      expect(
        errorReportingOptions({ dsn, environment, release: undefined, development: false }),
      ).toBeUndefined();
    }
  });

  it("collects errors only, through the shared scrubbing rule", () => {
    expect(
      errorReportingOptions({
        dsn,
        environment: "staging",
        release: undefined,
        development: false,
      }),
    ).toMatchObject({
      sendDefaultPii: false,
      tracePropagationTargets: [],
      enableAutoPerformanceTracing: false,
      enableUserInteractionTracing: false,
      enableCaptureFailedRequests: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      reportAccessibilityIdentifier: false,
      // No sessions (they carry an install ID), and no native breadcrumbs of
      // requests or taps, which the scrubbing rule never sees.
      enableAutoSessionTracking: false,
      enableNetworkBreadcrumbs: false,
      enableAutoBreadcrumbTracking: false,
      beforeSend: scrubErrorReport,
      beforeBreadcrumb: scrubErrorBreadcrumb,
    });
  });
});

describe("buildErrorReportingOptions", () => {
  const saved = { ...process.env };
  /** __DEV__ is true in tests, as in the Expo development server. */
  const setDevelopment = (value: boolean) => Reflect.set(globalThis, "__DEV__", value);

  afterEach(() => {
    process.env = { ...saved };
    setDevelopment(true);
  });

  it("reads the settings the build was made with", () => {
    process.env["EXPO_PUBLIC_SENTRY_DSN"] = dsn;
    process.env["EXPO_PUBLIC_APP_ENV"] = "staging";
    process.env["EXPO_PUBLIC_RELEASE"] = "abc1234";
    setDevelopment(false);

    expect(buildErrorReportingOptions()).toMatchObject({
      dsn,
      environment: "staging",
      release: "abc1234",
    });

    setDevelopment(true);
    expect(buildErrorReportingOptions()).toBeUndefined();
  });
});
