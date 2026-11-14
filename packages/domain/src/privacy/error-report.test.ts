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

  it("leaves the SDK's own working data as it is", () => {
    const scope = { kind: "scope" };
    const report = scrubErrorReport({ sdkProcessingMetadata: { capturedSpanScope: scope } });
    expect(report.sdkProcessingMetadata.capturedSpanScope).toBe(scope);
  });
});

describe("scrubErrorBreadcrumb", () => {
  it("drops taps, clicks and typing, whose labels can hold what someone entered", () => {
    for (const category of ["touch", "ui.click", "ui.input", "ui.keypress"]) {
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
  });

  it("hides personal data in messages and data", () => {
    expect(
      scrubErrorBreadcrumb({
        category: "console",
        message: "sent to +3546901234",
        data: { phoneNumber: "+3546901234" },
      }),
    ).toEqual({
      category: "console",
      message: "sent to [number]",
      data: { phoneNumber: "[redacted]" },
    });
  });
});
