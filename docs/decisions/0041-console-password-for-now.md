# 0041. Sign in to the console with a password for now

- **Status:** Accepted (2026-11-22, Martin asked for it in the project
  thread: "can u simplify the login for just password atm")
- **Date:** 2026-11-22
- **Deciders:** Martin
- **Related:** amends [ADR 0028](0028-operator-console-web-app-and-passkeys.md)
  (passkeys only), [ADR 0040](0040-console-recovery-by-text-code.md),
  [security](../engineering/security.md#operator-console),
  [staging runbook](../operations/staging.md#sign-in-to-the-console)

## Context

ADR 0028 signs the operator in to the console with passkeys only. On
2026-11-22 staging moved to `staging.puffinride.is` (ADR 0039), which
changed the address the passkeys are bound to. Martin's passkey stopped
working, and saving a new one with the `operator` command's link failed
twice with "The passkey was not used: the request was cancelled or timed
out". The cause is not known yet: the console showed that message for every
refusal by the browser, including the one for a page open on the wrong
address (`SecurityError`). The text-code recovery of ADR 0040 is not built
yet. Martin needs to use the console now, and asked for a password.

## Options considered

1. **A password set on the server, next to passkeys.** One password in the
   API's environment (`ADMIN_PASSWORD`), typed with the operator's phone
   number. Works in any browser at once. Cost: a password can be guessed,
   phished or leaked, and anyone who can read the Render environment can
   sign in.
2. **A password per operator, stored hashed in the database.** Better for
   more than one operator, but needs a way to set it (a command and a page)
   and a migration: slower, for a stopgap.
3. **Keep passkeys only** and keep debugging the failed setup with Martin.
   Nothing new to attack, but he stays locked out meanwhile.

## Decision

We will let the operator sign in with **their phone number and a password
set in the API's environment** (option 1), for now and next to passkeys.

- `ADMIN_PASSWORD` turns it on, where `ADMIN_ORIGIN` is set too; unset or
  empty, it is off and the sign-in page shows passkeys only. It must be 12
  characters or more, and the API refuses to start with it on production.
- The password is compared in constant time, before the number is looked
  up, and never logged. Only an account that may use the console
  (`canUseConsole`) gets in.
- Tries are limited per address as for passkeys (10 a minute, 60 an hour),
  then to 5 a minute and 20 an hour per address, and to 200 an hour from all
  addresses together, so one address cannot use up the others' tries.
- A password sign-in starts the same console session as a passkey (same
  cookie, same 30-minute and 12-hour limits) and writes
  `operator.signed_in` with `{ "method": "password" }` to the audit log. It
  counts as a passkey just used, so for 5 minutes the operator can save a new
  passkey from the Passkeys page, or remove one.

## Consequences

- Martin can use the console again as soon as the password is set in
  Render, from any browser.
- The console is guarded by one shared secret while it is on: anyone who
  learns the password and an operator's number gets in, and the phone number
  is no secret. The audit log shows every password sign-in. A session
  started with the password can also save a passkey that outlasts it, or
  remove the operator's own, so the audit log and the Passkeys page are
  checked when it is turned off.
- The console now names the wrong-address refusal, so the passkey problem
  can be found.
- Follow-up: find why the passkey setup failed; once a passkey works,
  delete `ADMIN_PASSWORD` in Render.

## Revisit when

A passkey works for Martin again (then turn it off), ADR 0040's recovery is
live, a second person gets the operator role, or before the public launch,
whichever comes first. It must be off on production.
