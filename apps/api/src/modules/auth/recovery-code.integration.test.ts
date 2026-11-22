import { randomInt } from "node:crypto";
import { verifyPhoneCodeRoute } from "@shareride/contracts";
import { schema } from "@shareride/db";
import { err, ok } from "@shareride/domain";
import { count, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLogger } from "../../logger.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import { createAuthService, type AuthService } from "./service.ts";

// The code that lets an operator who lost their passkeys save a new one
// (spec 22; R22.1, R22.5, R22.6). Who may get one is the console's to
// decide; this tests the code itself.

let api: TestApi;
let auth: AuthService;
let pausedAuth: AuthService;

beforeAll(async () => {
  api = await startTestApi();
  const { db, sms, hasher, clock } = api.features;
  const dependencies = {
    db,
    sms,
    hasher,
    clock,
    logger: createLogger({ level: "silent" }),
    randomInt: (max: number) => randomInt(max),
  };
  auth = createAuthService(dependencies);
  // As if the operator turned off "Text messages" in the console.
  pausedAuth = createAuthService({ ...dependencies, smsPaused: () => Promise.resolve(true) });
});

afterAll(async () => {
  await api.close();
});

const send = (e164: string) => auth.sendRecoveryCode({ e164, locale: "en" });

/** Uses a recovery code for an action that does nothing but succeed. */
const recover = (e164: string, code: string) =>
  auth.withRecoveryCode(e164, code, () => Promise.resolve(ok("done")));

const wrong = (code: string) => (code === "000000" ? "111111" : "000000");

async function countsOf(e164: string) {
  const keyHash = api.features.hasher("phone", e164);
  const rows = await api.connection.db
    .select({ scope: schema.rateLimitEvents.scope })
    .from(schema.rateLimitEvents)
    .where(eq(schema.rateLimitEvents.keyHash, keyHash));
  return rows.map((row) => row.scope);
}

/** How many sends the app's limits per address and per country have counted. */
async function appCounts() {
  const rows = await api.connection.db
    .select({ scope: schema.rateLimitEvents.scope, sends: count() })
    .from(schema.rateLimitEvents)
    .where(inArray(schema.rateLimitEvents.scope, ["ip", "calling_code"]))
    .groupBy(schema.rateLimitEvents.scope);
  return Object.fromEntries(rows.map((row) => [row.scope, row.sends]));
}

describe("a console recovery code (spec 22)", () => {
  it("sends a recovery code with its own text and count", async () => {
    const phone = api.newPhoneNumber();
    const before = await appCounts();
    expect(await send(phone)).toEqual({ ok: true, value: { resendAfterSeconds: 30 } });
    const message = api.sms.outbox.at(-1);
    expect(message?.to).toBe(phone);
    expect(message?.text).toMatch(/^\d{6} is your PuffinRide console code/);
    expect(await countsOf(phone)).toEqual(["console_recovery_phone"]);
    // Not in the app's limits per address or the daily cap per country.
    expect(await appCounts()).toEqual(before);
  });

  it("refuses a second recovery code within 30 seconds, and a sixth in an hour", async () => {
    const phone = api.newPhoneNumber();
    await send(phone);
    expect(await send(phone)).toMatchObject({
      ok: false,
      error: { code: "rate_limited", retryAfterSeconds: 30 },
    });
    for (let sent = 1; sent < 5; sent += 1) {
      api.advance(31);
      expect(await send(phone)).toMatchObject({ ok: true });
    }
    api.advance(31);
    expect(await send(phone)).toMatchObject({ ok: false, error: { code: "rate_limited" } });
  });

  it("leaves the number's sign-in codes in the app alone", async () => {
    const phone = api.newPhoneNumber();
    await send(phone);
    expect(
      await auth.start({ phoneNumber: phone, locale: "en", ipAddress: "203.0.113.9" }),
    ).toEqual({ ok: true, value: { resendAfterSeconds: 30 } });
  });

  it("sends a recovery code while text messages are paused in the console", async () => {
    const phone = api.newPhoneNumber();
    expect(await pausedAuth.sendRecoveryCode({ e164: phone, locale: "is" })).toMatchObject({
      ok: true,
    });
    expect(api.sms.outbox.at(-1)?.text).toMatch(/^\d{6} er kóðinn þinn fyrir stjórnborð/);
  });

  it("uses a recovery code once", async () => {
    const phone = api.newPhoneNumber();
    await send(phone);
    const code = api.lastCode(phone);
    expect(await recover(phone, code)).toEqual({ ok: true, value: "done" });
    expect(await recover(phone, code)).toEqual({ ok: false, error: { code: "code_expired" } });
  });

  it("counts a wrong recovery code", async () => {
    const phone = api.newPhoneNumber();
    await send(phone);
    expect(await recover(phone, wrong(api.lastCode(phone)))).toEqual({
      ok: false,
      error: { code: "code_invalid", attemptsLeft: 4 },
    });
  });

  it("keeps the code when the action refuses", async () => {
    const phone = api.newPhoneNumber();
    await send(phone);
    const code = api.lastCode(phone);
    const refused = await auth.withRecoveryCode(phone, code, () =>
      Promise.resolve(err({ code: "operator_unavailable" as const })),
    );
    expect(refused).toEqual({ ok: false, error: { code: "operator_unavailable" } });
    expect(await recover(phone, code)).toEqual({ ok: true, value: "done" });
  });

  it("does not take a sign-in code for recovery, or a recovery code for sign-in", async () => {
    const phone = api.newPhoneNumber();
    await auth.start({ phoneNumber: phone, locale: "en", ipAddress: "203.0.113.7" });
    const signInCode = api.lastCode(phone);
    expect(await recover(phone, signInCode)).toEqual({
      ok: false,
      error: { code: "code_expired" },
    });

    await send(phone);
    const recoveryCode = api.lastCode(phone);
    const signedIn = await api.client.call(verifyPhoneCodeRoute, {
      body: { phoneNumber: phone, code: recoveryCode, locale: "en", device: { platform: "web" } },
    });
    expect(signedIn).toMatchObject({ ok: false, error: { code: "code_invalid" } });
  });
});
