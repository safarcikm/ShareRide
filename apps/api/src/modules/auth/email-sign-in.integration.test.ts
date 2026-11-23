import { createApiClient } from "@shareride/api-client";
import {
  configRoute,
  startEmailSignInRoute,
  startPhoneSignInRoute,
  verifyEmailCodeRoute,
  verifyPhoneCodeRoute,
} from "@shareride/contracts";
import { pingDatabase, schema } from "@shareride/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.ts";
import { createLogger } from "../../logger.ts";
import { EmailMaybeSent } from "../../platform/email.ts";
import { startTestApi, type TestApi } from "../../testing.ts";

// Signing in with a code by email, and the phone step after it (spec 26,
// ADR 0046): a text goes only to a number on its way into an account.

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

beforeEach(() => {
  api.email.failure = null;
});

afterAll(async () => {
  await api.close();
});

const { users } = schema;
const device = { platform: "ios", name: "Test phone", appVersion: "1.0.0" } as const;

let addresses = 0;

/** A network address no other test sends from. */
function newIp(): void {
  addresses += 1;
  api.ip = `192.0.2.${String(addresses % 250)}`;
}

let people = 0;

/** A new address of a made-up person. */
function newEmail(name = "person"): string {
  people += 1;
  return `${name}-${String(people)}@example.test`;
}

function start(email: string, locale: "is" | "en" = "en") {
  return api.client.call(startEmailSignInRoute, { body: { email, locale } });
}

function verify(email: string, code: string, platform: "ios" | "web" = "ios") {
  return api.client.call(verifyEmailCodeRoute, {
    body: { email, code, device: { ...device, platform } },
  });
}

/** Asks for a code from a new address, 31 seconds later, and gives the code. */
async function codeFor(email: string): Promise<string> {
  api.advance(31);
  newIp();
  const started = await start(email);
  if (!started.ok) throw new Error(started.error.code);
  return api.lastEmailCode(email.trim().toLowerCase());
}

/** A code that is not the one sent. */
const wrong = (code: string) => (code === "000000" ? "111111" : "000000");

/** The phone step of a waiting sign-in: the text, then its code. */
async function phoneStep(phone: string, pendingSignIn: string) {
  api.advance(31);
  newIp();
  const started = await api.client.call(startPhoneSignInRoute, {
    body: { phoneNumber: phone, locale: "en", pendingSignIn },
  });
  if (!started.ok) throw new Error(started.error.code);
  return api.client.call(verifyPhoneCodeRoute, {
    body: { phoneNumber: phone, code: api.lastCode(phone), locale: "en", device, pendingSignIn },
  });
}

/** A member made by the phone, with this email on the account. */
async function memberWith(email: string, verified = true) {
  const phone = api.newPhoneNumber();
  const { userId } = await api.signIn(phone);
  await api.connection.db
    .update(users)
    .set({ email, emailVerifiedAt: verified ? api.now() : null })
    .where(eq(users.id, userId));
  return { phone, userId };
}

async function accountOf(userId: string) {
  const [row] = await api.connection.db
    .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, userId));
  return row;
}

/** The test API's app without an email sender, as on a server with none set up. */
function withoutEmail() {
  const features = { ...api.features };
  delete features.email;
  const app = createApp({
    logger: createLogger({ level: "silent" }),
    checkDatabase: () => pingDatabase(api.connection.pool),
    features,
  });
  return createApiClient({
    baseUrl: "http://api.test",
    fetch: async (input, init) => app.request(input.replace("http://api.test", ""), init),
  });
}

describe("asking for a code by email (spec 26, 3.2)", () => {
  it("emails a 6-digit code in the person's language, and says when to ask again", async () => {
    newIp();
    const anna = newEmail("anna");
    expect(await start(anna)).toEqual({ ok: true, status: 202, data: { resendAfterSeconds: 30 } });
    const sent = api.email.sent.at(-1);
    expect(sent?.to).toBe(anna);
    expect(sent?.subject).toMatch(/^\d{6} is your PuffinRide code$/);
    expect(sent?.text).toContain(api.lastEmailCode(anna));

    const jon = newEmail("jon");
    expect((await start(jon, "is")).ok).toBe(true);
    expect(api.email.sent.at(-1)?.subject).toMatch(/^\d{6} er PuffinRide-kóðinn þinn$/);
  });

  it("takes the address with capitals and spaces as the same address", async () => {
    newIp();
    const address = newEmail("Case");
    expect((await start(`  ${address.toUpperCase()} `)).ok).toBe(true);
    expect(api.email.sent.at(-1)?.to).toBe(address.toLowerCase());
  });

  it("refuses something that is not an address, and sends nothing", async () => {
    newIp();
    const before = api.email.sent.length;
    expect(await start("not an address")).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "email_invalid" },
    });
    expect(api.email.sent).toHaveLength(before);
  });

  it("sends one code per address in 30 seconds and 5 in an hour (R26.4)", async () => {
    const address = newEmail();
    await codeFor(address);
    newIp();
    expect(await start(address)).toMatchObject({
      ok: false,
      status: 429,
      error: { code: "rate_limited" },
    });
    for (let sent = 2; sent <= 5; sent += 1) await codeFor(address);
    api.advance(31);
    newIp();
    expect(await start(address)).toMatchObject({ ok: false, error: { code: "rate_limited" } });
  });

  it("sends 20 codes an hour from one network address, an IPv6 one counted by its /64 (R26.4)", async () => {
    for (let sent = 0; sent < 20; sent += 1) {
      api.ip = `2001:db8:26:4::${String(sent + 1)}`;
      expect((await start(newEmail())).ok).toBe(true);
    }
    api.ip = "2001:db8:26:4::ffff";
    expect(await start(newEmail())).toMatchObject({
      ok: false,
      status: 429,
      error: { code: "rate_limited" },
    });
    api.ip = "2001:db8:26:5::1";
    expect((await start(newEmail())).ok).toBe(true);
  });

  it("says when the email was not sent, and takes one that may have gone out as sent", async () => {
    newIp();
    api.email.failure = new Error("Mailjet refused the email (HTTP 503)");
    expect(await start(newEmail())).toMatchObject({
      ok: false,
      status: 502,
      error: { code: "email_failed" },
    });
    api.email.failure = new EmailMaybeSent("Mailjet did not answer in time");
    expect(await start(newEmail())).toMatchObject({ ok: true, status: 202 });
  });

  it("says email is not available on a server that sends none, and the config says so", async () => {
    const client = withoutEmail();
    newIp();
    expect(
      await client.call(startEmailSignInRoute, { body: { email: newEmail(), locale: "en" } }),
    ).toMatchObject({ ok: false, status: 503, error: { code: "email_unavailable" } });
    expect(await client.call(configRoute, {})).toMatchObject({
      ok: true,
      data: { emailSignIn: false },
    });
    expect(await api.client.call(configRoute, {})).toMatchObject({
      ok: true,
      data: { emailSignIn: true },
    });
  });
});

describe("the email's code (spec 26, 3.2 and 3.3)", () => {
  it("signs in to the account whose verified email it is, with no text message", async () => {
    const address = newEmail("member");
    const { userId } = await memberWith(address);
    const texts = api.sms.outbox.length;
    const signedIn = await verify(address, await codeFor(address));
    expect(signedIn).toMatchObject({
      ok: true,
      status: 200,
      data: { status: "signedIn", isNewUser: false, user: { id: userId, email: address } },
    });
    if (!signedIn.ok || signedIn.data.status !== "signedIn") return;
    expect(signedIn.data.accessToken).toMatch(/^sr_at_/);
    expect(signedIn.data.refreshToken).toMatch(/^sr_rt_/);
    expect(api.sms.outbox).toHaveLength(texts);
  });

  it("keeps the refresh token in a cookie on the web", async () => {
    const address = newEmail("web");
    await memberWith(address);
    const code = await codeFor(address);
    const response = await api.request("/v1/auth/email/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: address, code, device: { platform: "web" } }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["refreshToken"]).toBeUndefined();
    expect(response.headers.get("set-cookie") ?? "").toMatch(/^sr_refresh=sr_rt_/);
  });

  it("asks for the phone step for an email no account has verified, for 30 minutes", async () => {
    const address = newEmail("newcomer");
    const waiting = await verify(address, await codeFor(address));
    expect(waiting).toMatchObject({
      ok: true,
      status: 200,
      data: {
        status: "phoneNeeded",
        provider: "email",
        email: address,
        firstName: null,
        expiresAt: new Date(api.now().getTime() + 30 * 60_000).toISOString(),
      },
    });
    if (!waiting.ok || waiting.data.status !== "phoneNeeded") return;
    expect(waiting.data.pendingSignIn).toMatch(/^sr_pe_[A-Za-z0-9_-]{43}$/);

    // An email still waiting for its link is not the account's yet.
    const unproven = newEmail("unproven");
    await memberWith(unproven, false);
    expect(await verify(unproven, await codeFor(unproven))).toMatchObject({
      ok: true,
      data: { status: "phoneNeeded" },
    });
  });

  it("counts wrong codes, and refuses the right one after 5", async () => {
    const address = newEmail();
    const code = await codeFor(address);
    for (const attemptsLeft of [4, 3, 2, 1]) {
      expect(await verify(address, wrong(code))).toMatchObject({
        ok: false,
        status: 400,
        error: { code: "code_invalid", attemptsLeft },
      });
    }
    expect(await verify(address, wrong(code))).toMatchObject({
      ok: false,
      status: 429,
      error: { code: "code_attempts_exceeded" },
    });
    expect(await verify(address, code)).toMatchObject({
      ok: false,
      status: 429,
      error: { code: "code_attempts_exceeded" },
    });
  });

  it("works once, and for 10 minutes", async () => {
    const used = newEmail();
    const code = await codeFor(used);
    expect((await verify(used, code)).ok).toBe(true);
    expect(await verify(used, code)).toMatchObject({ ok: false, error: { code: "code_expired" } });

    const late = newEmail();
    const lateCode = await codeFor(late);
    api.advance(600);
    expect(await verify(late, lateCode)).toMatchObject({
      ok: false,
      error: { code: "code_expired" },
    });
  });

  it("is not a code for the phone step", async () => {
    const address = newEmail();
    const code = await codeFor(address);
    const pendingSignIn = await api.waitingEmailSignIn();
    const phone = api.newPhoneNumber();
    expect(
      await api.client.call(verifyPhoneCodeRoute, {
        body: { phoneNumber: phone, code, locale: "en", device, pendingSignIn },
      }),
    ).toMatchObject({ ok: false, error: { code: "code_expired" } });
  });

  it("signs in a suspended person, as the phone does, and not an account that was deleted", async () => {
    const suspended = newEmail("suspended");
    const { userId } = await memberWith(suspended);
    await api.connection.db.update(users).set({ status: "suspended" }).where(eq(users.id, userId));
    expect(await verify(suspended, await codeFor(suspended))).toMatchObject({
      ok: true,
      data: { status: "signedIn" },
    });

    const deleted = newEmail("deleted");
    const gone = await memberWith(deleted);
    await api.connection.db
      .update(users)
      .set({ status: "deleted" })
      .where(eq(users.id, gone.userId));
    expect(await verify(deleted, await codeFor(deleted))).toMatchObject({
      ok: false,
      error: { code: "account_unavailable" },
    });
  });
});

describe("the phone step after an email (spec 26, 3.3)", () => {
  it("makes the account with the proven email", async () => {
    const address = newEmail("created");
    const phone = api.newPhoneNumber();
    const verified = await phoneStep(phone, await api.waitingEmailSignIn(address));
    expect(verified).toMatchObject({
      ok: true,
      data: {
        isNewUser: true,
        emailLink: { outcome: "created", email: address },
        user: { phoneNumber: phone, email: address },
      },
    });
    if (!verified.ok) return;
    expect((await accountOf(verified.data.user.id))?.emailVerifiedAt).toEqual(api.now());

    // The next time, the email's code alone signs in.
    expect(await verify(address, await codeFor(address))).toMatchObject({
      ok: true,
      data: { status: "signedIn", user: { id: verified.data.user.id } },
    });
  });

  it("adds the email to the number's account when it has none", async () => {
    const phone = api.newPhoneNumber();
    const { userId } = await api.signIn(phone);
    const address = newEmail("added");
    expect(await phoneStep(phone, await api.waitingEmailSignIn(address))).toMatchObject({
      ok: true,
      data: { isNewUser: false, emailLink: { outcome: "added", email: address } },
    });
    expect(await accountOf(userId)).toMatchObject({ email: address });
  });

  it("puts the email in place of the account's other one, and tells the old address", async () => {
    const old = newEmail("old");
    const { phone, userId } = await memberWith(old);
    const address = newEmail("lost-inbox");
    const sent = api.email.sent.length;
    expect(await phoneStep(phone, await api.waitingEmailSignIn(address))).toMatchObject({
      ok: true,
      data: { emailLink: { outcome: "replaced", email: address } },
    });
    expect(await accountOf(userId)).toMatchObject({ email: address });
    const notice = api.email.sent.slice(sent).find((email) => email.to === old);
    expect(notice?.subject).toBe("Your PuffinRide sign-in email changed");
    expect(notice?.text).toContain("lo•••@example.test");
    expect(notice?.text).not.toContain(address);
  });

  it("tells no old address that was never verified", async () => {
    const old = newEmail("never-verified");
    const { phone } = await memberWith(old, false);
    const sent = api.email.sent.length;
    expect(await phoneStep(phone, await api.waitingEmailSignIn())).toMatchObject({
      ok: true,
      data: { emailLink: { outcome: "replaced" } },
    });
    expect(api.email.sent.slice(sent).filter((email) => email.to === old)).toEqual([]);
  });

  it("says already for the account's own email, and takes it as verified now", async () => {
    const address = newEmail("already");
    const { phone, userId } = await memberWith(address, false);
    expect(await phoneStep(phone, await api.waitingEmailSignIn(address))).toMatchObject({
      ok: true,
      data: { emailLink: { outcome: "already", email: address } },
    });
    expect((await accountOf(userId))?.emailVerifiedAt).toEqual(api.now());
  });

  it("leaves the email to another account that has it, and still signs in", async () => {
    const address = newEmail("taken");
    const other = await memberWith(address, false);
    const phone = api.newPhoneNumber();
    const { userId } = await api.signIn(phone);
    expect(await phoneStep(phone, await api.waitingEmailSignIn(address))).toMatchObject({
      ok: true,
      data: { emailLink: { outcome: "in_use", email: address } },
    });
    expect(await accountOf(userId)).toMatchObject({ email: null });
    expect(await accountOf(other.userId)).toMatchObject({ email: address, emailVerifiedAt: null });
  });

  it("gives the email to one account when two phone steps race with it", async () => {
    const address = newEmail("race");
    const first = await api.waitingEmailSignIn(address);
    api.advance(31);
    const second = await api.waitingEmailSignIn(address);
    const phones = [api.newPhoneNumber(), api.newPhoneNumber()] as const;
    const codes: string[] = [];
    for (const [index, phone] of phones.entries()) {
      api.advance(31);
      newIp();
      const started = await api.client.call(startPhoneSignInRoute, {
        body: { phoneNumber: phone, locale: "en", pendingSignIn: index === 0 ? first : second },
      });
      if (!started.ok) throw new Error(started.error.code);
      codes.push(api.lastCode(phone));
    }
    const results = await Promise.all(
      phones.map((phone, index) =>
        api.client.call(verifyPhoneCodeRoute, {
          body: {
            phoneNumber: phone,
            code: codes[index] ?? "",
            locale: "en",
            device,
            pendingSignIn: index === 0 ? first : second,
          },
        }),
      ),
    );
    const outcomes = results.map((result) => (result.ok ? result.data.emailLink?.outcome : null));
    expect(outcomes.sort()).toEqual(["created", "in_use"]);
    const owners = await api.connection.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, address));
    expect(owners).toHaveLength(1);
  });

  it("takes a waiting sign-in once, and for 30 minutes, with no text after that", async () => {
    const pendingSignIn = await api.waitingEmailSignIn();
    expect((await phoneStep(api.newPhoneNumber(), pendingSignIn)).ok).toBe(true);
    const texts = api.sms.outbox.length;
    newIp();
    expect(
      await api.client.call(startPhoneSignInRoute, {
        body: { phoneNumber: api.newPhoneNumber(), locale: "en", pendingSignIn },
      }),
    ).toMatchObject({ ok: false, status: 400, error: { code: "provider_expired" } });

    const late = await api.waitingEmailSignIn();
    api.advance(30 * 60);
    newIp();
    expect(
      await api.client.call(startPhoneSignInRoute, {
        body: { phoneNumber: api.newPhoneNumber(), locale: "en", pendingSignIn: late },
      }),
    ).toMatchObject({ ok: false, error: { code: "provider_expired" } });
    expect(api.sms.outbox).toHaveLength(texts);
  });

  it("refuses a waiting sign-in that expired between the text and its code, and keeps the code", async () => {
    const pendingSignIn = await api.waitingEmailSignIn();
    api.advance(29 * 60);
    const phone = api.newPhoneNumber();
    newIp();
    const started = await api.client.call(startPhoneSignInRoute, {
      body: { phoneNumber: phone, locale: "en", pendingSignIn },
    });
    expect(started.ok).toBe(true);
    const code = api.lastCode(phone);
    api.advance(61);
    const answer = (pending: string) =>
      api.client.call(verifyPhoneCodeRoute, {
        body: { phoneNumber: phone, code, locale: "en", device, pendingSignIn: pending },
      });
    expect(await answer(pendingSignIn)).toMatchObject({
      ok: false,
      error: { code: "provider_expired" },
    });
    expect(await answer(await api.waitingEmailSignIn())).toMatchObject({
      ok: true,
      data: { isNewUser: true },
    });
  });

  it("logs no email address and no code", async () => {
    const before = api.logLines.length;
    const address = newEmail("quiet");
    const code = await codeFor(address);
    const waiting = await verify(address, code);
    if (!waiting.ok || waiting.data.status !== "phoneNeeded")
      throw new Error("Expected the phone step.");
    await phoneStep(api.newPhoneNumber(), waiting.data.pendingSignIn);
    const logs = api.logLines.slice(before).join("");
    expect(logs).toContain("code emailed");
    expect(logs).toContain("sign-in email at the phone step");
    expect(logs).not.toContain(address);
    expect(logs).not.toContain("quiet");
    expect(logs).not.toContain(code);
  });
});
