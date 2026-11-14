import { scrubErrorBreadcrumb, scrubErrorReport } from "@shareride/domain";
import { errorReportingOptions } from "./error-reporting-options";

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
      beforeSend: scrubErrorReport,
      beforeBreadcrumb: scrubErrorBreadcrumb,
    });
  });
});
