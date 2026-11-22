import { createHash } from "node:crypto";
import {
  err,
  readProviderClaims,
  type ProviderClaims,
  type Result,
  type SignInProvider,
} from "@shareride/domain";
import { createRemoteJWKSet, customFetch, jwtVerify, type JWTVerifyGetKey } from "jose";

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

export interface IdentityProvider {
  readonly name: SignInProvider;
  /** The development stand-in, whose page the API serves itself. */
  readonly development?: boolean;
  authorizationUrl(input: AuthorizationInput): string;
  redeem(input: RedeemInput): Promise<Result<ProviderClaims, ProviderFailure>>;
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

/** Posts the form to a token endpoint and returns its `id_token`, or null. */
async function requestIdToken(
  fetchToken: typeof fetch,
  url: string,
  form: Record<string, string>,
): Promise<string | null> {
  try {
    const response = await fetchToken(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(tokenRequestMs),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const idToken =
      typeof body === "object" && body !== null && "id_token" in body ? body.id_token : undefined;
    return typeof idToken === "string" ? idToken : null;
  } catch {
    return null;
  }
}

/**
 * Checks an ID token's signature, issuer, audience, expiry and nonce, then
 * reads the claims ShareRide keeps (R19.4, R19.5).
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
      algorithms: ["RS256", "ES256"],
      clockTolerance: clockToleranceSeconds,
      currentDate: options.now,
      requiredClaims: ["exp", "iss", "aud"],
    });
    claims = verified.payload;
  } catch {
    return failed("id_token");
  }
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
      const idToken = await requestIdToken(fetchToken, googleEndpoints.token, {
        grant_type: "authorization_code",
        code: input.code,
        client_id: options.clientId,
        client_secret: options.clientSecret,
        redirect_uri: input.redirectUri,
        code_verifier: input.codeVerifier,
      });
      if (idToken === null) return failed("token_request");
      return checkIdToken(idToken, {
        keys,
        issuer: googleEndpoints.issuers,
        audience: options.clientId,
        nonce: input.nonce,
        now: clock(),
      });
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
      const read = readProviderClaims({
        claims: { sub: `dev-${name}-${String(decoded.person + 1)}`, ...person.claims },
        appleUser: input.appleUser,
      });
      return Promise.resolve(read.ok ? read : failed("claims"));
    },
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
 * The development provider's page: each made-up person, and Cancel, as
 * links back to the callback. Development only, so in English.
 */
export function devSignInPage(input: {
  readonly provider: SignInProvider;
  readonly state: string;
  readonly nonce: string;
  readonly redirectUri: string;
}): string {
  const back = (params: Record<string, string>) => {
    const url = new URL(input.redirectUri);
    url.search = new URLSearchParams({ ...params, state: input.state }).toString();
    return escapeHtml(url.toString());
  };
  const title = input.provider === "apple" ? "Apple (development)" : "Google (development)";
  const people = devPeople
    .map(
      (person, index) =>
        `<li><a href="${back({ code: encodeDevCode(index, input.nonce) })}">${escapeHtml(person.label)}</a></li>`,
    )
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
<p><a href="${back({ error: "access_denied" })}">Cancel</a></p>
</body>
</html>
`;
}
