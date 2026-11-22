# Google and Apple sign-in: implementation plan

**Owner:** Martin · **Date:** 2026-11-22 · **Status:** Approved with
[spec 19](../specs/2026-11-22-google-and-apple-sign-in.md) and
[ADR 0034](../decisions/0034-google-and-apple-sign-in-through-our-api.md)
(Martin, 2026-11-22, on a decision card); building

> **For agentic workers:** use superpowers:executing-plans to carry this out
> task by task. Tick each task as its pull request merges.

**Goal:** people create an account and sign in with Google or Apple on the
web, Android and iPhone, verifying a phone number once at sign-up.

**Architecture:** the API runs each sign-in in a browser window (ADR 0034):
a start address that sends the person to the provider, a callback that
trades the provider's code for its ID token and checks it, and a one-time
ticket the app redeems with a secret only it holds. A newcomer's sign-in
waits while the existing phone steps run, and `POST /auth/phone/verify`
makes or links the account in the same transaction as today.

**Tech stack:** Hono and Drizzle in the API, `jose` 6 for ID tokens and
Apple's client secret, `expo-web-browser` (SDK 58) for the pop-up and the
browser sheet, Vitest, RNTL and Playwright.

**Spec:** [spec 19](../specs/2026-11-22-google-and-apple-sign-in.md), which
amends [spec 1](../specs/2026-11-13-sign-in-and-profile.md) 3.3 and 3.8.

This replaces section 4.7 and PRs 8 and 9 of the
[milestone 2 plan](2026-11-13-milestone-2-hosted-and-connected.md); it is
milestone 13's "Google sign-in" and "Sign in with Apple" on the
[roadmap](../strategy/roadmap.md). Photos, milestone 13's other part, are
another thread's.

## 1. Global constraints

- Every account keeps a verified phone number (R19.2). Nothing in this plan
  makes an account without one.
- A link is made only after a code to that account's phone: the sign-in
  code of the phone step, or a confirm code in Settings; never because an
  email matches and never on a session alone (R19.3).
- From a provider, keep the subject and a verified email (R19.4, R19.5).
  The first name only fills in step 3's field and is never stored by itself.
- No Google or Apple script, font or image is loaded from their servers on
  our pages; the logos are drawn by us from their published artwork.
- Secrets (`GOOGLE_CLIENT_SECRET`, `APPLE_PRIVATE_KEY`) only in Render and
  `.env`; `.env.example` gets empty placeholders.
- Tokens and tickets: 256 random bits from `newToken`, stored only as
  SHA-256 hashes (`hashToken`), as ADR 0016 does.
- Logs: provider, user ID and the kind of error. Never an email, a subject,
  a code, a ticket or a token.
- Every new table is in `packages/db/src/personal-data.ts`; every text in
  `en.ts` and `is.ts`; brand colours are tokens, never raw values in a
  screen.
- The development provider is refused under `NODE_ENV=production` (staging
  included).

## 2. Review focus

1. **The pop-up is blocked.** Safari blocks a window opened after an
   `await`. The app makes the secret and its hash when the sign-in screen
   opens, so the tap opens the window at once. Test: the start address is
   built without waiting (PR 3).
2. **The person closes the window or presses Cancel at Google or Apple.**
   Back on the sign-in screen, no error. Tests: a dismissed browser result,
   and the callback with `error=access_denied` (Google) and
   `user_cancelled_authorize` (Apple), lead to "cancelled" (PRs 2 and 3).
3. **A slow phone step.** The provider sign-in waits 30 minutes; a code
   asked for at minute 29 still works for its own 10 minutes, but the link
   is refused with `provider_expired` without using up the code. Test in
   PR 2.
4. **The same Google account on two ShareRide accounts at once.** Two
   phone steps racing with one Google account: the unique index wins, the
   second gets `provider_in_use`, and no account is half made. Test in PR 2.
5. **Apple's name comes only once.** If the first Apple sign-in fails after
   the callback, the name is gone for good; the person types it in step 3.
   Test: no `user` field still finishes (PR 2b).

## 3. Calls I made (for Martin to check)

| # | Call | Why |
| - | ---- | --- |
| 1 | The API runs the browser flow on every platform (ADR 0034) | One tested path; works in Expo Go; no native modules or scripts |
| 2 | Apple on Android too | Free with the browser flow; one sign-in screen for all |
| 3 | Linking by phone code is automatic | The code is what signing in with the number needs anyway |
| 4 | The provider's email fills only an empty email | A person's chosen address never changes behind their back |
| 5 | No console switch for Google and Apple | Removing the keys in Render turns a provider off; a switch would need an ADR 0032 change for an emergency we have not seen |
| 6 | Apple's token revocation waits for the App Store release | It can ask the person to continue with Apple once more at deletion, so nothing must be stored now |
| 7 | Adding in Settings needs a confirm code | A session alone must never add a way back in that outlives "Sign out on all devices" |
| 8 | Apple under Martin's own developer account, with the test App ID `is.shareride.app.preview` | The store's App ID stays free for the company (milestone 2, decision 6); moving teams changes Apple's identifiers, which the replace row of 4.2 absorbs |
| 9 | Staging never takes Expo Go's `exp://` return address | It is a server with real accounts; the apps are checked once their test builds exist |

## 4. Design

### 4.1 One sign-in, step by step

1. When the sign-in screen opens, the app makes a random `verifier` (32
   bytes, base64url) and its `challenge` (SHA-256, base64url).
2. Tap: the app opens
   `GET /v1/auth/oauth/{provider}/start?challenge=…&returnUrl=…`
   with `WebBrowser.openAuthSessionAsync(url, returnUrl)`: a pop-up on the
   web, the browser sheet on phones.
3. The API checks the provider is on, the challenge's shape and that
   `returnUrl` is allowed (4.4); counts the address against the start
   limit; stores a `provider_sign_ins` row with a hash of a new random
   `state`; and sends the browser to the provider. The PKCE verifier and
   the nonce are not stored: they are `hasher("oauth-pkce", state)` and
   `hasher("oauth-nonce", state)`, so only a request that has `state` can
   make them.
4. The provider sends the person back to
   `{API_ORIGIN}/v1/auth/oauth/google/callback` (GET) or
   `/v1/auth/oauth/apple/callback` (form POST). The API finds the row by
   the state's hash (unused, less than 10 minutes old), redeems the code
   (4.3), stores the subject, the email with whether it is verified, and
   the first name, makes a ticket (`sr_pt_…`, 5 minutes), and answers
   `303` to `returnUrl#ticket=…`. Errors go to `returnUrl#error=cancelled`,
   `#error=expired` (the 10 minutes passed, the first time only) or
   `#error=failed`; anything else the provider said is not passed on, and
   is logged only by its OAuth error name.
5. The app (or, on the web, the pop-up page `/sign-in/return`, which calls
   `WebBrowser.maybeCompleteAuthSession()`) gets the URL and calls
   `POST /v1/auth/oauth/finish { ticket, verifier, locale, device }`. The
   API checks the ticket's hash, its 5 minutes, that it was not used, and
   `sha256(verifier) = challenge`, then marks it used.
6. A known subject: a session, as after a phone code
   (`{ status: "signedIn", …tokens, user, isNewUser: false }`, the refresh
   token as a cookie on the web). A new one:
   `{ status: "phoneNeeded", pendingSignIn, provider, email, firstName }`,
   where `pendingSignIn` (`sr_ps_…`) works until 30 minutes after the
   callback.
7. The app shows "Add your phone number" and runs the phone steps, with
   `pendingSignIn` in `POST /v1/auth/phone/verify`. In its transaction the
   API locks the waiting sign-in first (unused, not expired, else
   `provider_expired` and the code stays), checks the code, then makes or
   finds the account through the same gate as today, and links (4.2).

### 4.2 Linking rules (domain, `decideLink`)

| The number's account | Subject already linked to | Account has another of this provider | Result |
| -------------------- | ------------------------- | ------------------------------------ | ------ |
| none | nobody | (new account) | make the account and link |
| none | another account | | `provider_in_use`, code kept |
| exists | nobody | no | link, sign in, `linked: provider` |
| exists | this account | | sign in (already linked) |
| exists | another account | | sign in without linking, `providerLink.outcome: in_use` |
| exists | nobody | yes | replace the old link, sign in, `replaced: provider`; the account's email stays, unless it was the old link's Apple relay address (spec 19, 3.5) |

Settings follows the same rules without "make", and refuses instead of
replacing, in two calls. `POST /v1/me/sign-in-methods/prepare { ticket,
verifier }` takes the ticket for the signed-in account and answers
`provider_in_use` or `provider_already_linked` (409) before any code is
asked for, or holds the sign-in for that account only, until 30 minutes
after the callback. Then `POST /v1/me/sign-in-methods { pendingSignIn,
code }` adds it inside `withConfirmCode` (a code from
`POST /v1/me/confirm-code`, as spec 11's actions), checking the rules again,
so a refusal or a sign-in that took too long never uses the code up. The email (R19.4) is set when the account has
none, the provider said verified, and no other account has it, checked in
the transaction; the unique index on `users.email` is the last word.

### 4.3 The providers (`apps/api/src/platform/identity-providers.ts`)

```ts
interface IdentityProvider {
  readonly name: SignInProvider;
  authorizationUrl(input: { state: string; nonce: string; codeVerifier: string; redirectUri: string }): string;
  redeem(input: { code: string; codeVerifier: string; nonce: string; redirectUri: string; appleUser?: string }): Promise<Result<ProviderClaims, { code: "provider_failed" }>>;
}
```

- **Google:** `https://accounts.google.com/o/oauth2/v2/auth` with
  `response_type=code`, `scope=openid email profile`, `code_challenge`
  (S256), `nonce`, `prompt=select_account`; token at
  `https://oauth2.googleapis.com/token` with the client secret and the PKCE
  verifier; ID token checked with `jwtVerify` against
  `https://www.googleapis.com/oauth2/v3/certs`, issuer
  `https://accounts.google.com` or `accounts.google.com`, audience
  `GOOGLE_CLIENT_ID`, 60 seconds of clock tolerance, and the nonce.
- **Apple:** `https://appleid.apple.com/auth/authorize` with
  `response_type=code`, `response_mode=form_post`, `scope=name email` and
  `nonce`; token at `https://appleid.apple.com/auth/token` with a client
  secret the API signs (ES256, `kid` = `APPLE_KEY_ID`, `iss` = team ID,
  `sub` = Services ID, `aud` = `https://appleid.apple.com`, an hour long,
  kept and remade 5 minutes before it ends); ID token against
  `https://appleid.apple.com/auth/keys`, issuer `https://appleid.apple.com`,
  audience the Services ID. The first name from the form's `user` field.
- **Development provider** (`GOOGLE_SIGN_IN=dev`, `APPLE_SIGN_IN=dev`):
  `authorizationUrl` is our own page `/v1/auth/oauth/dev/{provider}`, which
  lists three made-up people (with a verified email, with a hidden
  relay-style email, with an unverified email) and a Cancel button. The
  code it sends back is the chosen person and the nonce, encoded; `redeem`
  decodes and checks the nonce. Apple's goes back as a form POST, so the
  form path is tested too.
- `fetch` and the key set are passed in, so tests use a fake token endpoint
  and keys made in the test.

### 4.4 Settings and addresses

`apps/api/src/config.ts`:

| Variable | Values |
| -------- | ------ |
| `GOOGLE_SIGN_IN` | `off`, `dev`, `google`; `dev` by default, `off` under `NODE_ENV=production`, where `dev` is refused |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Needed for `google` |
| `APPLE_SIGN_IN` | `off`, `dev`, `apple`, as above |
| `APPLE_SERVICES_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | Needed for `apple`; the key's PEM, `\n` allowed for line breaks |
| `API_ORIGIN` | Where browsers reach the API, for the callback addresses; `http://localhost:{PORT}` by default, needed on a server when a provider is on |

An empty value counts as unset, so Render's empty `sync: false` entries do
not break the start. Allowed return addresses: each `WEB_ORIGINS` origin
with the path `/sign-in/return`; `shareride://sign-in/return`; and, outside
production and only while no provider is the real one, `exp://` addresses
ending in `/--/sign-in/return` (Expo Go). `API_ORIGIN` must be `https` in
production.

### 4.5 Data

- `identities` (migration 0057): `id`, `user_id` (foreign key), `provider`
  (check `google`, `apple`), `subject`, `email` (only a verified one, else
  empty), `linked_at`, `last_used_at`, timestamps. Unique
  `(provider, subject)` and `(user_id, provider)`. Personal data: account;
  exported in its own section, sign-in methods (provider, email, linked,
  last used; never the subject); erased with the account.
- `provider_sign_ins`: `id`, `provider`, `state_hash` (unique),
  `challenge`, `return_url`, `expires_at`, `answered_at`, then `subject`,
  `email` (only a verified one), `first_name`, `ticket_hash` (unique),
  `ticket_expires_at`, `ticket_used_at`, `pending_hash` (unique),
  `link_user_id` (the account a Settings link is for), timestamps. Listed
  in `personal-data.ts` as left out of exports. A sign-in that ends
  (signed in, linked, cancelled or failed) is deleted at once; the hourly
  clean-up deletes the rest an hour after `expires_at`.
- Start limit: 20 starts per 10 minutes per address (its /64 for IPv6),
  counted in the API's memory as search's limit is, under a keyed hash of
  the address.

### 4.6 The app

- `apps/mobile/src/sign-in/provider-window.ts`: `useProviderWindow()`
  makes the verifier in advance (so a tap opens the pop-up at once, which
  browsers allow only inside the tap) and a new one after each try, and
  returns `open(provider): Promise<WindowOutcome>`: `ticket` (with the
  verifier), `cancelled`, `expired` or `failed`. The sign-in screen trades
  the ticket through `SessionManager.finishProviderSignIn`, which signs in
  or answers `phoneNeeded`; Settings trades it through `prepare`.
- `apps/mobile/src/sign-in/provider-buttons.tsx`: `ProviderButtons`, the
  two buttons from `GET /v1/config`'s `signInProviders`, with the logos as
  SVG and the colours as tokens `signInBrands` and `googleLogo` in
  `@shareride/ui`, which the app's `theme/tokens.ts` passes on (spec 15
  gains them, with Google's light and dark values and Apple's black and
  white).
- `SignInFlow` gains `pending` (the waiting provider sign-in); the session
  keeps `signInNews` from verify, before it says it is signed in: a new
  account's `suggestedFirstName`, which step 3's profile form takes as its
  first value, and the `providerLink` that `ProviderLinkNotice` tells.
- `apps/mobile/index.ts`, the app's entry: on the web, in the pop-up, it
  hands the answer to the opening window and takes the ticket out of the
  address (`sign-in/popup-hand-off.web.ts`) before the app loads; the app
  loads there only if the pop-up stays open two seconds later.
- `apps/mobile/src/app/sign-in/return.tsx`: on the web, a pop-up left open
  says it can be closed; on phones it only says "Signing you in…" if Expo
  Router opens it, which `+native-intent.tsx` does without the fragment.
- `apps/mobile/src/app/settings/sign-in-methods.tsx`: the list, add and
  remove, behind a row in Settings, Your account.

## 5. Pull requests and tasks

One branch, one pull request at a time; each gets a code review before it
opens and merges once CI is green (Martin's rule of 2026-11-16).

### PR 1: `docs(auth)`: spec 19, ADR 0034 and this plan

- [x] Spec, ADR and plan, the indexes, a line at the top of spec 1 and in
      milestone 2's section 4.7 pointing here, the roadmap's milestone 13
- Merge: after Martin approves spec 19 and ADR 0034 (ADR 0034 then
  Accepted)

### PR 2: `feat(auth)`: sign in with Google, the API

- [x] **Domain** (`packages/domain/src/auth/sign-in-providers.ts`):
      `signInProviders`, `providerSignInRules` (10 and 30 minutes, 5-minute
      ticket, start limit), `readProviderClaims` (subject, email, verified
      as `true` or `"true"`, first name through the first name rule),
      `decideLink` (table 4.2), `emailToStore` (R19.4),
      `isAllowedReturnUrl`. Tests first, one per row of 4.2 and per rule.
- [x] **Tables** `identities` and `provider_sign_ins`, the migration with
      the next free number, `personal-data.ts`, export and erasure, the
      clean-up. Tests: export lists the methods; erasure leaves none; the
      clean-up deletes old sign-ins only.
- [x] **Providers** with the Google adapter and the development provider
      (4.3), `jose` added to the API (justified in the PR). Tests with keys
      made in the test: a wrong signature, audience, issuer, expiry or
      nonce is refused; an unverified email is left out (R19.4).
- [x] **Routes** start, Google callback, finish, verify with
      `pendingSignIn`, `GET`/`POST`/`DELETE /v1/me/sign-in-methods` and
      `POST /v1/me/sign-in-methods/prepare`,
      `signInProviders` in `/v1/config`; contracts and the API client.
      Integration tests for every row of 4.2, a ticket used twice, a wrong
      verifier, a sign-in past 10 or 30 minutes, a return address not
      allowed, the start limit, a suspended account, an account waiting to
      be deleted, adding in Settings without or with a wrong confirm code,
      review focus 2 to 4.
- [x] **Docs:** security (a "Google and Apple" part of Sign-in and
      sessions), privacy and GDPR (inventory rows, Google and Apple as
      recipients), the privacy policy draft's section 5, `.env.example`
- Verify: `pnpm check`; `pnpm test:integration` for `@shareride/api` and
  `@shareride/db`

### PR 2b: `feat(auth)`: Sign in with Apple, the API

- [x] Apple adapter: the client secret (tests: its header and claims, a
      new one before the old one ends), the form `user` field, the ID token
      checks
- [x] `POST /v1/auth/oauth/apple/callback` taking a form body, the one
      exception to JSON bodies, with a test that no other route takes one
- [x] Render blueprint entries (`sync: false`), and Martin's Apple steps
      (section 6) in the staging runbook
- Verify: as PR 2, plus review focus 5

### PR 3a: `feat(app)`: Continue with Google and Apple

PR 3 is split in two, so each review stays a size one person reads: the
sign-in here, Settings in 3b.

- [x] `expo-web-browser` (with `npx expo install`, justified in the PR),
      `useProviderWindow` (the plan's `useProviderSignIn`: the window only,
      so Settings uses it too), `/sign-in/return`, the buttons and their
      tokens (`signInBrands` and `googleLogo` in `@shareride/ui`, spec 15
      updated), "or with your phone number"
- [x] Add your phone number: the line on top of step 1 and the
      `pendingSignIn` through to verify; "linked" and "link refused"
      notices (`ProviderLinkNotice`, over whichever screen opens next);
      step 3's first name filled in
- [x] Texts of spec 19, section 8, for signing in, in `en.ts` and `is.ts`
- [x] Safety from PR 2's review: `pendingSignIn` only ever from a `finish`
      answer, never from an address or link; the web app takes the
      `#ticket` out of the pop-up's address before the router, error
      reporting or the session load (the review found the router put it
      back when this ran in the root layout); a new verifier for each try; error reports already
      leave out `sr_` tokens and addresses' fragments; `#error=expired`
      shows "That took too long"
- [x] Screen tests with `renderApp` against the fake API: each outcome of
      the window and of `finish`, the phone step with a waiting sign-in;
      Playwright journeys with the development provider's pop-up: a
      newcomer, then a member
- Verify: `pnpm check`; `pnpm --filter @shareride/mobile e2e:web`

### PR 3b: `feat(app)`: Settings, Sign-in methods

- [ ] Settings, Sign-in methods: list, add (the window, then the confirm
      code with the part spec 11's screens use), remove with its question
- [ ] Texts of spec 19, section 8, for Settings
- [ ] Screen tests; a Playwright journey: add and remove in Settings
- Verify: as PR 3a

### PR 4: `docs`: close-out

- [ ] Roadmap ticks, spec 19 and this plan marked built, ADR index

## 6. Martin's steps

Exact clicks are in the staging runbook:
[Turn on Google sign-in](../operations/staging.md#turn-on-google-sign-in)
and [Turn on Sign in with Apple](../operations/staging.md#turn-on-sign-in-with-apple).
In short:

1. **Google Cloud** (free): a project "ShareRide"; Google Auth Platform,
   Branding (app name, support email, the domain `skinnar.is`, links to the
   privacy policy and terms), Audience "External" then "Publish app"; Data
   access with `openid`, `email` and `profile` only; Clients, "Web
   application", authorised redirect URI
   `https://staging.skinnar.is/v1/auth/oauth/google/callback`. Then in
   Render: `GOOGLE_SIGN_IN=google`, `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `API_ORIGIN=https://staging.skinnar.is`.
2. **Apple Developer Program** ($99 a year), if not joined yet. Then in
   Certificates, Identifiers and Profiles: the test builds' App ID
   (`is.shareride.app.preview`; the store's `is.shareride.app` stays for the
   company's account) with Sign in with Apple; a Services ID (for example
   `is.shareride.preview.web`) with Sign in with Apple configured for the domain
   `staging.skinnar.is` and the return URL
   `https://staging.skinnar.is/v1/auth/oauth/apple/callback` (no file to
   upload); a key with Sign in with Apple, downloaded once as a `.p8`. In
   Render: `APPLE_SIGN_IN=apple`, `APPLE_SERVICES_ID`, `APPLE_TEAM_ID`,
   `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`.
3. **Apple's private email relay:** register `hello@skinnar.is` (or the
   domain) as an email source; Apple checks its SPF, which skinnar.is
   already has for Mailjet.
4. **Check** on staging: continue with Google and with Apple, as a
   newcomer and again as a member, in a laptop's browser and a phone's
   browser. Inside the apps once their test builds exist.

## 7. Risks

- **Google's button rules** name Google Sans for the label; it is not
  available for us to bundle, so the label uses our body font with
  Google's colours, logo and padding. Google checks branding only if we ask
  for verification, which basic scopes do not need.
- **In-app browsers** (Instagram, Facebook) block pop-ups and Google
  refuses sign-in inside them; the person sees "didn't work" and can use
  the phone number.
- **Apple's relay** drops our emails until step 3 is done.
- **Two thousand lines** across four PRs, in the most security-sensitive
  module; each PR gets a security review before it opens.

## 8. Definition of done

CLAUDE.md's definition, plus: a newcomer and a member sign in with each
provider on staging in a browser (Martin's check), and Download my data
lists the sign-in methods. The check inside the apps moves to milestone 16,
with their test builds.
