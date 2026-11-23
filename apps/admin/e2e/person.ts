import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, request } from "@playwright/test";
import { emailOutbox, origin, smsOutbox } from "../playwright.config.ts";

// Someone using the app, for the journeys that need what people send, such
// as a problem report: signed up through the API with the codes the test
// API writes to its outboxes, an email's and then the number's (spec 26),
// never through a browser. A made-up email and number each run.

/** The code in the last entry of an outbox to `to`: in a text's text, or an email's subject. */
async function lastCode(file: string, to: string, field: "text" | "subject"): Promise<string> {
  let code = "";
  await expect
    .poll(() => {
      const written = readFileSync(file, "utf8");
      // A line still being written has no newline yet: read the complete
      // lines only, and the next poll reads the rest.
      const entries = written
        .slice(0, written.lastIndexOf("\n") + 1)
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as { to: string; text?: string; subject?: string })
        .filter((entry) => entry.to === to);
      code = /\b(\d{6})\b/.exec(entries.at(-1)?.[field] ?? "")?.[1] ?? "";
      return code;
    })
    .not.toBe("");
  return code;
}

/** The code in the last text message to `phoneNumber`. */
export function codeSentTo(phoneNumber: string): Promise<string> {
  return lastCode(smsOutbox, phoneNumber, "text");
}

/** Signs up a new person and sends a problem report about a meeting point (spec 2, 3.5). */
export async function reportProblem(
  meetingPointId: string,
  body: { readonly reason: string; readonly note: string },
): Promise<void> {
  const api = await request.newContext({ baseURL: origin });
  try {
    const email = `test-${randomUUID().slice(0, 8)}@example.com`;
    const emailed = await api.post("/v1/auth/email/start", { data: { email, locale: "en" } });
    expect(emailed.status()).toBe(202);
    const proven = await api.post("/v1/auth/email/verify", {
      data: {
        email,
        code: await lastCode(emailOutbox, email, "subject"),
        device: { platform: "ios" },
      },
    });
    expect(proven.status()).toBe(200);
    const { pendingSignIn } = (await proven.json()) as { pendingSignIn: string };

    const phoneNumber = `+35469${String(randomInt(100_000)).padStart(5, "0")}`;
    const started = await api.post("/v1/auth/phone/start", {
      data: { phoneNumber, locale: "en", pendingSignIn },
    });
    expect(started.status()).toBe(202);
    const verified = await api.post("/v1/auth/phone/verify", {
      data: {
        phoneNumber,
        code: await codeSentTo(phoneNumber),
        locale: "en",
        device: { platform: "ios" },
        pendingSignIn,
      },
    });
    expect(verified.status()).toBe(200);
    const { accessToken } = (await verified.json()) as { accessToken: string };
    const sent = await api.post(`/v1/meeting-points/${meetingPointId}/issues`, {
      headers: { authorization: `Bearer ${accessToken}` },
      data: body,
    });
    expect(sent.status()).toBe(204);
  } finally {
    await api.dispose();
  }
}
