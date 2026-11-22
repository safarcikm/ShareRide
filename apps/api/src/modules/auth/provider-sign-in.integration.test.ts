import { randomBytes } from "node:crypto";
import {
  addSignInMethodRoute,
  configRoute,
  finishProviderSignInRoute,
  listSignInMethodsRoute,
  prepareSignInMethodRoute,
  removeSignInMethodRoute,
  sendConfirmCodeRoute,
  startPhoneSignInRoute,
  verifyPhoneCodeRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashToken } from "../../platform/crypto.ts";
import { pkceChallenge } from "../../platform/identity-providers.ts";
import { startTestApi, testWebAppUrl, type TestApi } from "../../testing.ts";

const { identities, providerSignIns, users } = schema;

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.close();
});

const returnUrl = `${testWebAppUrl}/sign-in/return`;
const device = { platform: "ios", name: "Test phone", appVersion: "1.0.0" } as const;
/** The development provider's made-up people (platform/identity-providers.ts). */
const anna = 0;
const bjarni = 1;
const sol = 2;

let addresses = 0;
/** A new address for each Google sign-in, so the start limit only counts in its own test. */
function newAddress(): void {
  addresses += 1;
  api.ip = `203.0.113.${String(addresses % 250)}`;
}

function newVerifier(): string {
  return randomBytes(32).toString("base64url");
}

const startPath = (verifier: string, url = returnUrl) =>
  `/v1/auth/oauth/google/start?${new URLSearchParams({
    challenge: pkceChallenge(verifier),
    returnUrl: url,
  }).toString()}`;

/** A path of the test API, from an address on it. */
const pathOf = (url: string) => {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
};

/** Opens the start address and the development provider's page, and picks a person (or Cancel). */
async function callbackFor(verifier: string, choice: number | "cancel"): Promise<string> {
  newAddress();
  const started = await api.request(startPath(verifier));
  expect(started.status).toBe(303);
  const page = await api.request(pathOf(started.headers.get("location") ?? ""));
  expect(page.status).toBe(200);
  const links = [...(await page.text()).matchAll(/href="([^"]+)"/g)].map((match) =>
    (match[1] ?? "").replaceAll("&amp;", "&"),
  );
  const link = choice === "cancel" ? links.at(-1) : links[choice];
  if (link === undefined) throw new Error("No such link on the page.");
  return link;
}

/** Goes back through the callback; the address the browser is sent to. */
async function back(callback: string): Promise<Response> {
  return api.request(pathOf(callback));
}

/** A Google sign-in as far as the ticket the app gets. */
async function ticketFor(person: number, verifier: string): Promise<string> {
  const returned = await back(await callbackFor(verifier, person));
  expect(returned.status).toBe(303);
  const location = returned.headers.get("location") ?? "";
  const ticket = /#ticket=(sr_pt_[A-Za-z0-9_-]{43})$/.exec(location)?.[1];
  if (ticket === undefined) throw new Error(`No ticket in ${location}`);
  return ticket;
}

function finish(ticket: string, verifier: string, platform: "ios" | "web" = "ios") {
  return api.client.call(finishProviderSignInRoute, {
    body: { ticket, verifier, device: { ...device, platform } },
  });
}

/** A Google sign-in of a newcomer, as far as the phone step; its waiting sign-in. */
async function pendingFor(person: number): Promise<string> {
  const verifier = newVerifier();
  const finished = await finish(await ticketFor(person, verifier), verifier);
  if (!finished.ok || finished.data.status !== "phoneNeeded") {
    throw new Error("Expected the phone step.");
  }
  return finished.data.pendingSignIn;
}

/** Sends a sign-in code to the number, from a new address, 31 seconds later. */
async function sendCode(phone: string): Promise<string> {
  api.advance(31);
  newAddress();
  const started = await api.client.call(startPhoneSignInRoute, {
    body: { phoneNumber: phone, locale: "en" },
  });
  if (!started.ok) throw new Error(started.error.code);
  return api.lastCode(phone);
}

function verify(phone: string, code: string, pendingSignIn?: string) {
  return api.client.call(verifyPhoneCodeRoute, {
    body: {
      phoneNumber: phone,
      code,
      locale: "en",
      device,
      ...(pendingSignIn === undefined ? {} : { pendingSignIn }),
    },
  });
}

async function phoneStep(phone: string, pendingSignIn: string) {
  return verify(phone, await sendCode(phone), pendingSignIn);
}

async function linksOf(userId: string) {
  return api.connection.db
    .select({ provider: identities.provider, subject: identities.subject, email: identities.email })
    .from(identities)
    .where(eq(identities.userId, userId));
}

async function emailOf(userId: string) {
  const [user] = await api.connection.db
    .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, userId));
  return user;
}

const emails = [
  "dev-person-1@example.com",
  "dev-person-2@privaterelay.example",
  "dev-person-3@example.com",
];

/**
 * Frees a made-up person's Google account and email from the accounts of
 * earlier tests, which share the database.
 */
async function freeUp(person: number): Promise<void> {
  await api.connection.db
    .delete(identities)
    .where(eq(identities.subject, `dev-google-${String(person + 1)}`));
  await api.connection.db
    .update(users)
    .set({ email: null, emailVerifiedAt: null })
    .where(eq(users.email, emails[person] ?? ""));
}

describe("the start (plan 4.1, steps 2 and 3)", () => {
  it("sends the browser to the provider with a state and a nonce, and is not kept", async () => {
    newAddress();
    const started = await api.request(startPath(newVerifier()));
    expect(started.status).toBe(303);
    expect(started.headers.get("cache-control")).toBe("no-store");
    const location = new URL(started.headers.get("location") ?? "");
    expect(location.pathname).toBe("/v1/auth/oauth/dev/google");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "http://api.test/v1/auth/oauth/google/callback",
    );
    expect(location.searchParams.get("state")).toMatch(/^sr_st_/);
    expect(location.searchParams.get("nonce")).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ["another site", "https://evil.example/sign-in/return"],
    ["another path", `${testWebAppUrl}/other`],
    ["a query", `${returnUrl}?next=x`],
  ])("shows a page instead of going back to %s", async (_case, url) => {
    newAddress();
    const started = await api.request(startPath(newVerifier(), url));
    expect(started.status).toBe(400);
    expect(started.headers.get("location")).toBeNull();
    expect(await started.text()).toContain("This sign-in link doesn't work.");
  });

  it("speaks Icelandic to a browser that asks for it", async () => {
    newAddress();
    const started = await api.request(startPath(newVerifier(), "https://evil.example/"), {
      headers: { "accept-language": "is-IS,is;q=0.9,en;q=0.5" },
    });
    expect(await started.text()).toContain('<html lang="is">');
  });

  it("takes the app's own address and, outside production, Expo Go's", async () => {
    for (const url of ["shareride://sign-in/return", "exp://192.168.1.5:8081/--/sign-in/return"]) {
      newAddress();
      expect((await api.request(startPath(newVerifier(), url))).status).toBe(303);
    }
  });

  it("refuses a challenge that is not a SHA-256 in base64url", async () => {
    newAddress();
    const started = await api.request(
      `/v1/auth/oauth/google/start?challenge=short&returnUrl=${encodeURIComponent(returnUrl)}`,
    );
    expect(started.status).toBe(400);
  });

  it("says Apple is not on yet", async () => {
    const started = await api.request(startPath(newVerifier()).replace("/google/", "/apple/"));
    expect(started.status).toBe(404);
    expect(await started.text()).toContain("isn't available");
  });

  it("allows 20 starts per address in 10 minutes, then goes back with failed", async () => {
    newAddress();
    for (let start = 0; start < 20; start += 1) {
      expect((await api.request(startPath(newVerifier()))).status).toBe(303);
    }
    const limited = await api.request(startPath(newVerifier()));
    expect(limited.status).toBe(303);
    expect(limited.headers.get("location")).toBe(`${returnUrl}#error=failed`);
    api.advance(601);
    expect(
      new URL((await api.request(startPath(newVerifier()))).headers.get("location") ?? "").pathname,
    ).toBe("/v1/auth/oauth/dev/google");
  });

  it("lists Google in the config for the sign-in screen", async () => {
    expect(await api.client.call(configRoute, {})).toMatchObject({
      ok: true,
      data: { signInProviders: ["google"] },
    });
  });
});

describe("the provider's answer (plan 4.1, step 4)", () => {
  it("goes back to the app with a ticket", async () => {
    const returned = await back(await callbackFor(newVerifier(), anna));
    expect(returned.status).toBe(303);
    expect(returned.headers.get("cache-control")).toBe("no-store");
    expect(returned.headers.get("location")).toMatch(
      new RegExp(`^${returnUrl}#ticket=sr_pt_[A-Za-z0-9_-]{43}$`),
    );
  });

  it("goes back without an error when the person pressed Cancel (review focus 2)", async () => {
    const returned = await back(await callbackFor(newVerifier(), "cancel"));
    expect(returned.headers.get("location")).toBe(`${returnUrl}#error=cancelled`);
  });

  it("takes a state once", async () => {
    const callback = await callbackFor(newVerifier(), anna);
    expect((await back(callback)).status).toBe(303);
    const again = await back(callback);
    expect(again.status).toBe(400);
    expect(await again.text()).toContain("expired or was already used");
  });

  it("refuses a sign-in that took more than 10 minutes", async () => {
    const callback = await callbackFor(newVerifier(), anna);
    api.advance(601);
    expect((await back(callback)).status).toBe(400);
  });

  it("fails when the code is not the provider's", async () => {
    const callback = new URL(await callbackFor(newVerifier(), anna));
    callback.searchParams.set("code", "tampered");
    expect((await back(callback.toString())).headers.get("location")).toBe(
      `${returnUrl}#error=failed`,
    );
  });

  it("shows a page for a state it never made", async () => {
    const returned = await api.request("/v1/auth/oauth/google/callback?state=sr_st_x&code=y");
    expect(returned.status).toBe(400);
  });
});

describe("the ticket (plan 4.1, step 5)", () => {
  it("works once", async () => {
    const verifier = newVerifier();
    const ticket = await ticketFor(anna, verifier);
    expect((await finish(ticket, verifier)).ok).toBe(true);
    expect(await finish(ticket, verifier)).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "ticket_invalid" },
    });
  });

  it("needs the app's own secret, and a wrong one does not use it up", async () => {
    const verifier = newVerifier();
    const ticket = await ticketFor(anna, verifier);
    expect(await finish(ticket, newVerifier())).toMatchObject({
      ok: false,
      error: { code: "ticket_invalid" },
    });
    expect((await finish(ticket, verifier)).ok).toBe(true);
  });

  it("lasts 5 minutes", async () => {
    const verifier = newVerifier();
    const ticket = await ticketFor(anna, verifier);
    api.advance(301);
    expect(await finish(ticket, verifier)).toMatchObject({
      ok: false,
      error: { code: "ticket_invalid" },
    });
  });
});

describe("a newcomer (spec 19, 3.3)", () => {
  it("gives a phone number, gets an account with the verified email, and signs in with Google next time", async () => {
    await freeUp(anna);
    const verifier = newVerifier();
    const finished = await finish(await ticketFor(anna, verifier), verifier);
    expect(finished).toMatchObject({
      ok: true,
      status: 200,
      data: {
        status: "phoneNeeded",
        provider: "google",
        email: "dev-person-1@example.com",
        firstName: "Anna",
      },
    });
    if (!finished.ok || finished.data.status !== "phoneNeeded") return;
    expect(finished.data.pendingSignIn).toMatch(/^sr_ps_/);
    expect(new Date(finished.data.expiresAt).getTime() - api.now().getTime()).toBe(1800_000);

    const phone = api.newPhoneNumber();
    const verified = await phoneStep(phone, finished.data.pendingSignIn);
    expect(verified).toMatchObject({
      ok: true,
      data: {
        isNewUser: true,
        providerLink: { provider: "google", outcome: "created", email: "dev-person-1@example.com" },
        suggestedFirstName: "Anna",
        user: { phoneNumber: phone, email: "dev-person-1@example.com", firstName: null },
      },
    });
    if (!verified.ok) return;
    const userId = verified.data.user.id;
    expect(await linksOf(userId)).toEqual([
      { provider: "google", subject: "dev-google-1", email: "dev-person-1@example.com" },
    ]);
    // Taking the waiting sign-in ends it.
    expect(
      await api.connection.db
        .select()
        .from(providerSignIns)
        .where(eq(providerSignIns.pendingHash, hashToken(finished.data.pendingSignIn))),
    ).toEqual([]);

    const next = newVerifier();
    const again = await finish(await ticketFor(anna, next), next, "web");
    expect(again).toMatchObject({
      ok: true,
      data: { status: "signedIn", isNewUser: false, user: { id: userId } },
    });
    if (!again.ok || again.data.status !== "signedIn") return;
    expect(again.data.accessToken).toMatch(/^sr_at_/);
    // On the web the refresh token is a cookie, as after a phone code (ADR 0016).
    expect(again.data.refreshToken).toBeUndefined();
  });

  it("keeps no email Google has not verified", async () => {
    await freeUp(sol);
    const verified = await phoneStep(api.newPhoneNumber(), await pendingFor(sol));
    expect(verified).toMatchObject({
      ok: true,
      data: { providerLink: { email: null }, user: { email: null } },
    });
  });

  it("leaves the email to another account that has it (R19.4)", async () => {
    await freeUp(anna);
    const other = await api.signIn(api.newPhoneNumber());
    await api.connection.db
      .update(users)
      .set({ email: "dev-person-1@example.com", emailVerifiedAt: api.now() })
      .where(eq(users.id, other.userId));
    const verified = await phoneStep(api.newPhoneNumber(), await pendingFor(anna));
    expect(verified).toMatchObject({ ok: true, data: { isNewUser: true, user: { email: null } } });
    await api.connection.db.update(users).set({ email: null }).where(eq(users.id, other.userId));
  });

  it("refuses a sign-in that waited more than 30 minutes, and the code still works (review focus 3)", async () => {
    await freeUp(bjarni);
    const pending = await pendingFor(bjarni);
    api.advance(29 * 60);
    const phone = api.newPhoneNumber();
    // A code asked for at minute 29 works for its own 10 minutes.
    const code = await sendCode(phone);
    api.advance(60);
    expect(await verify(phone, code, pending)).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "provider_expired" },
    });
    expect(await verify(phone, code)).toMatchObject({ ok: true, data: { isNewUser: true } });
  });

  it("is refused a new account for a Google account another one has; the code is kept", async () => {
    await freeUp(anna);
    const first = await pendingFor(anna);
    const second = await pendingFor(anna);
    expect((await phoneStep(api.newPhoneNumber(), first)).ok).toBe(true);
    const phone = api.newPhoneNumber();
    const code = await sendCode(phone);
    expect(await verify(phone, code, second)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "provider_in_use" },
    });
    expect(await verify(phone, code)).toMatchObject({ ok: true, data: { isNewUser: true } });
  });

  it("makes one account when two phone steps race with one Google account (review focus 4)", async () => {
    await freeUp(anna);
    const first = await pendingFor(anna);
    const second = await pendingFor(anna);
    const phones = [api.newPhoneNumber(), api.newPhoneNumber()];
    const codes = [await sendCode(phones[0] ?? ""), await sendCode(phones[1] ?? "")];
    const results = await Promise.all([
      verify(phones[0] ?? "", codes[0] ?? "", first),
      verify(phones[1] ?? "", codes[1] ?? "", second),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({
      status: 409,
      error: { code: "provider_in_use" },
    });
    const made = await api.connection.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phoneE164, results[0].ok ? (phones[1] ?? "") : (phones[0] ?? "")));
    expect(made).toEqual([]);
  });

  it("logs no email and no provider identifier", async () => {
    await freeUp(anna);
    await phoneStep(api.newPhoneNumber(), await pendingFor(anna));
    const logs = api.logLines.join("\n");
    expect(logs).not.toContain("dev-person-1@example.com");
    expect(logs).not.toContain("dev-google-1");
    expect(logs).not.toMatch(/sr_(pt|ps|st)_/);
  });
});

describe("a member (spec 19, 3.3; plan 4.2)", () => {
  it("links Google to the number's account, and fills an empty email", async () => {
    await freeUp(anna);
    const phone = api.newPhoneNumber();
    const member = await api.signIn(phone);
    const verified = await phoneStep(phone, await pendingFor(anna));
    expect(verified).toMatchObject({
      ok: true,
      data: {
        isNewUser: false,
        providerLink: { provider: "google", outcome: "linked" },
        user: { id: member.userId, email: "dev-person-1@example.com" },
      },
    });
    expect(verified.ok && "suggestedFirstName" in verified.data).toBe(false);
  });

  it("never changes the member's own email", async () => {
    await freeUp(anna);
    const phone = api.newPhoneNumber();
    const member = await api.signIn(phone);
    await api.connection.db
      .update(users)
      .set({ email: "member-own@example.com", emailVerifiedAt: api.now() })
      .where(eq(users.id, member.userId));
    await phoneStep(phone, await pendingFor(anna));
    expect(await emailOf(member.userId)).toMatchObject({ email: "member-own@example.com" });
  });

  it("signs in without linking a Google account another account has", async () => {
    await freeUp(anna);
    const first = await pendingFor(anna);
    const second = await pendingFor(anna);
    expect((await phoneStep(api.newPhoneNumber(), first)).ok).toBe(true);
    const phone = api.newPhoneNumber();
    const member = await api.signIn(phone);
    expect(await phoneStep(phone, second)).toMatchObject({
      ok: true,
      data: { user: { id: member.userId }, providerLink: { outcome: "in_use" } },
    });
    expect(await linksOf(member.userId)).toEqual([]);
  });

  it("puts a new Google account in place of the old one, with its email (spec 19, 3.5)", async () => {
    await freeUp(anna);
    await freeUp(bjarni);
    const phone = api.newPhoneNumber();
    const member = await api.signIn(phone);
    await phoneStep(phone, await pendingFor(anna));
    expect(await emailOf(member.userId)).toMatchObject({ email: "dev-person-1@example.com" });
    expect(await phoneStep(phone, await pendingFor(bjarni))).toMatchObject({
      ok: true,
      data: { providerLink: { outcome: "replaced", email: "dev-person-2@privaterelay.example" } },
    });
    expect(await linksOf(member.userId)).toEqual([
      { provider: "google", subject: "dev-google-2", email: "dev-person-2@privaterelay.example" },
    ]);
    expect(await emailOf(member.userId)).toMatchObject({
      email: "dev-person-2@privaterelay.example",
    });
  });

  it("signs in a suspended person and an account waiting to be deleted, as the phone does (R19.6)", async () => {
    await freeUp(anna);
    const phone = api.newPhoneNumber();
    const member = await api.signIn(phone);
    await phoneStep(phone, await pendingFor(anna));
    await api.connection.db
      .update(users)
      .set({
        status: "suspended",
        suspendedUntil: new Date(api.now().getTime() + 86_400_000),
        deleteAfter: new Date(api.now().getTime() + 30 * 86_400_000),
      })
      .where(eq(users.id, member.userId));
    const verifier = newVerifier();
    expect(await finish(await ticketFor(anna, verifier), verifier)).toMatchObject({
      ok: true,
      data: { status: "signedIn", user: { id: member.userId } },
    });
  });
});

describe("Sign-in methods in Settings (spec 19, 3.4)", () => {
  async function prepare(accessToken: string, person: number) {
    const verifier = newVerifier();
    const ticket = await ticketFor(person, verifier);
    return api.client.call(prepareSignInMethodRoute, {
      accessToken,
      body: { ticket, verifier },
    });
  }

  async function confirmCode(accessToken: string, phone: string): Promise<string> {
    api.advance(31);
    newAddress();
    const sent = await api.client.call(sendConfirmCodeRoute, { accessToken, body: {} });
    if (!sent.ok) throw new Error(sent.error.code);
    return api.lastCode(phone);
  }

  it("adds Google with a confirm code, lists it and removes it", async () => {
    await freeUp(bjarni);
    await freeUp(sol);
    const phone = api.newPhoneNumber();
    const { accessToken, userId } = await api.signIn(phone);
    expect(await api.client.call(listSignInMethodsRoute, { accessToken })).toMatchObject({
      ok: true,
      data: { methods: [] },
    });

    const prepared = await prepare(accessToken, bjarni);
    expect(prepared).toMatchObject({
      ok: true,
      data: { provider: "google", email: "dev-person-2@privaterelay.example" },
    });
    if (!prepared.ok) return;
    const { pendingSignIn } = prepared.data;

    // A session alone never adds a way in (R19.3).
    expect(
      await api.client.call(addSignInMethodRoute, {
        accessToken,
        body: { pendingSignIn, code: "123456" },
      }),
    ).toMatchObject({ ok: false, status: 400, error: { code: "code_expired" } });
    const code = await confirmCode(accessToken, phone);
    const wrong = code === "000000" ? "111111" : "000000";
    expect(
      await api.client.call(addSignInMethodRoute, {
        accessToken,
        body: { pendingSignIn, code: wrong },
      }),
    ).toMatchObject({ ok: false, error: { code: "code_invalid" } });
    expect(
      await api.client.call(addSignInMethodRoute, { accessToken, body: { pendingSignIn, code } }),
    ).toMatchObject({
      ok: true,
      status: 201,
      data: { provider: "google", email: "dev-person-2@privaterelay.example" },
    });
    expect(await api.client.call(listSignInMethodsRoute, { accessToken })).toMatchObject({
      ok: true,
      data: { methods: [{ provider: "google", email: "dev-person-2@privaterelay.example" }] },
    });
    expect(await emailOf(userId)).toMatchObject({ email: "dev-person-2@privaterelay.example" });

    expect(await prepare(accessToken, sol)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "provider_already_linked" },
    });

    const params = { provider: "google" } as const;
    expect(await api.client.call(removeSignInMethodRoute, { accessToken, params })).toMatchObject({
      ok: true,
      status: 204,
    });
    expect(await api.client.call(removeSignInMethodRoute, { accessToken, params })).toMatchObject({
      ok: false,
      status: 404,
    });
    // The phone number stays, and so does the session (R19.7).
    expect(await api.client.call(listSignInMethodsRoute, { accessToken })).toMatchObject({
      ok: true,
      data: { methods: [] },
    });
  });

  it("refuses a Google account another account has before any code is asked for", async () => {
    await freeUp(anna);
    await phoneStep(api.newPhoneNumber(), await pendingFor(anna));
    const { accessToken } = await api.signIn(api.newPhoneNumber());
    expect(await prepare(accessToken, anna)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "provider_in_use" },
    });
  });

  it("keeps the prepared sign-in for this account only, and for 30 minutes", async () => {
    await freeUp(sol);
    const phone = api.newPhoneNumber();
    const mine = await api.signIn(phone);
    const prepared = await prepare(mine.accessToken, sol);
    if (!prepared.ok) throw new Error(prepared.error.code);
    const { pendingSignIn } = prepared.data;

    // Not as the phone step's waiting sign-in.
    expect(await phoneStep(api.newPhoneNumber(), pendingSignIn)).toMatchObject({
      ok: false,
      error: { code: "provider_expired" },
    });

    api.advance(30 * 60);
    // Signed in again: an access token lasts 15 minutes.
    const { accessToken } = await api.signIn(phone);
    const code = await confirmCode(accessToken, phone);
    expect(
      await api.client.call(addSignInMethodRoute, { accessToken, body: { pendingSignIn, code } }),
    ).toMatchObject({ ok: false, status: 400, error: { code: "provider_expired" } });
  });
});
