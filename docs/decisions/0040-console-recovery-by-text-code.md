# 0040. Get back into the console with a text code and a new passkey

- **Status:** Accepted (2026-11-22, by Martin on a decision card in the
  project thread)
- **Date:** 2026-11-22
- **Deciders:** Martin
- **Related:** amends [ADR 0028](0028-operator-console-web-app-and-passkeys.md)
  (passkeys only), [ADR 0016](0016-own-sign-in-module.md),
  [ADR 0023](0023-sms-with-vonage.md),
  [spec 22](../specs/2026-11-22-console-passkey-recovery.md),
  [security](../engineering/security.md#operator-console)

## Context

ADR 0028 signs the operator in to the console with passkeys only. Losing
every passkey leaves one way back in: the `operator` command in the API's
shell, which needs the Render account. On 2026-11-22 Martin lost the only
passkey he had saved and could not sign in. He did not know about the
command, and asked to sign in with "something I own now (like a phone
number)".

PuffinRide has one operator, who works from a laptop and a phone and is not
a developer. A way back in that needs the hosting dashboard is easy to
forget. The console holds members' personal data, reports and suspensions,
so a takeover of the operator's account is the costliest one we have
(security, threat model). Every account, the operator's too, already has a
verified phone number, and the API already sends sign-in codes by text
through Vonage with limits per number, address and country.

## Options considered

1. **A text code to the operator's number, then a new passkey.** "Lost your
   passkey?" on the sign-in page; the code only lets the operator save a new
   passkey, which signs them in. Easy to find and to use, needs nothing but
   the phone. Cost: whoever controls the phone number, for example after a
   SIM swap at the phone company, can get in without the Render account.
2. **A text code at every sign-in,** instead of the passkey or as another
   way to sign in. Simplest to use. But codes can be typed into a fake site
   and passed on, and the phone number becomes the only thing that guards
   the console every day. The weakest of the three.
3. **The `operator` command only,** plus a warning in the console while the
   operator has a single passkey. Nothing new to attack. Cost: losing every
   passkey still means the Render dashboard, which is what failed here.
4. **Recovery codes on paper,** shown once when a passkey is saved. Not
   phishable through the phone company, but one more thing to keep and lose,
   which is the problem we have.

## Decision

We will let an operator who has lost their passkeys **get back in with a
text code to their own verified phone number, then save a new passkey**
(option 1). Martin chose it on a decision card on 2026-11-22.

- The code is the sign-in code's kind (6 digits, 10 minutes, 5 tries) with
  its own purpose, `console_recovery`, so no other code works for it, and
  its own sending count per number. It goes only to an account that may use
  the console.
- The page says the same words for every number. It does not try harder to
  hide who the operators are: the operator is the company's owner.
- A right code opens nothing by itself: it gives the page a setup link, as
  the `operator` command does, and the console opens once a new passkey is
  saved with it. Passkeys stay the everyday sign-in.
- Using it ends every console session of the account, writes
  `operator.recovered` to the audit log, texts the operator's number and,
  when the server sends email, emails the account's verified address, which
  a SIM swap does not reach.
- The `operator` command stays, for when the phone number is lost too.

## Consequences

- The operator can get back in from the sign-in page, on a phone, in a
  minute, without the hosting dashboard.
- The console now depends on the phone number as well as on passkeys and the
  Render account: a SIM swap or a phone company's mistake is enough to get
  in. The notice email, the audit entry and ending other sessions make that
  visible, not impossible; until email is set up the notice is a text, which
  a SIM swap sends to the wrong phone. ADR 0028's "the console needs no
  SMS" no longer holds.
- The console's "Text messages" switch does not stop these codes; only the
  server's `SMS_PAUSED` does, and then the command is the way back in.
- Follow-up: the security doc's threat model and operator console section,
  the staging runbook, a migration for the new code purpose, and two open
  routes in `openAdminRoutes`.

## Revisit when

A second person gets the operator role, before the public launch's
penetration test, or if the audit log ever shows `operator.recovered` that
the operator did not do. Then consider a waiting period with a notice by
email, recovery codes on paper, or turning this off on production.
