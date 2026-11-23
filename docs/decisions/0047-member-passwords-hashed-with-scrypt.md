# 0047. Members may set a password, stored as a scrypt hash

- **Status:** Proposed (2026-11-23; Martin asked for passwords: "google,
  email and password". How they are stored is the choice here.)
- **Date:** 2026-11-23
- **Deciders:** Martin
- **Related:** [ADR 0046](0046-sign-in-by-email-code-and-text-only-to-check-the-number.md)
  (the email code a forgotten password falls back to),
  [ADR 0016](0016-own-sign-in-module.md) (our own sign-in module, Node's
  built-in crypto), [ADR 0041](0041-console-password-for-now.md) (the
  console's password, which is not a member's),
  [spec 27](../specs/2026-11-23-passwords-and-passkeys.md),
  [security](../engineering/security.md#sign-in-and-sessions)

## Context

Since ADR 0046 members sign in with Google or a 6-digit code by email. Martin
asked for passwords as well. A password is a secret the person may reuse
elsewhere, so how it is stored matters more than anything else about it: if
the database ever leaks, the hashes must be slow and costly to guess.

Constraints: our sign-in module uses Node's built-in crypto and no auth
library (ADR 0016); the API runs on a small Render instance, so a hash
cannot take hundreds of megabytes per request; a password must never be the
only way in, since the email code already works for everyone.

## Options considered

1. **scrypt, built into Node.js** (`crypto.scrypt`). A memory-hard hash,
   recommended by OWASP next to Argon2id. No new dependency, nothing to
   compile in the Docker image. Settings: N = 2^15, r = 8, p = 3 (32 MiB, one
   of OWASP's listed choices), a 16-byte salt per password. It runs on
   libuv's thread pool, so at most four hashes run at once (128 MiB at
   most). Cons: Argon2id is the newer first choice.
2. **Argon2id with the `argon2` package.** OWASP's first choice. Cons: a
   native module, a new runtime dependency to build for each Node.js
   version and keep updated, for little real gain at our scale.
3. **bcrypt with `bcrypt` or `bcryptjs`.** Long proven. Cons: a 72-byte
   limit on the password, not memory-hard, and a dependency too.
4. **No passwords.** Email codes and Google only. Cons: not what Martin
   asked for, and some people prefer a password their browser remembers.

## Decision

We will let members set a password, optionally, and store it only as a
scrypt hash made with Node's built-in `crypto.scrypt` (N = 2^15, r = 8, p =
3, a random 16-byte salt, a 32-byte result), compared in constant time.

- The hash is stored with its settings, `scrypt$15$8$3$<salt>$<hash>`, in a
  table of its own, so stronger settings later apply at each person's next
  sign-in, when the hash is made again.
- The password is normalised (Unicode NFC) before hashing. It has 8 to 128
  characters, is not on the UK NCSC's list of the 100 000 most used
  passwords (in any case; the 46 476 with 8 characters or more, kept in the
  repository), and is not the account's email. No other rules. (Martin,
  2026-11-23: "Let's not go crazy on the password difficulty if not
  necessary"; 8 rather than 10, since the limits on wrong tries hold
  guessing at 10 an hour per email.)
- The user name is the account's verified email. A wrong email or password
  gets one answer in about the same time: an email without a password is
  checked against a dummy hash.
- Wrong tries are limited per email and per network address. A forgotten
  password is reset by signing in with the email code (ADR 0046), then
  choosing a new one; there is no reset link.

## Consequences

- No new dependency, and no secret beyond what the database holds: a hash
  is useless without guessing the password, and each guess costs 32 MiB and
  tens of milliseconds.
- The email code stays the way back for everyone, so a forgotten password
  never needs support.
- Password sign-in is open to guessing from many addresses; the per-email
  limit caps it at 10 tries an hour, and the email code is unaffected.
- The list of common passwords is a file to keep; it comes from SecLists
  (MIT licence), named in the file.
- Hashing is slow on purpose, so it never runs inside a database
  transaction: a try is counted first, under the limit's lock, then
  checked with no connection held, then taken back if it was right. Two
  hashes run at a time (64 MiB) with 20 waiting; more get "Too many tries"
  for a few seconds. Right tries count towards a wider limit of their own.
- After stronger settings, an account with an older hash answers a little
  faster than an unknown email until its next sign-in makes a new hash.
- Follow-up: security doc, the privacy record (a new table), Download my
  data (whether a password is set), erasure.

## Revisit when

- Node.js gains a built-in Argon2id: switch, with hashes made again at
  sign-in.
- Logs show password guessing that the limits do not hold, or members ask
  for two-step sign-in.
- The API moves to an instance where 32 MiB per hash is too much, or too
  little.
