# Spec 22: Get back into the console with a text code

**Owner:** Martin · **Date:** 2026-11-22 · **Status:** Approved
(2026-11-22, by Martin on a decision card)

Features: H1 to H7, the operator console ([features](../product/features.md)).
Changes how the operator signs in to the console
([spec 10, 3.1](2026-11-13-operator-settings-and-metrics.md#31-console-home-and-layout))
through [ADR 0040](../decisions/0040-console-recovery-by-text-code.md) (accepted), which
amends [ADR 0028](../decisions/0028-operator-console-web-app-and-passkeys.md).
Related: [security](../engineering/security.md#operator-console),
[operator console](../engineering/operator-console.md),
[staging runbook](../operations/staging.md#sign-in-to-the-console).

## 1. Problem and goal

Martin, 2026-11-22: "I can't log in because I don't own the passkey, can you
change it so I can log in with something I own now (like a phone number)".

The console signs in with passkeys only. A passkey lost with a device, a
browser profile or an account leaves one way back in: the `operator` command
in the API's shell on Render. That works, but it needs a computer, the Render
dashboard and the command, and Martin did not know it was there.

**Goal:** an operator who has lost their passkeys gets back in from the
console's sign-in page with a code sent by text to their own phone, and saves
a new passkey on the way. The passkey stays the everyday sign-in (Martin
chose this on a decision card, 2026-11-22; not chosen: a text code at every
sign-in, or the `operator` command only).

## 2. User stories

- As the operator who lost my passkey, I press "Lost your passkey?", type my
  phone number, type the code I get by text and save a new passkey. Then I am
  in the console.
- As the operator, I get a text whenever someone uses this, so I notice if it
  was not me.
- As someone who is not an operator, typing my number there sends me nothing,
  and the page's words are the same as for an operator.

## 3. Behaviour

### 3.1 Where it starts

The sign-in page gets a link under its button: **Lost your passkey?** It opens
`/admin/recover`, a page in the console's narrow column with three steps on
one page, one at a time.

### 3.2 Step 1: the phone number

One field, **Your phone number**, with the hint "The number of your
PuffinRide account. We send a code by text message." A number without a
country code is read as Icelandic, as in the app (R1.1). **Send a code**.

The API sends a code only when the number belongs to an account that may use
the console: it has the `operator` role, is active and is not waiting to be
deleted (the console's own rule, `canUseConsole`). Whatever the number, the
page then shows step 2 with the same words (R22.2).

### 3.3 Step 2: the code

"If this number belongs to an operator, we sent it a code. It works for 10
minutes." One field, **Code** (six digits), and **Check the code**. A link
**Send a new code** works after 30 seconds, as in the app.

A wrong code says how many tries are left. After 5 wrong tries, or after 10
minutes, the code no longer works and the page says to send a new one. The
code follows the app's sign-in code rules (R1.2): 6 digits, 10 minutes, 5
tries. Sending has its own count per number, apart from the app's: at most
one code per 30 seconds and 5 an hour (R22.6). The console's limit per
network address (10 a minute, 60 an hour) covers every try at both steps.

### 3.4 Step 3: a new passkey

A right code takes the operator to the setup step the `operator` command's
link already opens: **Save your passkey**, a name for it, and **Save the
passkey**. Its text here: "Save a new passkey for the console on this device
or your phone. This step works once, for 30 minutes." Saving signs the
operator in and opens the console home.

When the code is checked, the API at once:

1. ends every console session of the account, so a session someone else
   holds stops working;
2. makes a setup link for the account, which replaces any earlier link, and
   gives its token to this page only (never in an address);
3. writes `operator.recovered` to the audit log;
4. sends a notice by text to the account's number and, when the account has
   a verified email address and the server sends email, by email too
   (R22.4). Under a SIM swap the text reaches the wrong phone; the email
   does not. Email is off on staging until Mailjet is set up.

The passkeys the operator had stay. Martin removes the lost one on the
Passkeys page, which works right after saving the new one (it counts as a
passkey just used).

### 3.5 When no text comes

Step 2 says: "No text? The operator command on the server makes a setup
link too." The staging runbook explains it. The `operator` command stays as
the way back in when the phone number is lost too.

## 4. Rules

| ID    | Rule                                                                                                                                                                                                 |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R22.1 | A recovery code goes only to the verified phone number of an account that may use the console, and only does recovery: a sign-in or confirm code does not work here, and a recovery code works nowhere else. |
| R22.2 | The answer to "Send a code" uses the same words for any valid number. The page does not try to hide the operators from someone who times its answers or reads its error codes: the operator is the company's owner, which is no secret. |
| R22.3 | A recovery code alone never opens the console: it only lets the operator save a new passkey, and the console opens once that passkey is saved.                                                       |
| R22.4 | Using a recovery code ends all the account's console sessions, writes `operator.recovered` to the audit log, texts the account's number and emails its verified address when the server sends email. |
| R22.5 | The console's "Text messages" switch (spec 10, 3.3) does not stop recovery codes, so pausing texts cannot lock the operator out; the server's `SMS_PAUSED` kill switch does. The notice of R22.4 is not held by the "Text messages" or "Email" switch either, and is texted at any hour, not only in the day's alert hours.                             |
| R22.6 | Recovery codes have their own sending count per number (1 per 30 seconds, 5 an hour). They do not use up the app's sign-in texts of that number, and do not count in the app's limits per address or the daily cap per country: only operators' numbers get one, so the page cannot send texts in bulk. |

## 5. Screens

Phone first, in the console's narrow column, with the design system's
tokens and parts the sign-in and setup pages use.

```text
Sign in to the console            Get back into the console
[ Sign in with a passkey ]        Your phone number
Lost your passkey?                [ 690 0000            ]
                                  The number of your PuffinRide account...
                                  [ Send a code ]
                                  Back to sign-in
```

## 6. Data and API

- `verification_codes.purpose` gets the value `console_recovery`
  (migration; the check constraint lists the purposes).
- `POST /admin/v1/auth/recovery/code` `{ phoneNumber }`: 200
  `{ resendAfterSeconds }` for every valid number; 400 `phone_invalid`; 429
  `rate_limited` (the console's per-address limit or an operator number's
  limits, with `retryAfterSeconds`); 503 `sms_failed` when the provider
  refused an operator's text, so the operator knows to use the command.
- `POST /admin/v1/auth/recovery/verify` `{ phoneNumber, code }`: 200
  `{ token }`, the setup token; 400 `code_invalid` (`attemptsLeft`) or
  `code_expired`; 429 `code_attempts_exceeded` or `rate_limited`.
- Both join the open sign-in routes (`openAdminRoutes`), behind the same
  per-address limit as the passkey sign-in.
- The setup step then uses the existing `/admin/v1/auth/setup/options` and
  `/admin/v1/auth/setup` with the token.

## 7. Privacy and safety

- The phone number is the account's own, already held; the code is stored
  only as a hash, under the number's hash, and deleted by the hourly
  clean-up like other codes. Logs and the audit entry never hold the number
  or the code.
- **The risk we accept:** whoever controls the operator's phone number, for
  example after talking the phone company into a new SIM card, can now get
  into the console, which holds members' personal data. Before, they also
  needed the Render account. The notice email (once email is on), the audit
  entry and a phone that suddenly has no service make it visible; the
  operator can then take the role away on the server. ADR 0040 says when to
  revisit it.
- The notice email goes to the account's own verified address, already
  held; it names no phone number and no code.
- The setup token only travels in a JSON answer to the page that checked the
  code, never in an address, so it does not reach logs or history.

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

| Key                            | English                                                                                                                               | Icelandic (draft)                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin.signIn.lost`            | Lost your passkey?                                                                                                                    | Týndirðu aðgangslyklinum?                                                                                                                             |
| `admin.recover.title`          | Get back into the console                                                                                                             | Komdu aftur inn í stjórnborðið                                                                                                                        |
| `admin.recover.phone`          | Your phone number                                                                                                                     | Símanúmerið þitt                                                                                                                                      |
| `admin.recover.phoneHint`      | The number of your PuffinRide account. We send a code by text message.                                                                 | Númerið á PuffinRide-aðganginum þínum. Við sendum kóða með SMS.                                                                                        |
| `admin.recover.send`           | Send a code                                                                                                                           | Senda kóða                                                                                                                                            |
| `admin.recover.sent`           | If this number belongs to an operator, we sent it a code. It works for 10 minutes.                                                    | Ef þetta númer tilheyrir rekstraraðila sendum við kóða í það. Hann virkar í 10 mínútur.                                                               |
| `admin.recover.code`           | Code                                                                                                                                  | Kóði                                                                                                                                                  |
| `admin.recover.check`          | Check the code                                                                                                                        | Athuga kóðann                                                                                                                                         |
| `admin.recover.resend`         | Send a new code                                                                                                                       | Senda nýjan kóða                                                                                                                                      |
| `admin.recover.noText`         | No text? The operator command on the server makes a setup link too.                                                                   | Kom ekkert SMS? Operator-skipunin á þjóninum býr líka til uppsetningarhlekk.                                                                          |
| `admin.recover.back`           | Back to sign-in                                                                                                                       | Aftur í innskráningu                                                                                                                                  |
| `admin.recover.setupBody`      | Save a new passkey for the console on this device or your phone. This step works once, for 30 minutes.                                | Vistaðu nýjan aðgangslykil fyrir stjórnborðið í þessu tæki eða símanum. Þetta skref virkar einu sinni, í 30 mínútur.                                  |
| `sms.consoleRecoveryCode`      | {code} is your PuffinRide console code. Never share it.                                                                                | {code} er kóðinn þinn fyrir stjórnborð PuffinRide. Deildu honum aldrei.                                                                                |
| `email.consoleRecovered.subject` | PuffinRide: someone got into the console with a text code | PuffinRide: einhver komst inn í stjórnborðið með SMS-kóða |
| `email.consoleRecovered.body`  | A text code to your phone was just used to get into the PuffinRide console and save a new passkey. If this wasn't you, take away the operator role on the server now: operator remove. | SMS-kóði í símann þinn var notaður til að komast inn í stjórnborð PuffinRide og vista nýjan aðgangslykil. Ef þetta varst ekki þú skaltu taka hlutverkið af á þjóninum strax: operator remove. |
| `sms.consoleRecovered`         | PuffinRide: a text code was just used to get into the console and save a new passkey. If this wasn't you, take away the operator role on the server now (operator remove). | PuffinRide: SMS-kóði var notaður til að komast inn í stjórnborðið og vista nýjan aðgangslykil. Ef þetta varst ekki þú skaltu taka hlutverkið af á þjóninum strax (operator remove). |

Wrong and expired codes reuse the app's texts for them where they fit.

## 9. Testing

- Domain: the new code purpose; the recovery rules (who may get a code).
- API, integration: a code goes to an operator's number and not to a
  member's, a suspended operator's or one waiting to be deleted, with the
  same answer; limits per number and per address, apart from the app's sign-in
  count; a sign-in or confirm code is refused; a wrong code is counted; a
  right code ends the sessions, makes the setup link, writes the audit entry
  and sends the text and, with a verified email, the email; the token then
  saves a passkey and signs in; the "Text messages" switch does not stop it.
- Console: the three steps, wrong and expired codes, the resend wait, both
  languages.
- Journey: sign-in page, Lost your passkey?, the code from the test API's
  text outbox, a new passkey, the console home.

## 10. Out of scope

- A text code at every sign-in, passwords and authenticator apps (not
  chosen).
- Recovery codes on paper, email recovery and a waiting period before
  recovery works (ADR 0040, revisit).
- Removing old passkeys automatically on recovery.

## Decisions

| #   | Question                                                   | Decision                                                                                                                                                    |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | How does an operator get back in without a passkey?        | A text code to their own number, then a new passkey (Martin, 2026-11-22, on a decision card; not chosen: a text code at every sign-in, the command only)   |
| 2   | Does the page hide who the operators are?                  | Its words do; it goes no further, since the operator is no secret (R22.2; my call, after the design review) |
| 3   | What happens to other console sessions and old passkeys?   | Sessions end; passkeys stay until the operator removes them (R22.4; my call)                                                                                |
| 4   | Does the console's "Text messages" switch stop recovery?   | No, only the server's kill switch does (R22.5; my call)                                                                                                     |
| 5   | Is a recovery code a new kind of code?                     | Yes, its own purpose with the sign-in code's rules, and its own sending count (R22.1, R22.6; my call, after the design review) |
| 6   | Where does the notice go?                                  | By text, and by email to a verified address when the server sends email, which a SIM swap does not reach (R22.4; my call, after the design review) |
