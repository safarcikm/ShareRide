import { createHash, createPrivateKey, type KeyObject } from "node:crypto";
import {
  err,
  ok,
  readProviderClaims,
  type ProviderClaims,
  type Result,
  type SignInProvider,
} from "@shareride/domain";
import { createRemoteJWKSet, customFetch, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";

// Google and Apple as OpenID Connect providers (ADR 0034; plan 4.3): where
// to send the person, and how to turn the code they come back with into
// the few claims ShareRide keeps. The routes do the rest.

export interface AuthorizationInput {
  readonly state: string;
  readonly nonce: string;
  /** The PKCE verifier; the provider gets only its challenge. */
  readonly codeVerifier: string;
  readonly redirectUri: string;
}

export interface RedeemInput {
  readonly code: string;
  readonly codeVerifier: string;
  readonly nonce: string;
  readonly redirectUri: string;
  /** Apple's `user` form field, sent only the first time (plan 4.3). */
  readonly appleUser?: unknown;
}

/**
 * Why a provider's answer was not taken, for the logs: never anything the
 * provider said about the person.
 */
export interface ProviderFailure {
  readonly code: "provider_failed";
  readonly reason: "token_request" | "id_token" | "nonce" | "claims";
}

/**
 * What a provider's answer gives: the claims ShareRide keeps and, from
 * Apple only, the refresh token that ends the link later (spec 37, R37.1).
 * The token never goes in a log, a response or the export (R37.3).
 */
export type RedeemedClaims = ProviderClaims & { readonly refreshToken?: string };

export interface IdentityProvider {
  readonly name: SignInProvider;
  /** The development stand-in, whose page the API serves itself. */
  readonly development?: boolean;
  authorizationUrl(input: AuthorizationInput): string;
  redeem(input: RedeemInput): Promise<Result<RedeemedClaims, ProviderFailure>>;
  /**
   * Apple only: asks Apple to end our access with a refresh token it gave
   * (spec 37, 3.2). True once Apple has taken it; false when it refused or
   * could not be reached, to be tried again.
   */
  readonly revoke?: (refreshToken: string) => Promise<boolean>;
}

/** The PKCE challenge of a verifier: SHA-256 in base64url without padding (RFC 7636, S256). */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

const failed = (reason: ProviderFailure["reason"]) =>
  err<ProviderFailure>({ code: "provider_failed", reason });

/** How long the provider's token endpoint may take. */
const tokenRequestMs = 10_000;
/** Clocks differ a little; Google's own libraries allow a minute too. */
const clockToleranceSeconds = 60;

export const googleEndpoints = {
  authorization: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  keys: "https://www.googleapis.com/oauth2/v3/certs",
  issuers: ["https://accounts.google.com", "accounts.google.com"],
} as const;

/** A token endpoint's answer: its `id_token` and, when it gave one, its `refresh_token`. */
interface TokenAnswer {
  readonly idToken: string;
  readonly refreshToken?: string;
}

/** Posts a form to a provider, within the time allowed; null when it could not be reached. */
async function postForm(
  fetchToken: typeof fetch,
  url: string,
  form: Record<string, string>,
): Promise<Response | null> {
  try {
    return await fetchToken(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(tokenRequestMs),
    });
  } catch {
    return null;
  }
}

/** Posts the form to a token endpoint and returns its tokens, or null. */
async function requestTokens(
  fetchToken: typeof fetch,
  url: string,
  form: Record<string, string>,
): Promise<TokenAnswer | null> {
  const response = await postForm(fetchToken, url, form);
  if (response === null || !response.ok) return null;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null) return null;
  const { id_token: idToken, refresh_token: refreshToken } = body as Record<string, unknown>;
  if (typeof idToken !== "string") return null;
  return typeof refreshToken === "string" && refreshToken !== ""
    ? { idToken, refreshToken }
    : { idToken };
}

/**
 * Whether the token was given to us (OpenID Connect Core 3.1.3.7): an
 * authorized party, when there is one, is our client, and a token for
 * several audiences must name one.
 */
function authorizedForUs(claims: Readonly<Record<string, unknown>>, clientId: string): boolean {
  if (claims.azp !== undefined) return claims.azp === clientId;
  return !(Array.isArray(claims.aud) && claims.aud.length > 1);
}

/**
 * Checks an ID token's signature, issuer, audience, authorized party,
 * expiry and nonce, then reads the claims ShareRide keeps (R19.4, R19.5).
 */
async function checkIdToken(
  idToken: string,
  options: {
    readonly keys: JWTVerifyGetKey;
    readonly issuer: string | readonly string[];
    readonly audience: string;
    readonly nonce: string;
    readonly now: Date;
    readonly appleUser?: unknown;
  },
): Promise<Result<ProviderClaims, ProviderFailure>> {
  let claims: Readonly<Record<string, unknown>>;
  try {
    const verified = await jwtVerify(idToken, options.keys, {
      issuer: [...(typeof options.issuer === "string" ? [options.issuer] : options.issuer)],
      audience: options.audience,
      // Google and Apple both sign their ID tokens with RS256.
      algorithms: ["RS256"],
      clockTolerance: clockToleranceSeconds,
      currentDate: options.now,
      requiredClaims: ["exp", "iss", "aud"],
    });
    claims = verified.payload;
  } catch {
    return failed("id_token");
  }
  if (!authorizedForUs(claims, options.audience)) return failed("id_token");
  if (claims.nonce !== options.nonce) return failed("nonce");
  const read = readProviderClaims({ claims, appleUser: options.appleUser });
  return read.ok ? read : failed("claims");
}

/** Sign in with Google: one OAuth client of type "Web application" (ADR 0034). */
export function createGoogleProvider(options: {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetch?: typeof fetch;
  /** Google's published keys; tests pass keys they made. */
  readonly keys?: JWTVerifyGetKey;
  readonly clock?: () => Date;
}): IdentityProvider {
  const fetchToken = options.fetch ?? fetch;
  const keys =
    options.keys ??
    createRemoteJWKSet(new URL(googleEndpoints.keys), { [customFetch]: fetchToken });
  const clock = options.clock ?? (() => new Date());
  return {
    name: "google",
    authorizationUrl(input) {
      const url = new URL(googleEndpoints.authorization);
      url.search = new URLSearchParams({
        response_type: "code",
        client_id: options.clientId,
        redirect_uri: input.redirectUri,
        scope: "openid email profile",
        state: input.state,
        nonce: input.nonce,
        code_challenge: pkceChallenge(input.codeVerifier),
        code_challenge_method: "S256",
        prompt: "select_account",
      }).toString();
      return url.toString();
    },
    async redeem(input) {
      const answer = await requestTokens(fetchToken, googleEndpoints.token, {
        grant_type: "authorization_code",
        code: input.code,
        client_id: options.clientId,
        client_secret: options.clientSecret,
        redirect_uri: input.redirectUri,
        code_verifier: input.codeVerifier,
      });
      if (answer === null) return failed("token_request");
      // Google's tokens are never kept (R37.1).
      return checkIdToken(answer.idToken, {
        keys,
        issuer: googleEndpoints.issuers,
        audience: options.clientId,
        nonce: input.nonce,
        now: clock(),
      });
    },
  };
}

export const appleEndpoints = {
  authorization: "https://appleid.apple.com/auth/authorize",
  token: "https://appleid.apple.com/auth/token",
  revoke: "https://appleid.apple.com/auth/revoke",
  keys: "https://appleid.apple.com/auth/keys",
  issuer: "https://appleid.apple.com",
} as const;

/** How long Apple's client secret is made for, and how early a new one is made. */
const appleSecretSeconds = 3600;
const appleSecretRenewSeconds = 300;
/** Issued a little in the past, so a server clock slightly ahead of Apple's does no harm. */
const appleSecretBackdateSeconds = 30;

/**
 * Sign in with Apple: a Services ID, and a key of the team that signs the
 * client secret (ADR 0034). Apple answers with a form POST, and sends the
 * person's name only the first time, in its `user` field.
 */
export function createAppleProvider(options: {
  readonly servicesId: string;
  readonly teamId: string;
  readonly keyId: string;
  /** The key's `.p8` file: a PKCS #8 PEM of a P-256 key. */
  readonly privateKey: string;
  readonly fetch?: typeof fetch;
  /** Apple's published keys; tests pass keys they made. */
  readonly keys?: JWTVerifyGetKey;
  readonly clock?: () => Date;
}): IdentityProvider {
  const fetchToken = options.fetch ?? fetch;
  const keys =
    options.keys ?? createRemoteJWKSet(new URL(appleEndpoints.keys), { [customFetch]: fetchToken });
  const clock = options.clock ?? (() => new Date());
  const signingKey: KeyObject = createPrivateKey(options.privateKey);
  let secret: { readonly value: string; readonly renewAt: number } | undefined;

  /** The client secret: a JWT signed with the team's key, kept until 5 minutes before it ends. */
  async function clientSecret(now: Date): Promise<string> {
    if (secret !== undefined && now.getTime() < secret.renewAt) return secret.value;
    const issuedAt = Math.floor(now.getTime() / 1000) - appleSecretBackdateSeconds;
    const value = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: options.keyId })
      .setIssuer(options.teamId)
      .setSubject(options.servicesId)
      .setAudience(appleEndpoints.issuer)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + appleSecretSeconds)
      .sign(signingKey);
    secret = { value, renewAt: (issuedAt + appleSecretSeconds - appleSecretRenewSeconds) * 1000 };
    return value;
  }

  return {
    name: "apple",
    authorizationUrl(input) {
      const url = new URL(appleEndpoints.authorization);
      url.search = new URLSearchParams({
        response_type: "code",
        response_mode: "form_post",
        client_id: options.servicesId,
        redirect_uri: input.redirectUri,
        scope: "name email",
        state: input.state,
        nonce: input.nonce,
      }).toString();
      return url.toString();
    },
    async redeem(input) {
      const now = clock();
      const answer = await requestTokens(fetchToken, appleEndpoints.token, {
        grant_type: "authorization_code",
        code: input.code,
        client_id: options.servicesId,
        client_secret: await clientSecret(now),
        redirect_uri: input.redirectUri,
      });
      if (answer === null) return failed("token_request");
      const checked = await checkIdToken(answer.idToken, {
        keys,
        issuer: appleEndpoints.issuer,
        audience: options.servicesId,
        nonce: input.nonce,
        now,
        appleUser: input.appleUser,
      });
      if (!checked.ok || answer.refreshToken === undefined) return checked;
      return ok({ ...checked.value, refreshToken: answer.refreshToken });
    },
    async revoke(refreshToken) {
      const response = await postForm(fetchToken, appleEndpoints.revoke, {
        client_id: options.servicesId,
        client_secret: await clientSecret(clock()),
        token: refreshToken,
        token_type_hint: "refresh_token",
      });
      // Apple's answer has no body worth reading; free the connection.
      await response?.body?.cancel().catch(() => undefined);
      return response?.ok === true;
    },
  };
}

/**
 * Made-up people for the development provider: one with a verified email,
 * one with a hidden, relay-style email, and one whose email is not verified.
 */
export const devPeople = [
  {
    label: "Anna, with a verified email",
    claims: { email: "dev-person-1@example.com", email_verified: true, given_name: "Anna" },
  },
  {
    label: "Bjarni, who hid his email",
    claims: {
      email: "dev-person-2@privaterelay.example",
      email_verified: true,
      given_name: "Bjarni",
    },
  },
  {
    label: "Sól, whose email is not verified",
    claims: { email: "dev-person-3@example.com", email_verified: false, given_name: "Sól" },
  },
] as const;

/** Where the development provider's page is, on the API itself. */
export const devProviderPath = (provider: SignInProvider) => `/v1/auth/oauth/dev/${provider}`;

const encodeDevCode = (person: number, nonce: string) =>
  Buffer.from(JSON.stringify({ person, nonce })).toString("base64url");

function decodeDevCode(code: string): { person: number; nonce: string } | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(code, "base64url").toString());
    if (typeof value !== "object" || value === null) return null;
    const { person, nonce } = value as { person?: unknown; nonce?: unknown };
    return typeof person === "number" && typeof nonce === "string" ? { person, nonce } : null;
  } catch {
    return null;
  }
}

/**
 * A stand-in for Google or Apple in development and tests (ADR 0034): our
 * own page instead of theirs, and a code that says who was chosen. The
 * configuration refuses it under NODE_ENV=production.
 */
export function createDevProvider(options: {
  readonly name: SignInProvider;
  readonly apiOrigin: string;
}): IdentityProvider {
  const { name } = options;
  return {
    name,
    development: true,
    authorizationUrl(input) {
      const url = new URL(devProviderPath(name), options.apiOrigin);
      url.search = new URLSearchParams({
        state: input.state,
        nonce: input.nonce,
        redirect_uri: input.redirectUri,
      }).toString();
      return url.toString();
    },
    redeem(input) {
      const decoded = decodeDevCode(input.code);
      const person = decoded === null ? undefined : devPeople[decoded.person];
      if (decoded === null || person === undefined) return Promise.resolve(failed("token_request"));
      if (decoded.nonce !== input.nonce) return Promise.resolve(failed("nonce"));
      // Apple's ID token has no name: it comes in the form's user field.
      const { given_name: givenName, ...withoutName } = person.claims;
      const read = readProviderClaims({
        claims: {
          sub: `dev-${name}-${String(decoded.person + 1)}`,
          ...(name === "apple" ? withoutName : { ...withoutName, given_name: givenName }),
        },
        appleUser: input.appleUser,
      });
      if (!read.ok) return Promise.resolve(failed("claims"));
      // A made-up refresh token, as Apple gives one, so tests see it kept (spec 37, 3.4).
      return Promise.resolve(
        name === "apple"
          ? ok({ ...read.value, refreshToken: `dev-apple-refresh-${String(decoded.person + 1)}` })
          : read,
      );
    },
    // Nothing is sent anywhere without Apple's keys (R37.4).
    ...(name === "apple" ? { revoke: () => Promise.resolve(true) } : {}),
  };
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ??
      character,
  );

/**
 * The development provider's page: each made-up person, and Cancel, back
 * to the callback: as links for Google, and as forms posted for Apple, with
 * the name in the `user` field as Apple sends it the first time.
 * Development only, so in English.
 */
export function devSignInPage(input: {
  readonly provider: SignInProvider;
  readonly state: string;
  readonly nonce: string;
  readonly redirectUri: string;
}): string {
  const link = (label: string, params: Record<string, string>) => {
    const url = new URL(input.redirectUri);
    url.search = new URLSearchParams({ ...params, state: input.state }).toString();
    return `<a href="${escapeHtml(url.toString())}">${escapeHtml(label)}</a>`;
  };
  const form = (label: string, params: Record<string, string>) => {
    const fields = Object.entries({ state: input.state, ...params })
      .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`)
      .join("");
    return `<form method="post" action="${escapeHtml(input.redirectUri)}">${fields}<button>${escapeHtml(label)}</button></form>`;
  };
  const apple = input.provider === "apple";
  const back = apple ? form : link;
  const title = apple ? "Apple (development)" : "Google (development)";
  const people = devPeople
    .map((person, index) => {
      const code = encodeDevCode(index, input.nonce);
      const user = JSON.stringify({
        name: { firstName: person.claims.given_name, lastName: "Dev" },
        email: person.claims.email,
      });
      return `<li>${back(person.label, apple ? { code, user } : { code })}</li>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body>
<h1>${title}</h1>
<p>A stand-in for the real sign-in page. Choose who you are:</p>
<ul>
${people}
</ul>
<p>${back("Cancel", { error: apple ? "user_cancelled_authorize" : "access_denied" })}</p>
</body>
</html>
`;
}
