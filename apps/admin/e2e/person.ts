import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, request } from "@playwright/test";
import { origin, smsOutbox } from "../playwright.config.ts";

// Someone using the app, for the journeys that need what people send, such
// as a problem report: signed in through the API with the code the test API
// writes to its outbox, never through a browser. A made-up number each run.

/** The code in the last text message to `phoneNumber`. */
async function codeSentTo(phoneNumber: string): Promise<string> {
  let code = "";
  await expect
    .poll(() => {
      const written = readFileSync(smsOutbox, "utf8");
      // A line still being written has no newline yet: read the complete
      // lines only, and the next poll reads the rest.
      const messages = written
        .slice(0, written.lastIndexOf("\n") + 1)
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as { to: string; text: string })
        .filter((message) => message.to === phoneNumber);
      code = /\b(\d{6})\b/.exec(messages.at(-1)?.text ?? "")?.[1] ?? "";
      return code;
    })
    .not.toBe("");
  return code;
}

/** Signs in a new person and sends a problem report about a meeting point (spec 2, 3.5). */
export async function reportProblem(
  meetingPointId: string,
  body: { readonly reason: string; readonly note: string },
): Promise<void> {
  const api = await request.newContext({ baseURL: origin });
  try {
    const phoneNumber = `+35469${String(randomInt(100_000)).padStart(5, "0")}`;
    const started = await api.post("/v1/auth/phone/start", {
      data: { phoneNumber, locale: "en" },
    });
    expect(started.status()).toBe(202);
    const verified = await api.post("/v1/auth/phone/verify", {
      data: {
        phoneNumber,
        code: await codeSentTo(phoneNumber),
        locale: "en",
        device: { platform: "ios" },
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
