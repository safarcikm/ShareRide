# 0028. The operator console as its own web app, signed in with passkeys

- **Status:** Accepted; getting back in without a passkey amended by
  [ADR 0040](0040-console-recovery-by-text-code.md) (a text code, then a new passkey);
  a password next to passkeys for now by
  [ADR 0041](0041-console-password-for-now.md)
- **Date:** 2026-11-16
- **Deciders:** Martin
- **Related:** [ADR 0003](0003-cross-platform-client-expo.md),
  [ADR 0016](0016-own-sign-in-module.md),
  [ADR 0017](0017-visual-design-system.md),
  [spec 10, 3.1](../specs/2026-11-13-operator-settings-and-metrics.md#31-console-home-and-layout),
  [spec 9, 3.8](../specs/2026-11-13-safety-and-moderation.md#38-audit-log-h3),
  [security](../engineering/security.md),
  [milestone 8 plan](../plans/2026-11-16-milestone-8-operator-console-and-meeting-points.md)

## Context

The operator runs ShareRide alone and needs a console for meeting points,
reports, users, disputes, settings, metrics and payments (features H1 to
H7). Spec 10 asks for a web app for the operator role only, signed in with
a passkey, in Icelandic and English, usable on a laptop and on a phone.
Spec 9 asks that every operator action is written to an append-only audit
log. ADR 0003 left the console's technology open: "Expo web or a small
React web app". The API already serves the app's web build from its own
origin, and requests carry JSON only, so other sites cannot post forms
with its cookies.

An operator account that is taken over can suspend people, refund money
and read reported conversations, so it is the most valuable account in
the system.

## Options considered

1. **Its own small web app** (`apps/admin`): React for the web, built with
   Vite, served by the API at `/admin`. Browsers do tables, forms and file
   uploads well; no operator code ships to phones or the public web app;
   the console has its own content security policy. Costs: a new build
   tool and test setup, and basic parts (buttons, fields) built again for
   the web; the design tokens must move to a shared package.
2. **Web-only screens inside the Expo app.** The app's parts, texts and
   test setup are ready, so the first page is quicker. But the console's
   code ships inside every phone app and the public web bundle, dense
   tables are awkward with React Native's parts, and the screens share
   the app's navigation, which changes often.
3. **Pages rendered by the API** (Hono's JSX). No build tool, but forms
   need their own CSRF protection beside the JSON-only API, and passkeys,
   previews and uploads need scripts in the browser anyway.

For signing in: **a passkey only**, with the first one saved through a
one-time link from a server command; or **a phone code followed by a
passkey** every time; or **the app's own sign-in with an operator role**,
which the security doc rules out.

## Decision

We will build the console as **its own web app** (option 1), in
`apps/admin`, served at `/admin` on the API's origin, and sign the
operator in with **passkeys only**:

- An account holds the `operator` role. Only a command on the server gives
  or removes it; giving it prints a setup link that works once, for 30
  minutes, to save the first passkey. More passkeys are added from inside
  the console, which needs a passkey used in the last 5 minutes.
- Passkeys are verified with `@simplewebauthn/server`, a widely used
  library, as ADR 0016 requires for new sign-in methods.
- Console sessions are separate from the app's: an HTTP-only,
  `SameSite=Strict` cookie scoped to `/admin/v1`, ending 30 minutes after
  last use and 12 hours after sign-in.
- Every console route is behind one guard, and every operator action
  writes an audit entry in the same database transaction. A database
  trigger refuses changes to the audit log and deletion of entries
  younger than 3 years.
- Design tokens and the map of Iceland move to `packages/ui`, shared by
  the app and the console (ADR 0017).

## Consequences

- Later specs add a console page as one section file and their API routes
  as one file behind the guard, with the audit helper.
- A passkey cannot be phished or guessed, and the console needs no SMS.
- Losing every passkey means running the command again, which needs
  access to the server.
- Until there is a domain, the console shares an origin with the public
  web app, so a script injected there could reach the console's API while
  the operator is signed in. With a domain (milestone 12) the console
  moves to its own host name; passkeys are then saved again.
- New development dependencies (Vite, its React plugin, Testing Library
  and a browser-like test environment) and one runtime dependency on the
  API (`@simplewebauthn/server`).

## Revisit when

A second operator role is needed, the console outgrows one person's
workflow, or a security review finds a weakness in the operator sign-in.
