import { createHash } from "node:crypto";
import {
  createLocalJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  jwtVerify,
  SignJWT,
  type JWK,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  appleEndpoints,
  createAppleProvider,
  createDevProvider,
  createGoogleProvider,
  devPeople,
  devSignInPage,
  googleEndpoints,
  pkceChallenge,
} from "./identity-providers.ts";

const clientId = "test-client.apps.googleusercontent.com";
const redirectUri = "https://api.shareride.test/v1/auth/oauth/google/callback";
const now = new Date("2026-11-22T12:00:00.000Z");
const nowSeconds = Math.floor(now.getTime() / 1000);

let signingKey: CryptoKey;
let otherKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  signingKey = pair.privateKey;
  otherKey = other.privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "key-1", alg: "RS256" };
  keys = createLocalJWKSet({ keys: [jwk] });
});

interface TokenOptions {
  readonly key?: CryptoKey;
  readonly claims?: Record<string, unknown>;
  readonly issuer?: string;
  readonly audience?: string | readonly string[];
  readonly expiresAt?: number;
  readonly subject?: string;
}

function idToken(options: TokenOptions = {}): Promise<string> {
  return new SignJWT({
    nonce: "the-nonce",
    email: "person@example.com",
    email_verified: true,
    given_name: "Ana",
    ...options.claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "key-1" })
    .setSubject(options.subject ?? "google-subject-1")
    .setIssuer(options.issuer ?? "https://accounts.google.com")
    .setAudience(
      typeof options.audience === "object" ? [...options.audience] : (options.audience ?? clientId),
    )
    .setIssuedAt(nowSeconds - 10)
    .setExpirationTime(options.expiresAt ?? nowSeconds + 3600)
    .sign(options.key ?? signingKey);
}

/** A token endpoint that answers with the given body and keeps what it was sent. */
function fakeTokenEndpoint(answer: () => Promise<Response>) {
  const requests: { url: string; body: URLSearchParams }[] = [];
  const fetchFake = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const body = typeof init?.body === "string" ? init.body : "";
    requests.push({ url, body: new URLSearchParams(body) });
    return answer();
  }) as typeof fetch;
  return { requests, fetch: fetchFake };
}

function google(fetchFake: typeof fetch) {
  return createGoogleProvider({
    clientId,
    clientSecret: "test-secret",
    fetch: fetchFake,
    keys,
    clock: () => now,
  });
}

const redeemInput = {
  code: "the-code",
  codeVerifier: "v".repeat(64),
  nonce: "the-nonce",
  redirectUri,
};

describe("pkceChallenge", () => {
  it("is SHA-256 in base64url without padding (RFC 7636)", () => {
    // The example of RFC 7636, appendix B.
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});

describe("Google (plan 4.3)", () => {
  it("sends the person to Google with PKCE, a nonce and the account chooser", () => {
    const url = new URL(
      google(fakeTokenEndpoint(() => Promise.resolve(new Response())).fetch).authorizationUrl({
        state: "the-state",
        nonce: "the-nonce",
        codeVerifier: "v".repeat(64),
        redirectUri,
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(googleEndpoints.authorization);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "openid email profile",
      state: "the-state",
      nonce: "the-nonce",
      code_challenge: createHash("sha256").update("v".repeat(64)).digest("base64url"),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
  });

  it("trades the code for an ID token and keeps the subject, a verified email and the first name", async () => {
    const token = await idToken();
    const endpoint = fakeTokenEndpoint(() =>
      Promise.resolve(Response.json({ id_token: token, access_token: "ignored" })),
    );
    expect(await google(endpoint.fetch).redeem(redeemInput)).toEqual({
      ok: true,
      value: { subject: "google-subject-1", email: "person@example.com", firstName: "Ana" },
    });
    expect(endpoint.requests).toHaveLength(1);
    expect(endpoint.requests[0]?.url).toBe(googleEndpoints.token);
    expect(Object.fromEntries(endpoint.requests[0]?.body ?? [])).toEqual({
      grant_type: "authorization_code",
      code: "the-code",
      client_id: clientId,
      client_secret: "test-secret",
      redirect_uri: redirectUri,
      code_verifier: "v".repeat(64),
    });
  });

  it("keeps no token of Google's (R37.1)", async () => {
    const token = await idToken();
    const endpoint = fakeTokenEndpoint(() =>
      Promise.resolve(Response.json({ id_token: token, refresh_token: "google-refresh" })),
    );
    const provider = google(endpoint.fetch);
    const redeemed = await provider.redeem(redeemInput);
    expect(redeemed.ok && redeemed.value).not.toHaveProperty("refreshToken");
    expect(provider.revoke).toBeUndefined();
  });

  it("takes Google's issuer without https too", async () => {
    const token = await idToken({ issuer: "accounts.google.com" });
    const endpoint = fakeTokenEndpoint(() => Promise.resolve(Response.json({ id_token: token })));
    expect(await google(endpoint.fetch).redeem(redeemInput)).toMatchObject({ ok: true });
  });

  it("leaves out an email Google has not verified", async () => {
    const token = await idToken({ claims: { email_verified: false } });
    const endpoint = fakeTokenEndpoint(() => Promise.resolve(Response.json({ id_token: token })));
    expect(await google(endpoint.fetch).redeem(redeemInput)).toMatchObject({
      ok: true,
      value: { email: null },
    });
  });

  it.each([
    ["signed with another key", { key: "other" }, "id_token"],
    ["for another client", { audience: "someone-else" }, "id_token"],
    [
      "for us and another client, with no authorized party",
      { audience: [clientId, "other"] },
      "id_token",
    ],
    ["authorized for another client", { claims: { azp: "someone-else" } }, "id_token"],
    ["from another issuer", { issuer: "https://evil.example" }, "id_token"],
    ["expired more than a minute ago", { expiresAt: nowSeconds - 61 }, "id_token"],
    ["with another nonce", { claims: { nonce: "old-nonce" } }, "nonce"],
    ["without a nonce", { claims: { nonce: undefined } }, "nonce"],
  ] as const)("refuses an ID token %s", async (_case, options, reason) => {
    const token = await idToken({
      ...("key" in options ? { key: otherKey } : {}),
      ...("audience" in options ? { audience: options.audience } : {}),
      ...("issuer" in options ? { issuer: options.issuer } : {}),
      ...("expiresAt" in options ? { expiresAt: options.expiresAt } : {}),
      ...("claims" in options ? { claims: options.claims } : {}),
    });
    const endpoint = fakeTokenEndpoint(() => Promise.resolve(Response.json({ id_token: token })));
    expect(await google(endpoint.fetch).redeem(redeemInput)).toEqual({
      ok: false,
      error: { code: "provider_failed", reason },
    });
  });

  it("takes a token that expired less than a minute ago (clock skew)", async () => {
    const token = await idToken({ expiresAt: nowSeconds - 30 });
    const endpoint = fakeTokenEndpoint(() => Promise.resolve(Response.json({ id_token: token })));
    expect(await google(endpoint.fetch).redeem(redeemInput)).toMatchObject({ ok: true });
  });

  it.each([
    [
      "refuses the code",
      () => Promise.resolve(Response.json({ error: "invalid_grant" }, { status: 400 })),
    ],
    ["answers without an ID token", () => Promise.resolve(Response.json({ access_token: "x" }))],
    ["answers something that is not JSON", () => Promise.resolve(new Response("<html>"))],
    ["cannot be reached", () => Promise.reject(new TypeError("fetch failed"))],
  ])("fails when the token endpoint %s", async (_case, answer) => {
    const endpoint = fakeTokenEndpoint(answer);
    expect(await google(endpoint.fetch).redeem(redeemInput)).toEqual({
      ok: false,
      error: { code: "provider_failed", reason: "token_request" },
    });
  });

  it("refuses an ID token without a subject", async () => {
    const token = await new SignJWT({ nonce: "the-nonce" })
      .setProtectedHeader({ alg: "RS256", kid: "key-1" })
      .setIssuer("https://accounts.google.com")
      .setAudience(clientId)
      .setExpirationTime(nowSeconds + 3600)
      .sign(signingKey);
    const endpoint = fakeTokenEndpoint(() => Promise.resolve(Response.json({ id_token: token })));
    expect(await google(endpoint.fetch).redeem(redeemInput)).toEqual({
      ok: false,
      error: { code: "provider_failed", reason: "claims" },
    });
  });
});

describe("the development provider (plan 4.3)", () => {
  const apiOrigin = "http://localhost:3000";
  const dev = createDevProvider({ name: "google", apiOrigin });
  const callback = `${apiOrigin}/v1/auth/oauth/google/callback`;

  it("sends the person to our own page", () => {
    const url = new URL(
      dev.authorizationUrl({
        state: "the-state",
        nonce: "the-nonce",
        codeVerifier: "v".repeat(64),
        redirectUri: callback,
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(`${apiOrigin}/v1/auth/oauth/dev/google`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      state: "the-state",
      nonce: "the-nonce",
      redirect_uri: callback,
    });
  });

  it("lists made-up people: with a verified email, a hidden one, and an unverified one", () => {
    expect(devPeople.map((person) => person.claims.email_verified)).toEqual([true, true, false]);
    for (const person of devPeople) {
      expect(person.claims.email).toMatch(/@(example\.com|privaterelay\.example)$/);
    }
  });

  it("links each person back to the callback with the state, and offers Cancel", () => {
    const page = devSignInPage({
      provider: "google",
      state: "the-state",
      nonce: "the-nonce",
      redirectUri: callback,
    });
    expect(page).toContain("<!doctype html>");
    const hrefs = [...page.matchAll(/href="([^"]+)"/g)].map(
      (match) => new URL((match[1] ?? "").replaceAll("&amp;", "&")),
    );
    expect(hrefs).toHaveLength(devPeople.length + 1);
    for (const href of hrefs) {
      expect(`${href.origin}${href.pathname}`).toBe(callback);
      expect(href.searchParams.get("state")).toBe("the-state");
    }
    expect(hrefs.at(-1)?.searchParams.get("error")).toBe("access_denied");
  });

  it("escapes what it is given", () => {
    const page = devSignInPage({
      provider: "google",
      state: '"><script>',
      nonce: "n",
      redirectUri: callback,
    });
    expect(page).not.toContain("<script>");
  });

  it("answers with the person chosen when the nonce matches", async () => {
    const page = devSignInPage({
      provider: "google",
      state: "s",
      nonce: "the-nonce",
      redirectUri: callback,
    });
    const first = /href="([^"]+)"/.exec(page)?.[1]?.replaceAll("&amp;", "&") ?? "";
    const code = new URL(first).searchParams.get("code") ?? "";
    expect(await dev.redeem({ ...redeemInput, code, redirectUri: callback })).toEqual({
      ok: true,
      value: { subject: "dev-google-1", email: "dev-person-1@example.com", firstName: "Anna" },
    });
    expect(
      await dev.redeem({ ...redeemInput, code, nonce: "other", redirectUri: callback }),
    ).toEqual({ ok: false, error: { code: "provider_failed", reason: "nonce" } });
  });

  it("answers for Apple with forms posted to the callback, and the name in the user field", async () => {
    const appleDev = createDevProvider({ name: "apple", apiOrigin });
    const appleCallback = `${apiOrigin}/v1/auth/oauth/apple/callback`;
    const page = devSignInPage({
      provider: "apple",
      state: "the-state",
      nonce: "the-nonce",
      redirectUri: appleCallback,
    });
    const forms = [...page.matchAll(/<form method="post" action="([^"]+)">([\s\S]*?)<\/form>/g)];
    expect(forms).toHaveLength(devPeople.length + 1);
    const fields = forms.map(([, action, body]): Record<string, string> => {
      expect(action).toBe(appleCallback);
      return Object.fromEntries(
        [...(body ?? "").matchAll(/name="([^"]+)" value="([^"]*)"/g)].map(([, name, value]) => [
          name ?? "",
          (value ?? "").replaceAll("&quot;", '"'),
        ]),
      );
    });
    expect(fields.at(-1)).toEqual({ state: "the-state", error: "user_cancelled_authorize" });
    const first = fields[0] ?? {};
    expect(first.state).toBe("the-state");
    const user: unknown = JSON.parse(first.user ?? "null");
    expect(user).toMatchObject({ name: { firstName: "Anna" } });
    const redeem = { ...redeemInput, code: first.code ?? "", redirectUri: appleCallback };
    expect(await appleDev.redeem({ ...redeem, appleUser: user })).toEqual({
      ok: true,
      value: {
        subject: "dev-apple-1",
        email: "dev-person-1@example.com",
        firstName: "Anna",
        // Made up, as Apple's would be, so tests see it kept (spec 37, 3.4).
        refreshToken: "dev-apple-refresh-1",
      },
    });
    // Apple sends the name only the first time.
    expect(await appleDev.redeem(redeem)).toMatchObject({ ok: true, value: { firstName: null } });
  });

  it("revokes a stand-in Apple token without asking anyone (R37.4)", async () => {
    const appleDev = createDevProvider({ name: "apple", apiOrigin });
    expect(await appleDev.revoke?.("dev-apple-refresh-1")).toBe(true);
    // Google's tokens are never kept, so the stand-in Google revokes nothing.
    expect(dev.revoke).toBeUndefined();
  });

  it("fails on a code it did not make", async () => {
    expect(await dev.redeem({ ...redeemInput, code: "garbage" })).toEqual({
      ok: false,
      error: { code: "provider_failed", reason: "token_request" },
    });
  });
});

describe("Apple (plan 4.3)", () => {
  const servicesId = "is.puffinride.preview.web";
  const appleRedirect = "https://api.shareride.test/v1/auth/oauth/apple/callback";
  let teamKey: { privateKey: CryptoKey; publicKey: CryptoKey };
  let teamKeyPem: string;

  beforeAll(async () => {
    teamKey = await generateKeyPair("ES256", { extractable: true });
    teamKeyPem = await exportPKCS8(teamKey.privateKey);
  });

  function apple(fetchFake: typeof fetch, clock: () => Date = () => now) {
    return createAppleProvider({
      servicesId,
      teamId: "TEAM123456",
      keyId: "KEY1234567",
      privateKey: teamKeyPem,
      fetch: fetchFake,
      keys,
      clock,
    });
  }

  const appleToken = (claims: Record<string, unknown> = {}) =>
    idToken({
      issuer: appleEndpoints.issuer,
      audience: servicesId,
      subject: "000123.apple-subject.0456",
      claims: { given_name: undefined, email_verified: "true", ...claims },
    });

  const appleRedeem = { ...redeemInput, redirectUri: appleRedirect };

  it("sends the person to Apple, asking for the name and email, answered by a form", () => {
    const url = new URL(
      apple(fakeTokenEndpoint(() => Promise.resolve(new Response())).fetch).authorizationUrl({
        state: "the-state",
        nonce: "the-nonce",
        codeVerifier: "v".repeat(64),
        redirectUri: appleRedirect,
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(appleEndpoints.authorization);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      response_mode: "form_post",
      client_id: servicesId,
      redirect_uri: appleRedirect,
      scope: "name email",
      state: "the-state",
      nonce: "the-nonce",
    });
  });

  it("trades the code with a client secret it signs, and keeps the first name from the form", async () => {
    const token = await appleToken();
    const endpoint = fakeTokenEndpoint(() => Promise.resolve(Response.json({ id_token: token })));
    expect(
      await apple(endpoint.fetch).redeem({
        ...appleRedeem,
        appleUser: { name: { firstName: "Bjarni", lastName: "Not kept" } },
      }),
    ).toEqual({
      ok: true,
      value: {
        subject: "000123.apple-subject.0456",
        email: "person@example.com",
        firstName: "Bjarni",
      },
    });
    const form = Object.fromEntries(endpoint.requests[0]?.body ?? []);
    expect(endpoint.requests[0]?.url).toBe(appleEndpoints.token);
    expect(form).toMatchObject({
      grant_type: "authorization_code",
      code: "the-code",
      client_id: servicesId,
      redirect_uri: appleRedirect,
    });
    expect(form).not.toHaveProperty("code_verifier");
    const secret = form.client_secret ?? "";
    expect(decodeProtectedHeader(secret)).toEqual({ alg: "ES256", kid: "KEY1234567" });
    const { payload } = await jwtVerify(secret, teamKey.publicKey, {
      issuer: "TEAM123456",
      audience: appleEndpoints.issuer,
      subject: servicesId,
      currentDate: now,
    });
    expect(payload.iat).toBe(nowSeconds - 30);
    expect(payload.exp).toBe(nowSeconds - 30 + 3600);
  });

  it("finishes without the form's name, which Apple sends only the first time", async () => {
    const token = await appleToken();
    const endpoint = fakeTokenEndpoint(() => Promise.resolve(Response.json({ id_token: token })));
    expect(await apple(endpoint.fetch).redeem(appleRedeem)).toMatchObject({
      ok: true,
      value: { firstName: null },
    });
  });

  it("keeps its client secret, and makes a new one 5 minutes before it ends", async () => {
    let time = now;
    const endpoint = fakeTokenEndpoint(async () => Response.json({ id_token: await appleToken() }));
    const provider = apple(endpoint.fetch, () => time);
    const secretAt = async (minutes: number) => {
      time = new Date(now.getTime() + minutes * 60_000);
      await provider.redeem(appleRedeem);
      return endpoint.requests.at(-1)?.body.get("client_secret");
    };
    const first = await secretAt(0);
    expect(await secretAt(54)).toBe(first);
    const second = await secretAt(55);
    expect(second).not.toBe(first);
    expect(decodeJwt(second ?? "").iat).toBe(nowSeconds + 55 * 60 - 30);
  });

  it.each([
    ["from Google's issuer", { issuer: "https://accounts.google.com" }],
    ["for another Services ID", { audience: "someone.else" }],
  ])("refuses an ID token %s", async (_case, options) => {
    const token = await idToken({
      subject: "000123.apple-subject.0456",
      issuer: appleEndpoints.issuer,
      audience: servicesId,
      ...options,
    });
    const endpoint = fakeTokenEndpoint(() => Promise.resolve(Response.json({ id_token: token })));
    expect(await apple(endpoint.fetch).redeem(appleRedeem)).toEqual({
      ok: false,
      error: { code: "provider_failed", reason: "id_token" },
    });
  });

  it("keeps the refresh token Apple answers with, to end the link later (R37.1)", async () => {
    const token = await appleToken();
    const endpoint = fakeTokenEndpoint(() =>
      Promise.resolve(
        Response.json({ id_token: token, refresh_token: "r.apple-refresh", access_token: "a.x" }),
      ),
    );
    expect(await apple(endpoint.fetch).redeem(appleRedeem)).toMatchObject({
      ok: true,
      value: { subject: "000123.apple-subject.0456", refreshToken: "r.apple-refresh" },
    });
  });

  it("gives no refresh token when Apple's answer has none", async () => {
    const token = await appleToken();
    const endpoint = fakeTokenEndpoint(() =>
      Promise.resolve(Response.json({ id_token: token, refresh_token: 42 })),
    );
    const redeemed = await apple(endpoint.fetch).redeem(appleRedeem);
    expect(redeemed.ok && redeemed.value).not.toHaveProperty("refreshToken");
  });

  it("revokes a refresh token with Apple, with its client secret (spec 37, 3.2)", async () => {
    const endpoint = fakeTokenEndpoint(() => Promise.resolve(new Response(null, { status: 200 })));
    expect(await apple(endpoint.fetch).revoke?.("r.apple-refresh")).toBe(true);
    expect(endpoint.requests[0]?.url).toBe(appleEndpoints.revoke);
    const form = Object.fromEntries(endpoint.requests[0]?.body ?? []);
    expect(form).toMatchObject({
      client_id: servicesId,
      token: "r.apple-refresh",
      token_type_hint: "refresh_token",
    });
    const { payload } = await jwtVerify(form.client_secret ?? "", teamKey.publicKey, {
      issuer: "TEAM123456",
      audience: appleEndpoints.issuer,
      subject: servicesId,
      currentDate: now,
    });
    expect(payload.iat).toBe(nowSeconds - 30);
  });

  it("says a revocation failed when Apple refuses it or cannot be reached", async () => {
    const refused = fakeTokenEndpoint(() =>
      Promise.resolve(Response.json({ error: "invalid_client" }, { status: 400 })),
    );
    expect(await apple(refused.fetch).revoke?.("r.apple-refresh")).toBe(false);
    const unreachable = (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
    expect(await apple(unreachable).revoke?.("r.apple-refresh")).toBe(false);
  });

  it("fails when Apple's token endpoint refuses the code", async () => {
    const endpoint = fakeTokenEndpoint(() =>
      Promise.resolve(Response.json({ error: "invalid_grant" }, { status: 400 })),
    );
    expect(await apple(endpoint.fetch).redeem(appleRedeem)).toEqual({
      ok: false,
      error: { code: "provider_failed", reason: "token_request" },
    });
  });
});
