# 0050. A passkey the browser saves by itself after a password

- **Status:** Accepted (2026-11-26, by Martin: "Yes, record it in a new
  ADR", to "Let the browser save a passkey by itself after a password?")
- **Date:** 2026-11-26
- **Deciders:** Martin
- **Related:** amends [ADR 0048](0048-member-passkeys-on-the-device-only.md)
  (user verification at setup), [spec 29, 3.3](../specs/2026-11-25-easier-sign-in.md#33-a-passkey-saved-by-the-browser-after-a-password),
  [spec 27](../specs/2026-11-23-passwords-and-passkeys.md),
  [security](../engineering/security.md#sign-in-and-sessions)

## Context

Safari with iCloud Keychain and Chrome with Google Password Manager can
make a passkey with no sheet, straight after a sign-in with a password the
password manager filled (WebAuthn "conditional create"; Apple calls it an
automatic passkey upgrade). The browser then shows its own short notice.
Spec 29, 3.3 asks for it, so that a member who uses a password gets Face ID
or fingerprint next time without a screen in between.

A passkey made this way answers with "user present" and "user verified"
both off: the browser checked neither, and the WebAuthn standard allows
that for this one ceremony. ADR 0048 says setting up a passkey needs user
verification, and the API checks both flags, so it would refuse every
such passkey.

What the two flags give us at setup is small. We ask for no attestation, so
the server cannot tell which device answered or trust what it says about
itself. What protects the account at setup is the fresh sign-in (R27.5:
the session signed in less than 10 minutes ago). Signing in with the
passkey later still needs Face ID, a fingerprint or the device's code.

## Options considered

1. **Accept the quiet save, for its own challenge only.** The app asks for
   quiet options, which only a session signed in less than 10 minutes ago
   gets (a confirm code does not stand in). Their challenge is kept as a
   quiet one, and only an answer to it is saved without the two flags.
   Everything else stays as in ADR 0048. Pros: what Apple and Google
   recommend for password users; no screen; signing in is as strong as
   before. Cons: one way of setting up where the device does not prove a
   person was there; a migration for the new kind of challenge.
2. **Keep user verification required at every setup.** After a password,
   spec 29's offer ("Use Face ID or fingerprint next time?") opens instead.
   Pros: no change. Cons: one more screen and tap, and the browsers' own
   upgrade is lost.
3. **Accept answers without the flags at every setup.** Cons: weaker for
   no gain, since the device's sheet checks the person anyway.

## Decision

We will accept a passkey the browser saves by itself after a password
(option 1): quiet setup options only for a session signed in less than 10
minutes ago, their challenge kept as quiet, and only an answer to such a
challenge saved without "user present" or "user verified". The browser is
asked only straight after a password. Every other setup, and every sign-in,
still needs user verification. A platform authenticator, a resident key,
no hardware keys, at most 10 devices and the email that tells the account
all stay as ADR 0048 and spec 27 have them.

## Consequences

- A member who signs in with a password on Safari or Chrome usually gets
  a passkey with no screen. Where the browser does not save one, the offer
  of spec 29, 3.2 opens as after any other way in.
- Someone holding a fresh session could already set up a passkey of their
  own with the sheet. The quiet way gives them nothing more, and a passkey
  made quietly cannot sign in without the device checking the person.
- The browser may keep a passkey the server then refuses, for example
  with 10 devices set up or no network. It is unknown to the site, so at
  its first use the browser is told to forget it (spec 29, 3.4).
- A migration adds the quiet kind to the passkey challenges' check.
- Follow-up: the security doc and spec 29, 3.3 say how the quiet setup is
  checked.

## Revisit when

- A passkey saved quietly is part of an account takeover.
- Browsers start checking the person during the quiet save, or WebAuthn
  drops the exception.
- The phone apps get passkeys, whose systems may offer the same upgrade.
