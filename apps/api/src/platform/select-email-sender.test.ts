import { describe, expect, it } from "vitest";
import type { EmailMessage } from "./email.ts";
import { selectEmailSender } from "./select-email-sender.ts";

const message: EmailMessage = {
  to: "anna@example.com",
  subject: "Booking confirmed",
  text: "Saturday 14 November at 08:00 · BSÍ",
  html: "<p>Saturday 14 November at 08:00 · BSÍ</p>",
  idempotencyKey: "delivery-1",
};

describe("selectEmailSender (ADR 0027)", () => {
  it("sends nothing with no provider: the worker skips email", () => {
    expect(selectEmailSender({ provider: "none" }, () => undefined)).toBeUndefined();
  });

  it("prints emails with the development outbox", async () => {
    const printed: string[] = [];
    const email = selectEmailSender(
      { provider: "dev", webAppUrl: "http://localhost:8081" },
      (line) => printed.push(line),
    );
    await email?.send(message);
    expect(printed).toHaveLength(1);
  });

  it("sends through Mailjet with its keys and our sender", async () => {
    const requests: RequestInit[] = [];
    const fetch = (_url: string, init?: RequestInit) => {
      requests.push(init ?? {});
      return Promise.resolve(
        Response.json({ Messages: [{ Status: "success", To: [{ MessageUUID: "uuid-1" }] }] }),
      );
    };
    const email = selectEmailSender(
      {
        provider: "mailjet",
        apiKey: "public",
        secretKey: "secret",
        from: { email: "hello@shareride.is", name: "ShareRide" },
        webAppUrl: "https://shareride.is",
      },
      () => undefined,
      fetch as typeof globalThis.fetch,
    );
    expect(await email?.send(message)).toEqual({ id: "uuid-1" });
    expect(
      JSON.parse(typeof requests[0]?.body === "string" ? requests[0].body : "null"),
    ).toMatchObject({
      Messages: [{ From: { Email: "hello@shareride.is", Name: "ShareRide" } }],
    });
  });
});
