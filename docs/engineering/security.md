# Security

**Owner:** Martin · **Last reviewed:** 2026-11-13

ShareRide brings strangers together in cars and stores where people travel.
Security failures here can hurt people physically, not only financially. We
use the [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
(ASVS) level 2 as the checklist for the API and the
[OWASP Mobile Application Security](https://mas.owasp.org/) guidance for the
apps.

## Threats we design against

| Threat | Example | Main controls |
| ------ | ------- | ------------- |
| Account takeover | SIM swap, guessed codes | Code expiry and attempt limits, device sessions list, re-verification for sensitive changes |
| SMS fraud (SMS pumping) | Bots trigger thousands of codes to premium numbers | Rate limits per IP, number and prefix; country allow-list; bot checks; spending alerts |
| Scraping and stalking | Collecting who travels where and when | Public profiles show first name only; exact trip details and vehicle plate only to booked passengers; rate-limited search |
| Broken access control | Editing someone else's trip, reading other people's chats | Ownership checks in every application service; tests for each endpoint as another user |
| Overbooking or price tampering | Race conditions, manipulated requests | Server computes prices and availability; transactional capacity check; database constraints |
| Harassment | Abusive messages, unsafe behaviour | Report and block, moderation queue, suspension, retained evidence for reports |
| Data breach | Leaked database or backups | Encryption at rest and in transit, least-privilege database roles, no personal data in logs, access audit |
| Supply chain | Malicious package or action | Lockfile, pinned actions, dependency review, minimal dependencies |
| Admin misuse | Operator account compromised | Separate operator role, passkey or hardware-key sign-in, audit log of every admin action |

## Baseline controls

- HTTPS everywhere; HSTS on the web.
- Tokens stored in secure storage on devices (Keychain, Keystore), HTTP-only
  cookies on the web.
- Input validated with shared Zod schemas at the API edge; output encoded.
- Rate limiting on sign-in, search, booking, messaging and reporting.
- Secrets only in environment secret stores; rotated when people or providers
  change.
- Database: separate roles for the app, migrations and read-only analysis.
- Backups encrypted and access-restricted.
- Security headers and a content security policy on web properties.
- Dependencies and containers scanned in CI; critical findings block merge.

## Sign-in and sessions

How [ADR 0016](../decisions/0016-own-sign-in-module.md) is built, in
`apps/api/src/modules/auth` with the rules in `packages/domain/src/auth`.

- **Codes:** 6 digits from `crypto.randomInt`, valid 10 minutes, 5 attempts.
  Stored as HMAC-SHA-256 keyed with `AUTH_SECRET`, bound to the number, and
  compared in constant time. Only the newest code for a number works; a used
  code is deleted. The number itself is stored only as a keyed hash until the
  account exists.
- **Number guessing:** "send code" answers the same for every valid number,
  whether or not it has an account. Wrong codes count against the code; after
  5 the person must ask for a new code, which the sending limits slow down.
- **Sending limits:** per number, per IP address and per country calling code
  (plan section 4.2). Keys are keyed hashes, so the table holds no numbers or
  addresses. The IP address comes from `X-Forwarded-For` only when
  `TRUST_PROXY=true`, and then from the entry our load balancer added. A
  per-prefix limit logs a warning (milestone 2 turns it into an alert).
- **Tokens:** 256 random bits, prefixed `sr_at_` (access) or `sr_rt_`
  (refresh) so leaked tokens are easy to recognise, and stored only as
  SHA-256 hashes. Access tokens last 15 minutes. Every refresh replaces both
  tokens and deletes the session's earlier access tokens. Refresh tokens
  expire after 60 days without use.
- **Stolen refresh tokens:** a replaced refresh token that comes back ends the
  whole session and logs a warning. The exception is the immediately previous
  token within 30 seconds, treated as a retry after a lost reply.
- **Web:** the refresh token is a cookie with `HttpOnly`, `SameSite=Strict`,
  `Path=/v1/auth` and, in production, `Secure`; the access token stays in
  memory. Browsers may call the API with cookies only from `WEB_ORIGINS`.
  Request bodies must be `application/json` (anything else gets 415), so a
  form or text post from another page cannot use the cookie.
- **In the app:** the access token stays in memory. On iOS and Android the
  refresh token is kept with `expo-secure-store` (Keychain and Keystore); on
  the web it is only in the cookie, out of reach of scripts. Only one refresh
  runs at a time, so a rotation never races itself. Only a refused refresh
  (401) signs the person out; no network, a server error or a limit keeps
  the token to try again. Signing out forgets the tokens once the API
  confirms. A phone signing out of itself also forgets them when the API
  cannot be reached, because deleting the stored token is enough there. On
  the web only the API can delete the cookie, and "sign out on all devices"
  must reach the API, so those show the failure and the person stays signed
  in to try again. The phone number never appears in a web address.
- **Suspended accounts:** their access tokens stop working at once, and a
  refresh ends the session.
- **Sign-out** ends the session and deletes its tokens at once; there are no
  signed tokens that stay valid until they expire. A person can end any of
  their own sessions, and the API answers "not found" for anyone else's.
- **Secrets:** `AUTH_SECRET` is at least 32 characters and differs per
  environment; the API refuses the example value in production. Changing it invalidates codes waiting to be used and resets the
  sending limits; sessions are not affected.
- **Development SMS:** the development sender prints codes in the API
  terminal, outside the logs. The API refuses to start with it in production.
- **Still to come:** clean-up jobs for expired codes, ended sessions and old
  limit records (milestone 2, with the worker); the approximate country of
  each session (needs an IP-to-country lookup); `Idempotency-Key` support
  (conventions), which these endpoints skip because a repeat is harmless or
  limited: a lost reply to "verify" means asking for a new code.

## Safety features (product)

- Meeting points only at public, lit places.
- Exact vehicle details visible to booked passengers only.
- Share trip details with a contact (Phase 5: live location).
- 112 and SafeTravel links on trip screens; reporting from every profile,
  trip and chat.
- Reviews revealed only after both sides have reviewed, to reduce retaliation.

## Process

- Security review of every PR touching auth, booking, payments, personal data
  or admin (use `/security-review` in Claude Code, plus the security-guidance
  plugin during development).
- Threat model updated in this file when a new feature changes the picture.
- External penetration test before the beta, because it takes payments, and
  again before public launch (Phase 4).
- Vulnerability reports handled per [SECURITY.md](../../SECURITY.md).
- Personal data breaches follow the breach procedure in
  [privacy and GDPR](../compliance/privacy-gdpr.md#breaches).
