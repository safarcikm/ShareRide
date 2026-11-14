import { describe, expect, it } from "vitest";
import { scrubErrorBreadcrumb, scrubErrorReport } from "./error-report.ts";

describe("scrubErrorReport", () => {
  it("keeps the request's method, path and a few harmless headers only", () => {
    const report = scrubErrorReport({
      message: "with a request",
      request: {
        method: "POST",
        url: "https://staging.example/v1/auth/phone/verify?phone=%2B3546901234#top",
        headers: {
          Authorization: "Bearer x",
          Cookie: "sr_refresh=y",
          "User-Agent": "Test",
          Referer: "https://staging.example/sign-in?step=code",
          "X-Forwarded-For": "203.0.113.5",
        },
        cookies: { sr_refresh: "y" },
        data: { phoneNumber: "+3546901234" },
        query_string: "phone=%2B3546901234",
      },
    });

    expect(report.request).toEqual({
      method: "POST",
      url: "https://staging.example/v1/auth/phone/verify",
      headers: { "User-Agent": "Test" },
    });
  });

  it("keeps only the user's ID", () => {
    const signedIn = { user: { id: "u-1", ip_address: "203.0.113.5", email: "a@b.is" } };
    const anonymous = { message: "x", user: { id: undefined, ip_address: "{{auto}}" } };
    expect(scrubErrorReport(signedIn).user).toEqual({ id: "u-1" });
    expect(scrubErrorReport(anonymous)).not.toHaveProperty("user");
  });

  it("hides personal data everywhere else", () => {
    const report = {
      exception: { values: [{ value: "No account for +354 690 1234" }] },
      extra: { body: { firstName: "Anna" } },
    };
    expect(scrubErrorReport(report)).toEqual({
      exception: { values: [{ value: "No account for [number]" }] },
      extra: { body: { firstName: "[redacted]" } },
    });
  });

  it("leaves the SDK's own fields as they are, so reports match releases and source maps", () => {
    const scope = { kind: "scope" };
    const sdkFields = {
      event_id: "4c3b2a1987654321fedcba9876543210",
      release: "com.shareride.app@0.1.0+2026111401",
      dist: "2026111401",
      environment: "staging",
      debug_meta: {
        images: [{ type: "sourcemap", code_file: "app:///index.bundle", debug_id: "123456789012" }],
      },
    };
    const report = scrubErrorReport({ ...sdkFields, sdkProcessingMetadata: { scope } });
    expect(report).toMatchObject(sdkFields);
    expect(report.sdkProcessingMetadata.scope).toBe(scope);
  });

  it("puts the breadcrumbs it carries through the breadcrumb rule", () => {
    // A phone's own breadcrumbs join a report without passing beforeBreadcrumb.
    const report = scrubErrorReport({
      breadcrumbs: [
        { category: "ui.click", message: "view.id=anna" },
        { category: "http", data: { url: "https://api.example/v1/x?name=Anna" } },
      ],
    });
    expect(report.breadcrumbs).toEqual([
      { category: "http", data: { url: "https://api.example/v1/x" } },
    ]);
  });
});

describe("scrubErrorBreadcrumb", () => {
  it("drops taps, clicks, typing and console output, which can hold what someone entered", () => {
    for (const category of ["touch", "ui.click", "ui.input", "ui.keypress", "console"]) {
      expect(scrubErrorBreadcrumb({ category, message: "button[aria-label=Anna]" })).toBeNull();
    }
  });

  it("keeps navigation and requests without query strings", () => {
    expect(
      scrubErrorBreadcrumb({
        category: "navigation",
        data: { from: "/sign-in?step=code", to: "/onboarding/profile#name" },
      }),
    ).toEqual({ category: "navigation", data: { from: "/sign-in", to: "/onboarding/profile" } });
    expect(
      scrubErrorBreadcrumb({
        category: "fetch",
        data: { method: "GET", url: "https://api.example/v1/me?x=1", status_code: 200 },
      }),
    ).toEqual({
      category: "fetch",
      data: { method: "GET", url: "https://api.example/v1/me", status_code: 200 },
    });
    expect(
      scrubErrorBreadcrumb({
        category: "http",
        data: {
          url: "https://api.example/v1/x",
          "http.query": "?name=Anna",
          "http.fragment": "#a",
        },
      }),
    ).toEqual({ category: "http", data: { url: "https://api.example/v1/x" } });
  });

  it("hides personal data in messages and data", () => {
    expect(
      scrubErrorBreadcrumb({
        category: "auth",
        message: "sent to +3546901234",
        data: { phoneNumber: "+3546901234" },
      }),
    ).toEqual({
      category: "auth",
      message: "sent to [number]",
      data: { phoneNumber: "[redacted]" },
    });
  });
});
