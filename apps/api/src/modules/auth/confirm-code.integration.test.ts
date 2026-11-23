import { randomInt } from "node:crypto";
import { sendConfirmCodeRoute, verifyPhoneCodeRoute } from "@shareride/contracts";
import { schema } from "@shareride/db";
import { err, ok } from "@shareride/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLogger } from "../../logger.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import { createAuthService, type AuthService } from "./service.ts";

// Download and delete ask for a fresh code by SMS (spec 11, 3.2 and 3.4;
// privacy self-service plan, 4.3). Those routes come later; this tests the
// sending route and the wrapper they will run their changes in.

let api: TestApi;
let auth: AuthService;

beforeAll(async () => {
  api = await startTestApi();
  const { db, sms, hasher, clock } = api.features;
  auth = createAuthService({
    db,
    sms,
    hasher,
    clock,
    logger: createLogger({ level: "silent" }),
    randomInt: (max) => randomInt(max),
  });
});

afterAll(async () => {
  await api.close();
});

function send(accessToken: string) {
  return api.client.call(sendConfirmCodeRoute, { accessToken, body: {} });
}

/** Confirms an action that does nothing but succeed. */
function confirm(userId: string, code: string) {
  return auth.withConfirmCode(userId, code, () => Promise.resolve(ok("done")));
}

async function localeOf(userId: string) {
  const [user] = await api.connection.db
    .select({ locale: schema.users.locale })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return user?.locale;
}

/** A code that is not the one sent. */
const wrong = (code: string) => (code === "000000" ? "111111" : "000000");

describe("confirm with a fresh code (spec 11; R11.1)", () => {
  it("sends a code to the account's own number, in its language", async () => {
    const phone = api.newPhoneNumber();
    const me = await api.signIn(phone);
    api.advance(31);

    const sent = await send(me.accessToken);
    expect(sent).toEqual({
      ok: true,
      status: 202,
      data: { resendAfterSeconds: 30, channel: "sms", sentTo: phone.slice(-2) },
    });
    const message = api.sms.outbox.at(-1);
    expect(message?.to).toBe(phone);
    expect(message?.text).toMatch(/^\d{6} is your PuffinRide code to confirm/);

    expect(await confirm(me.userId, api.lastCode(phone))).toEqual({ ok: true, value: "done" });
  });

  it("emails the code instead to an account's verified email, and sends no text (R26.7)", async () => {
    const phone = api.newPhoneNumber();
    const me = await api.signIn(phone);
    await api.connection.db
      .update(schema.users)
      .set({ email: "confirm-by-email@example.test", emailVerifiedAt: api.now(), locale: "is" })
      .where(eq(schema.users.id, me.userId));
    api.advance(31);
    const texts = api.sms.outbox.length;

    expect(await send(me.accessToken)).toEqual({
      ok: true,
      status: 202,
      data: { resendAfterSeconds: 30, channel: "email", sentTo: "co•••@example.test" },
    });
    expect(api.sms.outbox).toHaveLength(texts);
    const message = api.email.sent.at(-1);
    expect(message?.to).toBe("confirm-by-email@example.test");
    expect(message?.subject).toMatch(/^\d{6} er PuffinRide-kóðinn til að staðfesta$/);

    // Kept under the number, as a texted code is: the same check confirms it.
    const code = api.lastEmailCode("confirm-by-email@example.test");
    expect(await confirm(me.userId, code)).toEqual({ ok: true, value: "done" });
    // One code per number in 30 seconds, by email too.
    expect(await send(me.accessToken)).toMatchObject({
      ok: false,
      status: 429,
      error: { code: "rate_limited" },
    });
  });

  it("works once", async () => {
    const phone = api.newPhoneNumber();
    const me = await api.signIn(phone);
    api.advance(31);
    await send(me.accessToken);
    const code = api.lastCode(phone);
    await confirm(me.userId, code);
    expect(await confirm(me.userId, code)).toEqual({ ok: false, error: { code: "code_expired" } });
  });

  it("never signs in, and a sign-in code never confirms", async () => {
    const phone = api.newPhoneNumber();
    const me = await api.signIn(phone);
    api.advance(31);
    await send(me.accessToken);
    const confirmCode = api.lastCode(phone);

    const pendingSignIn = await api.waitingEmailSignIn();
    const signedIn = await api.client.call(verifyPhoneCodeRoute, {
      body: {
        phoneNumber: phone,
        code: confirmCode,
        locale: "en",
        device: { platform: "ios" },
        pendingSignIn,
      },
    });
    expect(signedIn).toMatchObject({ ok: false, error: { code: "code_expired" } });

    api.advance(31);
    await auth.start({ phoneNumber: phone, locale: "en", ipAddress: "203.0.113.5", pendingSignIn });
    const signInCode = api.lastCode(phone);
    expect(await confirm(me.userId, signInCode)).toMatchObject({ ok: false });
    // The confirm code still works: a sign-in code does not replace it.
    expect(await confirm(me.userId, confirmCode)).toEqual({ ok: true, value: "done" });
  });

  it("counts wrong codes and expires like a sign-in code", async () => {
    const phone = api.newPhoneNumber();
    const me = await api.signIn(phone);
    api.advance(31);
    await send(me.accessToken);
    const code = api.lastCode(phone);

    expect(await confirm(me.userId, wrong(code))).toEqual({
      ok: false,
      error: { code: "code_invalid", attemptsLeft: 4 },
    });
    for (let attempt = 0; attempt < 3; attempt += 1) await confirm(me.userId, wrong(code));
    expect(await confirm(me.userId, wrong(code))).toMatchObject({
      ok: false,
      error: { code: "code_attempts_exceeded" },
    });
    expect(await confirm(me.userId, code)).toMatchObject({
      ok: false,
      error: { code: "code_attempts_exceeded" },
    });

    api.advance(31);
    await send(me.accessToken);
    const late = api.lastCode(phone);
    api.advance(10 * 60);
    expect(await confirm(me.userId, late)).toEqual({ ok: false, error: { code: "code_expired" } });
  });

  it("runs the action only after the right code, in the same transaction", async () => {
    const phone = api.newPhoneNumber();
    const me = await api.signIn(phone);
    api.advance(31);
    await send(me.accessToken);
    const code = api.lastCode(phone);
    let runs = 0;
    const action = async (tx: Parameters<Parameters<AuthService["withConfirmCode"]>[2]>[0]) => {
      runs += 1;
      await tx.update(schema.users).set({ locale: "is" }).where(eq(schema.users.id, me.userId));
      return ok(undefined);
    };

    expect(await auth.withConfirmCode(me.userId, wrong(code), action)).toMatchObject({ ok: false });
    expect(runs).toBe(0);
    expect(await auth.withConfirmCode(me.userId, code, action)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(runs).toBe(1);
    expect(await localeOf(me.userId)).toBe("is");
  });

  it("undoes an action that refuses, and keeps the code for another try", async () => {
    const phone = api.newPhoneNumber();
    const me = await api.signIn(phone);
    api.advance(31);
    await send(me.accessToken);
    const code = api.lastCode(phone);

    const refused = await auth.withConfirmCode(me.userId, code, async (tx) => {
      await tx.update(schema.users).set({ locale: "is" }).where(eq(schema.users.id, me.userId));
      return err({ code: "not_now" as const });
    });
    expect(refused).toEqual({ ok: false, error: { code: "not_now" } });
    expect(await localeOf(me.userId)).toBe("en");
    expect(await confirm(me.userId, code)).toEqual({ ok: true, value: "done" });
  });

  it("counts wrong codes sent at the same time, one after the other", async () => {
    const phone = api.newPhoneNumber();
    const me = await api.signIn(phone);
    api.advance(31);
    await send(me.accessToken);
    const code = api.lastCode(phone);

    const guesses = await Promise.all(
      Array.from({ length: 10 }, () => confirm(me.userId, wrong(code))),
    );
    expect(guesses.filter((guess) => guess.ok)).toEqual([]);
    expect(await confirm(me.userId, code)).toMatchObject({
      ok: false,
      error: { code: "code_attempts_exceeded" },
    });
  });

  it("shares the sign-in limits, so it cannot send many texts", async () => {
    const phone = api.newPhoneNumber();
    const me = await api.signIn(phone);
    // The sign-in sent one code just now (rule R1.3: one per 30 seconds).
    const tooSoon = await send(me.accessToken);
    expect(tooSoon).toMatchObject({ ok: false, status: 429, error: { code: "rate_limited" } });
  });

  it("needs a signed-in person", async () => {
    const response = await api.request("/v1/me/confirm-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(401);
  });
});
