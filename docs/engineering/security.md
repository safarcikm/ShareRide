# Security

**Owner:** Martin · **Last reviewed:** 2026-11-13

PuffinRide brings strangers together in cars and stores where people travel.
Security failures here can hurt people physically, not only financially. We
use the [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
(ASVS) level 2 as the checklist for the API and the
[OWASP Mobile Application Security](https://mas.owasp.org/) guidance for the
apps.

## Threats we design against

| Threat | Example | Main controls |
| ------ | ------- | ------------- |
| Account takeover | SIM swap, guessed codes | Code expiry and attempt limits, device sessions list, re-verification for sensitive changes |
| SMS fraud (SMS pumping) | Bots trigger thousands of codes to premium numbers | No text without a proven email, Google or Apple sign-in first, at most 3 per waiting sign-in, and a ceiling on all sign-in texts (spec 26); rate limits per IP, number and prefix, and a daily cap per country (the SMS budget); country allow-list; a kill switch (`SMS_PAUSED`); spending alerts |
| Scraping and stalking | Collecting who travels where and when | Public profiles show first name only; exact trip details and vehicle plate only to booked passengers; rate-limited search; no answer depends on who else is booked on a trip, so a block cannot reveal the other person's bookings |
| Broken access control | Editing someone else's trip, reading other people's chats | Ownership checks in every application service; tests for each endpoint as another user |
| Overbooking or price tampering | Race conditions, manipulated requests | Server computes prices and availability; transactional capacity check; database constraints |
| Harassment | Abusive messages, unsafe behaviour | Report and block, moderation queue, suspension, retained evidence for reports |
| Data breach | Leaked database or backups | Encryption at rest and in transit, least-privilege database roles, no personal data in logs, access audit |
| Supply chain | Malicious package or action | Lockfile, pinned actions, dependency review, minimal dependencies |
| Admin misuse | Operator account compromised | Separate operator role, passkey or hardware-key sign-in (a password for now while `ADMIN_PASSWORD` is set, ADRs 0041 and 0044), a lost passkey replaced only after a text code to the operator's own number with every other session ended and a notice (ADR 0040), audit log of every admin action |

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
- Error reports from the API and the app go to Sentry's EU region (any
  other DSN is refused) without request bodies, cookies, query strings,
  addresses, taps, typing, console output or a failed query's values, with
  phone numbers, codes, tokens, emails and kennitölur removed from all text,
  and without trace headers on our requests to other services (one rule,
  `packages/domain/src/privacy/error-report.ts`; tested there and in
  `apps/api/src/platform/error-reporting.test.ts`). The web app's source
  maps go to Sentry and are never served, and Render's secret files are kept
  out of the image (`.dockerignore`, checked by the smoke test).
- Dependencies and containers scanned in CI; critical findings block merge.
  `pnpm audit --audit-level high` fails on high advisories too. An advisory
  is passed over only when Martin agrees, in `auditConfig.ignoreGhsas` in
  `pnpm-workspace.yaml`, each with why and when it comes out.
- No person's user ID is shown to another person. Our IDs are UUIDv7 and
  show when the account was made. Someone else is reached through what the
  two share (a booking, a message) or through a public reference made for
  it, never through their user ID; a person's own ID goes only to them.

## Sign-in and sessions

How [ADR 0016](../decisions/0016-own-sign-in-module.md) is built, in
`apps/api/src/modules/auth` with the rules in `packages/domain/src/auth`.

- **Ways in** ([ADR 0046](../decisions/0046-sign-in-by-email-code-and-text-only-to-check-the-number.md),
  [spec 26](../specs/2026-11-23-sign-in-without-text-messages.md)): Google
  or Apple, or a code emailed to an account's verified email. A phone
  number alone never signs in: its text code only finishes a waiting email,
  Google or Apple sign-in (`pendingSignIn`, required by
  `POST /v1/auth/phone/start` and `/verify`), and adds the number, or, for
  a number's account, the proven email. A replaced verified email is told
  of the change, with the new address partly hidden. A member may also set
  a password ([spec 27](../specs/2026-11-23-passwords-and-passkeys.md)),
  which signs in with the verified email.
- **Passwords** ([ADR 0047](../decisions/0047-member-passwords-hashed-with-scrypt.md)):
  optional, 10 to 128 characters after Unicode NFC, not on the NCSC list
  of common passwords (`apps/api/assets/common-passwords.txt`, the entries
  of 10 characters or more, in any case) and not the account's email.
  Stored only as a scrypt hash from `node:crypto` (N = 2^15, r = 8, p = 3,
  a 16-byte salt, a 32-byte result, compared in constant time) in
  `member_passwords`, with its settings (`scrypt$15$8$3$…`), so a hash
  made with older settings is made again at the next sign-in. A wrong
  password, an email no account has and an account without a password get
  one answer (`credentials_invalid`), after checking a dummy hash so they
  take as long; only after the right password does the API say an account
  cannot sign in. Wrong tries: 10 an hour per email and 30 an hour per IP
  address (its /64 for IPv6); tries of any kind, right ones too, 20 and
  100. Each try is counted first, as wrong, in a short transaction under
  the same ordered advisory locks as code sends, so tries made at once
  cannot pass a limit together; the hash is then checked with no database
  connection held, and a right try is taken back from the wrong ones. Two
  hashes run at a time (32 MiB each) with 20 waiting; more get
  `rate_limited` for 5 seconds. The email code is not limited by any of
  them. Adding or changing a password needs the request's session to have
  signed in within 10 minutes, or a confirm code (R27.5), and 10 an hour
  per account at most; removing one needs neither. A stored hash with
  settings the server would not make (not whole numbers, over 64 MiB,
  more than 4 passes) is not read and answers as wrong, after a hash of the
  same cost. The verified email is told of each change. No password, hash
  or email appears in a log line; a limit reached is logged with its scope
  only.
- **Codes:** 6 digits from `crypto.randomInt`, valid 10 minutes, 5 attempts.
  Stored as HMAC-SHA-256 keyed with `AUTH_SECRET`, bound to the number or
  the email, and compared in constant time. Only the newest code for a
  number or an email works; a used code is deleted. The number and the
  email are stored only as keyed hashes until the account exists; a proven
  email waiting for the phone step is kept for at most 30 minutes, and
  deleted an hour after it expired.
- **Number and email guessing:** "send code" answers the same for every
  valid number or email, whether or not it has an account. Wrong codes count against the code; after
  5 the person must ask for a new code, which the sending limits slow down.
- **Sending limits:** texts per number, per IP address and per country
  calling code (plan section 4.2), at most 3 per waiting sign-in, and all
  sign-in and confirm texts together at most 300 an hour and 1 000 a day,
  logged as an error and reported to Sentry when reached (R26.3). Emailed codes: one per 30 seconds
  and 5 an hour per address, 20 an hour per IP address. Keys are keyed hashes, so the table holds no numbers or
  addresses. The IP address comes from `X-Forwarded-For` only behind
  trusted proxies (`TRUST_PROXY`), and then from the entry the outermost
  one appended, counted from the end; earlier entries come from the client
  and are ignored. On Render that is 2: Cloudflare appends the client, then
  Render's proxy appends the Cloudflare edge. If that entry is missing, the
  API uses the connection's address and logs a warning. A
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
  memory. Staging and production serve the web app from the API's own
  origin, so the cookie is first-party, and its pages carry a content
  security policy that allows only our own scripts and API. Browsers may call the API with cookies only from `WEB_ORIGINS`.
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
- **Confirming a sensitive action:** downloading my data, deleting my
  account, adding Google or Apple, changing the email (after the
  account's first 30 minutes) and, past 10 minutes after signing in,
  adding or changing a password need a fresh code, emailed to the account's
  verified email, or texted to its own number when it has none
  (`POST /v1/me/confirm-code`, spec 11, spec 26 3.6). It is a code of its own purpose: it
  never signs in, a sign-in code never confirms, and neither replaces the
  other. It shares the sign-in rules (10 minutes, 5 attempts, single use)
  and sending limits. `withConfirmCode` checks it and runs the action in one
  transaction: a wrong code is counted even though the action does not run,
  and the code is used up only when the action succeeds, so a route checks
  whatever else can refuse before asking for the code.
- **Google and Apple** ([ADR 0034](../decisions/0034-google-and-apple-sign-in-through-our-api.md),
  [spec 19](../specs/2026-11-22-google-and-apple-sign-in.md)): the API runs
  the sign-in in a browser window. The start takes the app's challenge
  (SHA-256 of a secret the app keeps) and a return address from a fixed
  list (the web app's `/sign-in/return` on `WEB_ORIGINS` or `WEB_APP_URL`,
  `puffinride://sign-in/return`, Expo Go's only outside production and with
  the stand-ins), stores
  only a hash of a new 256-bit state, and limits starts to 20 per 10
  minutes per address. The PKCE verifier and the nonce are keyed hashes of
  the state, never stored. The callback takes a state once and within 10
  minutes, trades the code with the client secret, and checks the ID
  token's signature (RS256) against the provider's published keys, its
  issuer, audience and authorized party (our client), expiry (a minute's
  leeway) and nonce. Apple's client secret is a JWT the API signs with the
  team's key (ES256, an hour long); the key is a Render secret, checked to
  be a P-256 key at start-up. Apple's callback is the one route that takes
  a form body, as Apple posts it; it reads no cookie, and its state works
  once. It sends
  the browser back with a ticket (`sr_pt_`, 5 minutes, once) in the
  fragment, with `Cache-Control: no-store` and no referrer. Finishing needs
  the app's secret, so a ticket caught on its way is useless. A newcomer
  gets a waiting sign-in (`sr_ps_`, 30 minutes) for the phone step. A link
  is made only after a code to the account's phone: the phone step's, or a
  confirm code in Settings; never by email. The development stand-in is
  refused under `NODE_ENV=production`. Logs carry the provider and the
  user ID, never the email, the provider's identifier or a token.
  On the web the window is a pop-up that hands its answer to the page that
  opened it, so they must stay linked: the pop-up's pages (the start, the
  callbacks, the stand-in's page and the web app's `/sign-in/return`) have
  no opener policy, the web app's other pages have
  `same-origin-allow-popups`, and the rest of the API and the console keep
  `same-origin` (`openerPolicyFor`). In the pop-up, the app's entry
  (`apps/mobile/index.ts`) hands the answer only to a window of the web
  app's own address and takes the ticket out of the pop-up's address and
  history before the router, error reporting or the session load; the app
  then does not load in the pop-up at all, so it never refreshes the
  session both windows share. The opening window keeps the secret in memory
  for that one try; a new try gets a new one, and leaving the screen closes
  a pop-up still open. On phones the router opens `sign-in/return` without
  its fragment (`+native-intent.tsx`).
- **Data exports:** kept in the database sealed with AES-256-GCM under a key
  derived from `AUTH_SECRET` (HKDF, `shareride-data-export-v1`), a fresh IV
  per file, so a copy of the database alone cannot read them. They leave
  only through a link the signed-in person asks for: a 256-bit token, stored
  as a hash, working once and for 2 minutes, answered with
  `Cache-Control: no-store`. The API logs the route pattern, never the
  link. Each file is bound to its export's ID, so it cannot be moved to
  another person's record. A new `AUTH_SECRET` makes files not yet
  downloaded unreadable: the download marks such a file failed, and the
  person asks again at once.
- **Suspended accounts:** stay signed in, so the person can still read,
  download or delete their data (spec 9, 3.6.2), but the API answers 403
  `account_suspended` to searching, booking, requesting, posting or
  changing a trip and sending messages, at once for every session. Their
  console sessions end on their next request.
- **Sign-out** ends the session and deletes its tokens at once; there are no
  signed tokens that stay valid until they expire. A person can end any of
  their own sessions, and the API answers "not found" for anyone else's.
- **Secrets:** `AUTH_SECRET` is at least 32 characters and differs per
  environment; the API refuses the example value in production. Changing it invalidates codes waiting to be used and resets the
  sending limits; sessions are not affected.
- **SMS:** the development sender prints codes in the API terminal, outside
  the logs, and the API refuses to start with it in production. Vonage keeps
  the text in its records for 13 months unless redacted (a code works once,
  for ten minutes); 46elks, the fallback, sends with `dontlog=message`. Errors from either sender never
  contain the number. `SMS_PAUSED=true` stops all SMS; signing in with an
  email or Google goes on, and only the phone step waits.
- **Clean-up:** an hourly job deletes expired codes, rate-limit events after
  24 hours, waiting email sign-ins an hour after they expired, and expired
  access and refresh tokens, ends sessions unused for 60
  days and deletes sessions 30 days after they end. A rotated refresh token
  is kept until its session ends, however old, so presenting it again is
  still caught as reuse.
- **Daily SMS cap per country:** it bounds what SMS pumping can cost, but
  someone who fills it (it takes many IP addresses, at 10 codes per hour
  each) blocks new codes to that country for up to 24 hours instead of one.
  The warning in the logs is the signal; raise the cap or pause and
  investigate.
- **Still to come:** the approximate country of
  each session (needs an IP-to-country lookup); `Idempotency-Key` support
  (conventions), which these endpoints skip because a repeat is harmless or
  limited: a lost reply to "verify" means asking for a new code.

## Operator console

How [ADR 0028](../decisions/0028-operator-console-web-app-and-passkeys.md)
is built, in `apps/api/src/modules/admin` with the rules in
`packages/domain/src/admin`.

- **Guard:** every path under `/admin/v1` needs a live console session of an
  active account with the `operator` role, checked by one middleware before
  any route, so a route that forgets its own guard is still closed. Only
  the sign-in and setup steps under `/admin/v1/auth/`, listed exactly in
  `openAdminRoutes`, are open. The app's bearer tokens are never
  accepted there, and the console's cookie is never sent to `/v1`.
- **Role:** only the `operator` command on the server gives or removes it
  (`pnpm --filter @shareride/api operator`). Removing it ends the account's
  console sessions and deletes its passkeys and setup links.
- **Setup link:** the command prints `/admin/setup#sr_ol_…`, 256 random
  bits kept only as a SHA-256 hash, after `#` so it never reaches a server
  log. It works once, for 30 minutes, and a new link replaces the old one.
  Using it claims it atomically before the passkey is saved.
- **Passkeys:** WebAuthn through `@simplewebauthn/server` (ADR 0016), bound
  to `ADMIN_ORIGIN` and its host name. Discoverable credentials, user
  verification required, attestation `none`, ES256 or RS256. Each challenge
  is stored server-side, works once and for 5 minutes, and is tied to its
  purpose (setup with its link, adding with its account, or signing in). A
  counter that goes back is refused, as a sign of a copied key. The last
  passkey cannot be removed from the console.
- **Changing passkeys:** adding or removing one needs a passkey used in the
  last 5 minutes (or, while it is on, a password sign-in), at sign-in or
  again through `/admin/v1/confirm`, so a
  stolen session alone (for example a script injected while the console
  shares the web app's origin) cannot swap in its own key and lock the
  operator out. The `operator` command locks the account while it removes
  the role, so a setup or sign-in running at that moment finishes first or
  sees the role gone. Signing in and setup links
  are limited per address (10 a minute, 60 an hour, keyed by a hash of the
  address, of its /64 network for IPv6).
- **Recovery by text code:** "Lost your passkey?" (spec 22,
  [ADR 0040](../decisions/0040-console-recovery-by-text-code.md)) sends a
  code of purpose `console_recovery` only to the verified number of an
  account that may use the console, and answers the same for any other
  valid number. It has its own count per number (1 per 30 seconds, 5 an
  hour), apart from the app's sign-in texts and their limits per address
  and country, and the console's "Text messages" switch does not stop it
  (`SMS_PAUSED` does). The code follows the sign-in code's rules (6 digits,
  10 minutes, 5 tries); no other code works for it, and it works nowhere
  else. A right code opens nothing by itself: under a share lock on the
  account it ends every console session, makes a setup link whose token
  goes to the page in the response body only, writes `operator.recovered`,
  and queues a notice by text and, with a verified address, by email, sent
  at any hour and while the console pauses those channels. Both steps are
  behind the console's per-address limit. Whoever controls the phone number
  can get in this way; the notice and the audit entry make that visible.
- **Password, for now:** while `ADMIN_PASSWORD` is set (12 characters or
  more, staging and production alike) and `ADMIN_ORIGIN` too, an operator
  can also sign in with their phone number and that password
  ([ADR 0041](../decisions/0041-console-password-for-now.md), on
  production by [ADR 0044](../decisions/0044-console-password-on-production.md)). It
  is compared in constant time through SHA-256 digests before the number is
  looked up, and never logged. Tries are limited as above, then to 5 a
  minute and 20 an hour per address, and 200 an hour from all addresses
  together. Each sign-in is audited as `operator.signed_in` with
  `{ "method": "password" }`, and counts as a passkey just used: for 5
  minutes the session can add or remove passkeys. Unset or empty,
  `/admin/v1/auth/methods` says it is off and `/admin/v1/auth/password`
  refuses every try.
- **Sessions:** separate from the app's. The cookie `sr_operator` is
  `HttpOnly`, `SameSite=Strict`, `Path=/admin/v1` and `Secure` outside
  development, and holds 256 random bits (prefix `sr_os_`) kept only as a
  SHA-256 hash. A session ends 30 minutes after its last use, 12 hours after
  sign-in, when the account loses the role or is suspended, or on sign-out,
  and never works again. Ended sessions are deleted after 30 days. While the
  operator's own account waits to be deleted (spec 11), the console refuses
  their sessions, passkeys and setup links, and the `operator` command will
  not give the role. Erasing the account is to delete them (spec 11).
- **Other origins:** the console's routes answer no CORS request, so only
  pages on the API's own origin can call them.
- **The console's pages:** the API serves the console's build at `/admin`
  (`apps/api/src/admin-app.ts`) with its own content security policy:
  `default-src 'none'`, and scripts, styles, fonts, images and API calls
  from its own origin only, no forms sent anywhere, no framing, and
  `noindex`. The build has no inline script or style. The public web app
  never answers a path under `/admin`, so no app page can stand in for the
  console, and the console's pages never shadow `/admin/v1`.
- **Audit log:** `recordAudit` writes each operator action in the same
  transaction as the change. A database trigger refuses updates, truncation
  and deletes of entries younger than 3 years.

## Safety features (product)

- Meeting points only at public, lit places.
- Exact vehicle details visible to booked passengers only.
- Share trip details with a contact (Phase 5: live location).
- SafeTravel links on trip screens; reporting from every profile, trip
  and chat.
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
