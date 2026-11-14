import { describe, expect, it } from "vitest";
import { redactDeep, redactText } from "./redact.ts";

describe("redactText", () => {
  it("hides phone numbers, with or without the country code", () => {
    expect(redactText("No account for +354 690 1234")).toBe("No account for [number]");
    expect(redactText("to=+4530100000&x")).toBe("to=[number]&x");
    expect(redactText("number 6901234 failed")).toBe("number [number] failed");
    expect(redactText("+354-690-1234 and +354\u00A0690\u00A01234")).toBe("[number] and [number]");
    expect(redactText("call 690-1234 or 690 1234")).toBe("call [number] or [number]");
  });

  it("hides phone numbers written into a URL", () => {
    expect(redactText("/start?to=%2B3546901234")).toBe("/start?to=[number]");
    expect(redactText("to=%2b354%20690%201234&x")).toBe("to=[number]&x");
  });

  it("hides email addresses and kennitölur", () => {
    expect(redactText("No user sigga.jons+test@example.co.uk here")).toBe("No user [email] here");
    expect(redactText("kennitala 120174-3389 or 1201743389")).toBe(
      "kennitala [number] or [number]",
    );
  });

  it("hides the values a failed query lists", () => {
    expect(
      redactText('Failed query: update "users" set "about" = $1\nparams: Ég keyri oft,x'),
    ).toBe('Failed query: update "users" set "about" = $1\nparams: [redacted]');
  });

  it("hides six-digit codes", () => {
    expect(redactText("code 482913 is wrong")).toBe("code [code] is wrong");
  });

  it("hides tokens", () => {
    expect(redactText("Bearer sr_at_Zm9vYmFy-_x")).toBe("Bearer [token]");
    expect(redactText("sr_rt_abc123 reused")).toBe("[token] reused");
  });

  it("keeps what a stack trace needs: lines, columns, dates and IDs", () => {
    const kept = [
      "at handler (apps/api/src/app.ts:123:45)",
      "at async file:///app/node_modules/.pnpm/pg-pool@3.10.1/node_modules/pg-pool/index.js:45:11",
      "2026-11-14T00:10:02Z",
      "2026-11-14 00:10",
      "request 01a1d74b-73f6-761b-ab40-50e682d88da0",
      "status 502 after 10000 ms",
    ];
    for (const text of kept) expect(redactText(text)).toBe(text);
  });
});

describe("redactDeep", () => {
  it("replaces personal data keys anywhere, ignoring case", () => {
    expect(
      redactDeep({
        request: { headers: { Authorization: "Bearer x", Cookie: "sr_refresh=y", Accept: "*/*" } },
        extra: { body: { phoneNumber: "690 1234", code: "1", locale: "en" } },
      }),
    ).toEqual({
      request: {
        headers: { Authorization: "[redacted]", Cookie: "[redacted]", Accept: "*/*" },
      },
      extra: { body: { phoneNumber: "[redacted]", code: "[redacted]", locale: "en" } },
    });
  });

  it("treats snake_case and kebab-case keys like camelCase ones", () => {
    expect(
      redactDeep({
        phone_number: "690 1234",
        first_name: "Anna",
        "refresh-token": "x",
        device_name: "Anna's phone",
        ip_address: "203.0.113.5",
        registration: "TEST0001",
        route_name: "kept",
      }),
    ).toEqual({
      phone_number: "[redacted]",
      first_name: "[redacted]",
      "refresh-token": "[redacted]",
      device_name: "[redacted]",
      ip_address: "[redacted]",
      registration: "[redacted]",
      route_name: "kept",
    });
  });

  it("redacts text inside arrays and nested objects, and leaves other values alone", () => {
    expect(
      redactDeep({
        breadcrumbs: [{ message: "sent to +3546901234", level: "info", count: 2, ok: true }],
        missing: null,
      }),
    ).toEqual({
      breadcrumbs: [{ message: "sent to [number]", level: "info", count: 2, ok: true }],
      missing: null,
    });
  });

  it("does not change its input", () => {
    const input = { message: "code 482913" };
    redactDeep(input);
    expect(input.message).toBe("code 482913");
  });
});
