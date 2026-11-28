# 0034. Google and Apple sign-in through our API, in a browser window

- **Status:** Accepted (2026-11-22, by Martin on a decision card); the app's
  IDs and its `shareride://` scheme renamed to `puffinride` by
  [ADR 0039](0039-rename-to-puffinride.md); Apple's refresh token kept to
  revoke it with the account by
  [ADR 0056](0056-keep-apples-token-to-end-sign-in-with-apple.md) (Proposed)
- **Date:** 2026-11-22
- **Deciders:** Martin
- **Related:** [spec 19](../specs/2026-11-22-google-and-apple-sign-in.md),
  [ADR 0010](0010-authentication-and-identity.md) (Apple and Google as
  alternatives to the phone), [ADR 0016](0016-own-sign-in-module.md) (our
  own sign-in module), [plan](../plans/2026-11-22-google-and-apple-sign-in.md),
  [milestone 2 plan, 4.7](../plans/2026-11-13-milestone-2-hosted-and-connected.md#47-google-and-apple-sign-in-spec-1-section-33)
  (replaced)

## Context

Martin wants people to sign up and sign in with Google and Apple for the
public beta (2026-11-22). The beta starts on the web; the iPhone and Android
apps follow once the Apple account, the expo.dev project and store builds
exist. The phone apps run in Expo Go and the Android emulator today, which
cannot load extra native modules.

Google and Apple both use OpenID Connect: the person signs in on the
provider's page and the provider vouches for them with an ID token, a signed
JWT. Two things are new to ShareRide: two external identity providers, and a
library to check signed tokens (ADR 0016 named `jose` for this).

Apple only returns the person's name, and only the first time, in a form
it posts to a web address; it signs nothing for `localhost`. Google wants a
separate client ID for each of web, Android and iOS when the token is got on
the device.

## Options considered

1. **Each client gets the ID token itself** (the milestone 2 plan, 4.7).
   The web loads Google's and Apple's sign-in scripts; the phones use
   Google's native sign-in module and Apple's native sheet; the API checks
   the token. Pros: native sheets on phones, no server round trip. Cons:
   three ways to build and test, three Google client IDs, native modules that
   need development builds (not Expo Go), Google's and Apple's scripts on our
   pages (more third-party code, a looser content security policy), and Apple
   on Android still needs a web page of ours.
2. **Our API runs the sign-in in a browser window, on every platform.** The
   app opens our start address in a pop-up (web) or the phone's secure
   browser sheet; the API sends the person to Google or Apple, takes the
   answer back at its own callback, trades the code for the ID token with
   its client secret, checks the token, and hands the app a one-time ticket
   that only the app which started can redeem. Pros: one way on every
   platform, testable end to end with a stand-in provider, works in Expo Go,
   one Google client and one Apple Services ID, no provider code on our
   pages, Apple's form post lands where it must. Cons: a browser sheet
   instead of Apple's native sheet on iPhone, more server code (the
   callback, the ticket, Apple's client secret), and the API holds two client
   secrets.
3. **A managed identity service** (Auth0, Clerk and similar). Rejected in
   ADR 0010 and ADR 0016: per-user prices and people's data in another
   system.

## Decision

We will run Google and Apple sign-in through our own API in a browser window
(option 2), with `jose` to check ID tokens and sign Apple's client secret,
because it gives one tested way on the web, Android and iPhone now, without
native modules or third-party scripts.

- Google: authorisation code with PKCE, a nonce and `prompt=select_account`;
  one OAuth client of type "Web application". Apple: authorisation code with
  `response_mode=form_post` and a nonce; one Services ID and one Sign in
  with Apple key, whose client secret the API signs itself (ES256).
- The API checks each ID token's signature against the provider's
  published keys, its issuer, audience, expiry and nonce, and keeps only the
  subject and a verified email; the first name only fills in a form
  (spec 19, R19.5).
- The app makes a secret for each sign-in and sends only its hash at the
  start; the ticket the API returns works once, for 5 minutes, and only with
  that secret. Return addresses are a fixed list: the web app's origins and
  the app's `shareride://` scheme (Expo Go's `exp://` only in development,
  never on a server).
- Each provider is on when its keys are set; a stand-in provider of our own
  serves development and tests and is refused under `NODE_ENV=production`.
- Every account keeps a verified phone number (spec 19, decision 1);
  everything else in ADR 0010 and ADR 0016 stands.

## Consequences

- One code path to test on three platforms; CI covers it end to end with the
  stand-in provider, and real providers are checked by hand on staging.
- New runtime dependencies: `jose` in the API, `expo-web-browser` in the
  app. Google and Apple join the privacy policy as recipients.
- The API holds `GOOGLE_CLIENT_SECRET` and Apple's private key as secrets
  in Render, never in the repository. Apple's key does not expire, but the
  client secret signed with it lasts at most six months, so the API signs a
  new one itself.
- A small exception to "JSON bodies only": Apple's callback takes a form
  post. It uses no cookie and is bound to its sign-in by `state`.
- Sign in with Apple needs a paid Apple Developer membership, even on the
  web, and Apple's relay addresses need our sender registered with Apple.
  Apple's identifiers belong to one developer team: the beta uses Martin's
  own, and when the company's team takes over, each Apple user confirms
  their phone once more and the new identifier replaces the old (spec 19,
  3.5).
- Linking needs a code to the account's phone every time, at sign-up or as
  a confirm code in Settings, so a session alone never adds a way in.
- Follow-up before the App Store release: revoke Apple's tokens when an
  account is deleted, and consider Apple's native sheet on iPhone.

## Revisit when

The App Store review asks for Apple's native sheet, a provider changes its
flow, or the browser window loses too many people at sign-up.
