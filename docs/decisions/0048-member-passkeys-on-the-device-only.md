# 0048. Face ID or fingerprint for members: passkeys kept on the device

- **Status:** Accepted (2026-11-23, by Martin: "biometrics like fingerprint
  or Face ID (can we have that on web?)" and "but no hardware key tho");
  user verification at setup amended by
  [ADR 0050](0050-passkey-saved-by-the-browser-after-a-password.md) (a
  passkey the browser saves by itself after a password)
- **Date:** 2026-11-23
- **Deciders:** Martin
- **Related:** [ADR 0028](0028-operator-console-web-app-and-passkeys.md)
  (the console's passkeys and `@simplewebauthn`),
  [ADR 0046](0046-sign-in-by-email-code-and-text-only-to-check-the-number.md),
  [ADR 0047](0047-member-passwords-hashed-with-scrypt.md),
  [spec 27](../specs/2026-11-23-passwords-and-passkeys.md),
  [security](../engineering/security.md#sign-in-and-sessions)

## Context

Martin wants members to sign in with Face ID or a fingerprint, on the web
too, and not with hardware security keys. On the web this is a passkey
(WebAuthn): the phone or laptop keeps a private key, unlocked by the face,
fingerprint or screen lock, and the website keeps only the public key. Every
current browser supports it: Safari with Face ID and Touch ID, Chrome on
Android and Mac, Windows Hello.

The console already signs operators in with passkeys through
`@simplewebauthn/server` and `@simplewebauthn/browser` (ADR 0028). On
production the console and the website share the domain `puffinride.is`,
so a member's passkey and an operator's would be for the same site.

## Options considered

1. **Passkeys kept on the device, website first.** Ask the browser for a
   built-in authenticator only (`authenticatorAttachment: "platform"`,
   resident key and user verification required, no attestation). The
   passkey syncs with the person's iCloud Keychain or Google Password
   Manager. Uses the libraries the console has. Cons: the phone apps need
   their builds to declare the domain before they can use the same
   passkeys.
2. **Any passkey, security keys included.** The WebAuthn default. Cons:
   Martin does not want hardware keys, and they need help and support we
   do not offer.
3. **Biometrics in the phone apps only** (Expo's local authentication
   unlocking a stored token). Cons: not on the web, where the beta is, and
   it only unlocks a session already there rather than signing in.

## Decision

We will offer "Face ID or fingerprint" as passkeys kept on the device
(option 1), on the website first, verified with `@simplewebauthn/server` as
the console's are.

- Passkeys are bound to the website's host (`WEB_APP_URL`, so
  `puffinride.is` and `staging.puffinride.is`), registered with a platform
  authenticator only, resident key and user verification required.
- A member's passkey carries a user handle of its own, random and never the
  account's ID: the console's passkeys use the account's ID on the same
  domain, and a device keeps one passkey per site and handle, so the two
  must differ or one would replace the other.
- Members' passkeys and their challenges get tables of their own, apart from
  the operators' (ADR 0028). A console passkey offered at the member
  sign-in is not known there, and is refused.
- Setting one up needs a sign-in in the last 10 minutes or a confirm code,
  and the verified email is told. At most 10 per account. Removing one
  needs neither.

## Consequences

- Signing in becomes a glance or a touch, cannot be phished, and costs
  nothing per sign-in.
- No new kind of dependency: the API has `@simplewebauthn/server` already,
  and the member app adds `@simplewebauthn/browser`, which the console uses,
  for its web build only.
- A device without a built-in authenticator does not see the button; the
  email code and a password still work there.
- A passkey removed in Settings may stay in the device's own list; it is
  refused with a line saying how to set it up again.
- Follow-up: the phone apps, once their builds ship (associated domains for
  iOS, Digital Asset Links for Android, and a native passkey module), with
  their own ADR; offering passkeys in the email field's autofill.

## Revisit when

- The phone apps ship: decide how they use the same passkeys.
- The console moves to its own host name (ADR 0028), which would separate
  the two kinds of passkeys by site.
- Members ask to use a security key after all.
