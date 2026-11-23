import {
  putEmailRoute,
  refreshRoute,
  sendConfirmCodeRoute,
  signOutRoute,
  startPhoneSignInRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashToken } from "../../platform/crypto.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import { cleanUpSignInRecords } from "./clean-up.ts";

const { rateLimitEvents, sessionTokens, sessions, verificationCodes } = schema;
const day = 24 * 3600;

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi();
});

afterEach(async () => {
  await api.close();
});

const cleanUp = () => cleanUpSignInRecords(api.connection.db, api.now());
const count = async (table: typeof verificationCodes | typeof rateLimitEvents) =>
  (await api.connection.db.select().from(table)).length;

/** A text with a sign-in code for the phone step; the email code before it is counted too. */
async function sendCode() {
  const pendingSignIn = await api.waitingEmailSignIn();
  const result = await api.client.call(startPhoneSignInRoute, {
    body: { phoneNumber: api.newPhoneNumber(), locale: "en", pendingSignIn },
  });
  if (!result.ok) throw new Error(result.error.code);
}

async function sessionRow(id: string) {
  const [row] = await api.connection.db.select().from(sessions).where(eq(sessions.id, id));
  return row;
}

/** The session a refresh token belongs to, found by the token's hash. */
async function sessionIdOf(refreshToken: string) {
  const [token] = await api.connection.db
    .select()
    .from(sessionTokens)
    .where(eq(sessionTokens.tokenHash, hashToken(refreshToken)));
  if (token === undefined) throw new Error("unknown refresh token");
  return { sessionId: token.sessionId, refreshToken };
}

describe("cleanUpSignInRecords", () => {
  it("deletes codes once they have expired, and keeps the rest", async () => {
    await sendCode();
    await cleanUp();
    expect(await count(verificationCodes)).toBe(1);

    api.advance(10 * 60 + 1);
    await sendCode();
    // The first text's code, now expired (an email code went when it was used).
    expect(await cleanUp()).toMatchObject({ codes: 1 });
    expect(await count(verificationCodes)).toBe(1);
  });

  it("deletes links to verify an email a day after they were sent", async () => {
    const phone = api.newPhoneNumber();
    const ask = async () => {
      // Signed in again each time: an access token lasts less than a day.
      const { accessToken } = await api.signIn(phone);
      // Past the account's first 30 minutes, with a confirm code (R26.5).
      api.advance(31);
      const sent = await api.client.call(sendConfirmCodeRoute, { accessToken, body: {} });
      if (!sent.ok) throw new Error(sent.error.code);
      return api.client.call(putEmailRoute, {
        accessToken,
        body: { email: "anna-clean@example.com", code: api.lastCode(phone) },
      });
    };
    // The first link goes 62 seconds from now: after the sign-in and the confirm code.
    const first = api.now().getTime() + 62_000;
    expect((await ask()).ok).toBe(true);
    api.advance(day - 120);
    expect((await ask()).ok).toBe(true);
    api.advance((first + day * 1000 - api.now().getTime()) / 1000);
    expect(await cleanUp()).toMatchObject({ emailLinks: 1 });
    expect(await api.connection.db.select().from(schema.emailVerifications)).toHaveLength(1);
  });

  it("deletes Google and Apple sign-ins an hour after they expired (spec 19, 7)", async () => {
    const { providerSignIns } = schema;
    const now = api.now();
    const row = (name: string, expiresAt: Date) => ({
      provider: "google",
      stateHash: hashToken(name),
      challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      returnUrl: "https://shareride.test/sign-in/return",
      expiresAt,
    });
    await api.connection.db
      .insert(providerSignIns)
      .values([
        row("old", new Date(now.getTime() - 3601_000)),
        row("recent", new Date(now.getTime() - 3599_000)),
        row("open", new Date(now.getTime() + 600_000)),
      ]);
    expect(await cleanUp()).toMatchObject({ providerSignIns: 1 });
    const left = await api.connection.db
      .select({ stateHash: providerSignIns.stateHash })
      .from(providerSignIns);
    expect(left.map((kept) => kept.stateHash).sort()).toEqual(
      [hashToken("recent"), hashToken("open")].sort(),
    );
  });

  it("deletes email sign-ins an hour after they stopped waiting (spec 26, 4)", async () => {
    const { emailSignIns } = schema;
    const now = api.now();
    const row = (name: string, expiresAt: Date) => ({
      email: `${name}@example.test`,
      pendingHash: hashToken(name),
      expiresAt,
    });
    await api.connection.db
      .insert(emailSignIns)
      .values([
        row("old", new Date(now.getTime() - 3601_000)),
        row("recent", new Date(now.getTime() - 3599_000)),
        row("open", new Date(now.getTime() + 600_000)),
      ]);
    expect(await cleanUp()).toMatchObject({ emailSignIns: 1 });
    const left = await api.connection.db.select({ email: emailSignIns.email }).from(emailSignIns);
    expect(left.map((kept) => kept.email).sort()).toEqual([
      "open@example.test",
      "recent@example.test",
    ]);
  });

  it("deletes rate-limit events after 24 hours", async () => {
    await sendCode();
    const events = await count(rateLimitEvents);
    expect(events).toBeGreaterThan(0);

    api.advance(day - 60);
    await cleanUp();
    expect(await count(rateLimitEvents)).toBe(events);

    api.advance(120);
    expect(await cleanUp()).toMatchObject({ rateLimitEvents: events });
    expect(await count(rateLimitEvents)).toBe(0);
  });

  it("deletes expired tokens but keeps the session usable", async () => {
    const signedIn = await api.signIn(api.newPhoneNumber());
    api.advance(16 * 60);
    expect(await cleanUp()).toMatchObject({ tokens: 1 });
    const tokens = await api.connection.db.select().from(sessionTokens);
    expect(tokens.map((token) => token.kind)).toEqual(["refresh"]);

    const result = await api.client.call(refreshRoute, {
      body: { refreshToken: signedIn.refreshToken },
    });
    expect(result.ok).toBe(true);
  });

  it("keeps rotated refresh tokens while the session lives, so reuse is still caught", async () => {
    const signedIn = await api.signIn(api.newPhoneNumber());
    const copied = signedIn.refreshToken;
    // Whoever holds the newest token keeps the session in use for 63 days,
    // past the first token's own expiry.
    let newest = copied;
    for (let days = 0; days < 63; days += 9) {
      const next = await api.client.call(refreshRoute, { body: { refreshToken: newest } });
      if (!next.ok) throw new Error(next.error.code);
      newest = next.data.refreshToken ?? "";
      api.advance(9 * day);
    }
    await cleanUp();

    expect(await api.client.call(refreshRoute, { body: { refreshToken: copied } })).toMatchObject({
      status: 401,
      error: { code: "session_ended" },
    });
    expect(await api.client.call(refreshRoute, { body: { refreshToken: newest } })).toMatchObject({
      status: 401,
    });
  });

  it("ends sessions unused for 60 days, then deletes them 30 days later", async () => {
    const signedIn = await api.signIn(api.newPhoneNumber());
    const { sessionId } = await sessionIdOf(signedIn.refreshToken);
    // One refresh leaves a rotated token, which only the session's end removes.
    const once = await api.client.call(refreshRoute, {
      body: { refreshToken: signedIn.refreshToken },
    });
    if (!once.ok) throw new Error(once.error.code);

    api.advance(59 * day);
    await cleanUp();
    expect((await sessionRow(sessionId))?.endedAt).toBeNull();

    api.advance(2 * day);
    expect(await cleanUp()).toMatchObject({ sessionsEnded: 1 });
    const ended = await sessionRow(sessionId);
    expect(ended).toMatchObject({ endReason: "idle", endedAt: api.now() });
    const tokens = await api.connection.db
      .select()
      .from(sessionTokens)
      .where(eq(sessionTokens.sessionId, sessionId));
    expect(tokens).toEqual([]);

    api.advance(29 * day);
    await cleanUp();
    expect(await sessionRow(sessionId)).toBeDefined();

    api.advance(2 * day);
    expect(await cleanUp()).toMatchObject({ sessionsDeleted: 1 });
    expect(await sessionRow(sessionId)).toBeUndefined();
  });

  it("deletes signed-out sessions 30 days after sign-out and keeps open ones", async () => {
    const leaving = await api.signIn(api.newPhoneNumber());
    const staying = await api.signIn(api.newPhoneNumber());
    const left = await sessionIdOf(leaving.refreshToken);
    const stays = await sessionIdOf(staying.refreshToken);
    await api.client.call(signOutRoute, { accessToken: leaving.accessToken, body: { all: false } });
    expect((await sessionRow(left.sessionId))?.endedAt).not.toBeNull();

    // The other person keeps using the app, so their session stays open.
    for (let days = 0; days < 31; days += 10) {
      api.advance(10 * day);
      const kept = await api.client.call(refreshRoute, {
        body: { refreshToken: stays.refreshToken },
      });
      if (!kept.ok) throw new Error(kept.error.code);
      stays.refreshToken = kept.data.refreshToken ?? "";
    }
    expect(await cleanUp()).toMatchObject({ sessionsDeleted: 1 });
    expect(await sessionRow(left.sessionId)).toBeUndefined();
    expect((await sessionRow(stays.sessionId))?.endedAt).toBeNull();
  });
});
