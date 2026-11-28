import { randomBytes } from "node:crypto";
import { Writable } from "node:stream";
import {
  finishProviderSignInRoute,
  removeSignInMethodRoute,
  startPhoneSignInRoute,
  verifyPhoneCodeRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { defaultTripDaySettings } from "@shareride/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../../logger.ts";
import { pkceChallenge } from "../../platform/identity-providers.ts";
import { startTestApi, testWebAppUrl, type TestApi } from "../../testing.ts";
import { createErasure } from "../privacy/erasure.ts";
import { appleRevocationRules, revokeDueAppleTokens } from "./apple-revocations.ts";
import { cleanUpSignInRecords } from "./clean-up.ts";

// Apple's refresh token, kept with the link and revoked with Apple when the
// link ends (spec 37, ADR 0056). The development Apple gives the made-up
// token `dev-apple-refresh-<person>`.

const { appleTokensToRevoke, identities, providerSignIns, users } = schema;

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

beforeEach(async () => {
  // Earlier tests' Apple accounts and queued tokens, in the shared database.
  for (const person of [1, 2, 3]) {
    await api.connection.db
      .delete(identities)
      .where(eq(identities.subject, `dev-apple-${String(person)}`));
  }
  await api.connection.db.delete(appleTokensToRevoke);
});

afterAll(async () => {
  await api.close();
});

const returnUrl = `${testWebAppUrl}/sign-in/return`;
const device = { platform: "ios", name: "Test phone", appVersion: "1.0.0" } as const;
const silent = createLogger({
  level: "info",
  destination: new Writable({
    write: (_chunk, _encoding, callback) => {
      callback();
    },
  }),
});

let addresses = 0;
function newAddress(): void {
  addresses += 1;
  api.ip = `203.0.114.${String(addresses % 250)}`;
}

const pathOf = (url: string) => {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
};

/**
 * An Apple or Google sign-in through the development page, as far as the
 * ticket: Apple's answer is a form posted to the callback, Google's a link.
 */
async function ticketFor(provider: "apple" | "google", person: number, verifier: string) {
  newAddress();
  const started = await api.request(
    `/v1/auth/oauth/${provider}/start?${new URLSearchParams({
      challenge: pkceChallenge(verifier),
      returnUrl,
    }).toString()}`,
  );
  expect(started.status).toBe(303);
  const page = await (await api.request(pathOf(started.headers.get("location") ?? ""))).text();
  let returned: Response;
  if (provider === "apple") {
    const form = [...page.matchAll(/<form method="post" action="([^"]+)">([\s\S]*?)<\/form>/g)][
      person
    ];
    const fields = Object.fromEntries(
      [...(form?.[2] ?? "").matchAll(/name="([^"]+)" value="([^"]*)"/g)].map(([, name, value]) => [
        name ?? "",
        (value ?? "").replaceAll("&quot;", '"').replaceAll("&amp;", "&"),
      ]),
    );
    returned = await api.request(pathOf(form?.[1] ?? ""), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
  } else {
    const links = [...page.matchAll(/href="([^"]+)"/g)].map((match) =>
      (match[1] ?? "").replaceAll("&amp;", "&"),
    );
    returned = await api.request(pathOf(links[person] ?? ""));
  }
  expect(returned.status).toBe(303);
  const location = returned.headers.get("location") ?? "";
  const ticket = /#ticket=(sr_pt_[A-Za-z0-9_-]{43})$/.exec(location)?.[1];
  if (ticket === undefined) throw new Error(`No ticket in ${location}`);
  return ticket;
}

/** A sign-in with the provider, finished: the waiting sign-in for the phone step, or signed in. */
async function signInWith(provider: "apple" | "google", person: number) {
  const verifier = randomBytes(32).toString("base64url");
  const finished = await api.client.call(finishProviderSignInRoute, {
    body: { ticket: await ticketFor(provider, person, verifier), verifier, device },
  });
  if (!finished.ok) throw new Error(finished.error.code);
  return finished.data;
}

/** The phone step of a waiting sign-in: makes or finds the number's account. */
async function phoneStep(phone: string, pendingSignIn: string) {
  api.advance(31);
  newAddress();
  const texted = await api.client.call(startPhoneSignInRoute, {
    body: { phoneNumber: phone, locale: "en", pendingSignIn },
  });
  if (!texted.ok) throw new Error(texted.error.code);
  const verified = await api.client.call(verifyPhoneCodeRoute, {
    body: { phoneNumber: phone, code: api.lastCode(phone), locale: "en", device, pendingSignIn },
  });
  if (!verified.ok) throw new Error(verified.error.code);
  return verified.data;
}

/** A new account with the made-up person's Apple account linked. */
async function memberWithApple(person: number) {
  const phone = api.newPhoneNumber();
  // Their email may be on an account of an earlier test.
  await api.connection.db
    .update(users)
    .set({ email: null, emailVerifiedAt: null })
    .where(eq(users.email, `dev-person-${String(person + 1)}@example.com`));
  const waiting = await signInWith("apple", person);
  if (waiting.status !== "phoneNeeded") throw new Error("Expected the phone step.");
  const made = await phoneStep(phone, waiting.pendingSignIn);
  return { phone, userId: made.user.id, accessToken: made.accessToken };
}

async function tokenOnLink(userId: string, provider = "apple") {
  const rows = await api.connection.db
    .select({ token: identities.appleRefreshToken, provider: identities.provider })
    .from(identities)
    .where(eq(identities.userId, userId));
  return rows.find((row) => row.provider === provider)?.token;
}

async function queued() {
  return api.connection.db
    .select({ token: appleTokensToRevoke.token, revokeAfter: appleTokensToRevoke.revokeAfter })
    .from(appleTokensToRevoke);
}

describe("Apple's refresh token is kept with the link (R37.1)", () => {
  it("on the waiting sign-in, then on the new account's link", async () => {
    const waiting = await signInWith("apple", 0);
    if (waiting.status !== "phoneNeeded") throw new Error("Expected the phone step.");
    const [row] = await api.connection.db
      .select({ token: providerSignIns.appleRefreshToken })
      .from(providerSignIns)
      .where(eq(providerSignIns.subject, "dev-apple-1"));
    expect(row?.token).toBe("dev-apple-refresh-1");

    await api.connection.db
      .update(users)
      .set({ email: null, emailVerifiedAt: null })
      .where(eq(users.email, "dev-person-1@example.com"));
    const made = await phoneStep(api.newPhoneNumber(), waiting.pendingSignIn);
    expect(await tokenOnLink(made.user.id)).toBe("dev-apple-refresh-1");
  });

  it("replaced by the newer one at the next Apple sign-in", async () => {
    const { userId } = await memberWithApple(0);
    await api.connection.db
      .update(identities)
      .set({ appleRefreshToken: "an older token" })
      .where(eq(identities.userId, userId));
    expect(await signInWith("apple", 0)).toMatchObject({ status: "signedIn" });
    expect(await tokenOnLink(userId)).toBe("dev-apple-refresh-1");
  });

  it("and no token of Google's", async () => {
    await api.connection.db.delete(identities).where(eq(identities.subject, "dev-google-3"));
    await api.connection.db
      .update(users)
      .set({ email: null, emailVerifiedAt: null })
      .where(eq(users.email, "dev-person-3@example.com"));
    const waiting = await signInWith("google", 2);
    if (waiting.status !== "phoneNeeded") throw new Error("Expected the phone step.");
    const made = await phoneStep(api.newPhoneNumber(), waiting.pendingSignIn);
    expect(await tokenOnLink(made.user.id, "google")).toBeNull();
  });
});

describe("the token is queued when the link ends (R37.2)", () => {
  it("when the member removes Apple on Sign-in methods", async () => {
    const { userId, accessToken } = await memberWithApple(0);
    const removed = await api.client.call(removeSignInMethodRoute, {
      accessToken,
      params: { provider: "apple" },
    });
    expect(removed).toMatchObject({ ok: true, status: 204 });
    expect(await tokenOnLink(userId)).toBeUndefined();
    expect(await queued()).toEqual([{ token: "dev-apple-refresh-1", revokeAfter: api.now() }]);
  });

  it("when another Apple account takes its place", async () => {
    const { phone, userId } = await memberWithApple(0);
    const waiting = await signInWith("apple", 1);
    if (waiting.status !== "phoneNeeded") throw new Error("Expected the phone step.");
    await phoneStep(phone, waiting.pendingSignIn);
    expect(await tokenOnLink(userId)).toBe("dev-apple-refresh-2");
    expect((await queued()).map((row) => row.token)).toEqual(["dev-apple-refresh-1"]);
  });

  it("when the account is erased", async () => {
    const { userId } = await memberWithApple(0);
    await api.connection.db
      .update(users)
      .set({ deleteAfter: new Date(api.now().getTime() - 1000) })
      .where(eq(users.id, userId));
    const erasure = createErasure({
      db: api.connection.db,
      clock: () => api.now(),
      hasher: api.features.hasher,
      tripDaySettings: defaultTripDaySettings,
      logger: silent,
    });
    expect(await erasure.eraseOne(userId)).toBe(true);
    expect(await tokenOnLink(userId)).toBeUndefined();
    expect((await queued()).map((row) => row.token)).toEqual(["dev-apple-refresh-1"]);
  });

  it("but not a Google link's, which has none", async () => {
    await api.connection.db.delete(identities).where(eq(identities.subject, "dev-google-3"));
    await api.connection.db
      .update(users)
      .set({ email: null, emailVerifiedAt: null })
      .where(eq(users.email, "dev-person-3@example.com"));
    const waiting = await signInWith("google", 2);
    if (waiting.status !== "phoneNeeded") throw new Error("Expected the phone step.");
    const made = await phoneStep(api.newPhoneNumber(), waiting.pendingSignIn);
    await api.client.call(removeSignInMethodRoute, {
      accessToken: made.accessToken,
      params: { provider: "google" },
    });
    expect(await queued()).toEqual([]);
  });
});

describe("the job that revokes them (spec 37, 3.2)", () => {
  async function queue(token: string, minutesAgo = 0) {
    const at = new Date(api.now().getTime() - minutesAgo * 60_000);
    await api.connection.db
      .insert(appleTokensToRevoke)
      .values({ token, revokeAfter: at, queuedAt: at });
  }

  it("sends each due token to Apple and forgets it once Apple took it", async () => {
    await queue("token-a");
    await queue("token-b");
    const sent: string[] = [];
    const revoke = (token: string) => {
      sent.push(token);
      return Promise.resolve(true);
    };
    const result = await revokeDueAppleTokens({
      db: api.connection.db,
      revoke,
      now: api.now(),
      logger: silent,
    });
    expect(result).toEqual({ revoked: 2, refused: 0 });
    expect(sent.sort()).toEqual(["token-a", "token-b"]);
    expect(await queued()).toEqual([]);
  });

  it("tries a refused one again 10 minutes later, not before", async () => {
    await queue("token-a");
    const refuse = () => Promise.resolve(false);
    const run = (now: Date) =>
      revokeDueAppleTokens({ db: api.connection.db, revoke: refuse, now, logger: silent });
    expect(await run(api.now())).toEqual({ revoked: 0, refused: 1 });
    expect(await queued()).toEqual([
      {
        token: "token-a",
        revokeAfter: new Date(api.now().getTime() + appleRevocationRules.retryAfterMs),
      },
    ]);
    expect(await run(new Date(api.now().getTime() + 9 * 60_000))).toEqual({
      revoked: 0,
      refused: 0,
    });
    expect(await run(new Date(api.now().getTime() + 10 * 60_000))).toEqual({
      revoked: 0,
      refused: 1,
    });
  });

  it("is dropped by the hourly clean-up 7 days after it was queued", async () => {
    await queue("too old", 7 * 24 * 60 + 1);
    await queue("still tried", 7 * 24 * 60 - 1);
    const counts = await cleanUpSignInRecords(api.connection.db, api.now());
    expect(counts.appleTokens).toBe(1);
    expect((await queued()).map((row) => row.token)).toEqual(["still tried"]);
  });

  it("never logs a token (R37.3)", async () => {
    const { accessToken } = await memberWithApple(0);
    await api.client.call(removeSignInMethodRoute, {
      accessToken,
      params: { provider: "apple" },
    });
    expect(api.logLines.join("\n")).not.toContain("dev-apple-refresh");
  });
});
