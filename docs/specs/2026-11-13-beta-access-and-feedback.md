# Spec 12: Beta access and feedback

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Approved (2026-11-13)

Features: J1 Beta access, J2 In-app feedback, J3 Usage analytics with consent
([features](../product/features.md)). Related:
[spec 1](2026-11-13-sign-in-and-profile.md) (sign-up asks for an invite
code), [spec 10](2026-11-13-operator-settings-and-metrics.md) (metrics,
announcements, switches), [roadmap](../strategy/roadmap.md#phase-3-closed-beta)
(50 to 150 testers on 3 to 5 corridors for 6 to 8 weeks).

## 1. Problem and goal

A ride-sharing beta only works if drivers and passengers on the same roads
join at the same time. Open sign-up would spread a few people thinly across
the whole country. The beta also exists to learn, so testers need an easy way
to say what went wrong.

Goal: a waitlist that collects interest by corridor; invite codes that let
Martin bring in drivers and passengers corridor by corridor; feedback from
any screen that lands in the console; and a clear answer on whether usage
analytics are needed at all.

## 2. User stories

- As someone who drives Selfoss to Reykjavík every weekday, I join the
  waitlist as a driver and pick my corridor.
- As the operator, I invite the 20 drivers on the Selfoss corridor first, and
  passengers two weeks later.
- As a workplace contact, I share one group code with colleagues so they can
  join together.
- As a tester, I shake my phone when something looks wrong, add a sentence
  and a screenshot, and send it.
- As the operator, I read new feedback each morning, mark it planned or done,
  and reply to the tester.

## 3. Behaviour

### 3.1 Waitlist

1. A waitlist page on the ShareRide website, in Icelandic and English, asks
   for: email; whether they want to offer rides, find rides or both; the
   corridors they travel (from the operator's corridor list, spec 10, plus
   "somewhere else" with a short text); and their language. How they heard
   about ShareRide is optional.
2. The person confirms by clicking a link in an email (double opt-in). Only
   confirmed entries count.
3. Every email has a link to leave the waitlist, which deletes the entry.
4. The page is part of our own web app and posts to our API, so no
   third-party form tool is needed. It is protected against bots with a
   hidden field and rate limits, without a captcha service.
5. Anyone can browse meeting points and search trips on the website during
   the beta, without an invite (decision 1). Trying to book, post or chat
   shows "ShareRide is in a closed beta" with a link to the waitlist. The
   phone apps are only on TestFlight and Google Play testing.

### 3.2 Invite codes (J1)

1. **Personal codes:** the operator filters the waitlist (role, corridor,
   language, date joined) and invites a chosen group. Each person gets a
   single-use code by email, in their language, with a link that opens the
   app or its store page. A personal code expires after 30 days.
2. **Group codes:** for a workplace, school or club: a code with a name, a
   number of uses and an end date, which the operator creates and shares
   by hand.
3. Sign-up asks for the code first (spec 1, step 3). A valid code is used up
   when the account is created. The account records which code it came from.
4. **Waves (decision 2):** a corridor's drivers are invited two weeks before
   its passengers, so there are trips on day one; passengers then follow in
   weekly waves of about 25 per corridor. A setting caps the
   number of testers (`beta_max_testers`, spec 10); codes stop working once
   it is reached, and the console shows how many places are left.
5. At public launch, the switch "Invite code required" (spec 10) is turned
   off and the waitlist is invited in one go.
6. Testers see a small "Beta" label in the app, and the terms (spec 1) say
   that this is a test version.

### 3.3 In-app feedback (J2)

1. "Send feedback" is in the menu on every screen. On phones, shaking the
   phone opens it too; this can be turned off in Settings.
2. The form: what kind (something isn't working, an idea, something else); a
   message of up to 2 000 characters; and, on by default, a screenshot of the
   screen they came from, shown before sending with a reminder to check it
   shows nothing they don't want to share. They can remove it.
3. Sent with it, automatically: app version, platform and OS version, screen
   name, language and time. Nothing else from the device.
4. **In the console:** a list of feedback, newest first, with the screenshot
   and details, and a status: new, read, planned, done or won't do. The
   operator can send a short reply, which reaches the tester by push and
   email (spec 7).
5. Testers can see what they sent and any replies under Settings.

### 3.4 Usage analytics (J3)

The beta has no usage analytics (decision 3). The metrics in spec 10
measure the exit criteria without tracking anyone, and feedback and talks
with testers tell us the rest. So there is no consent screen, no analytics
provider and no cookie banner in the beta.

If analytics are added before launch, they will need: opt-in consent that can
be withdrawn under Privacy (spec 11); a fixed list of product events with no
names, IDs, places, free text or network address; no session recording or
advertising IDs; and an EEA provider chosen in an ADR, with a data processing
agreement ([integrations](../architecture/integrations.md)).

Crash and error reports are not analytics: they are covered by
[security](../engineering/security.md), with personal data removed.

## 4. Rules

| ID | Rule |
| -- | ---- |
| R12.1 | During the beta, creating an account needs a valid invite code, until the operator turns the requirement off. |
| R12.2 | A personal code works once and expires after 30 days; a group code works up to its number of uses and until its end date. |
| R12.3 | No code works once the number of testers reaches `beta_max_testers`. |
| R12.4 | A waitlist entry counts only after email confirmation, and leaving the waitlist deletes it. |
| R12.5 | Feedback carries only the tester's message, an optional screenshot they have seen, and the app's technical details. |
| R12.6 | The beta collects no usage analytics. |

## 5. Screens

1. Waitlist page: form, "check your email", confirmed, left the waitlist
2. Invite code step in sign-up (spec 1)
3. "Closed beta" screen for people without a code
4. Send feedback, and my feedback with replies (Settings)
5. Console: waitlist with filters and "invite selected"; group codes; places
   left; feedback list with status and reply

## 6. Data and API

Entities (see [domain model](../architecture/domain-model.md)):

- `WaitlistEntry`: email, role, corridors, other place text, language,
  source, confirmed at, invited at, invite code, created at.
- `InviteCode`: code (8 characters, without easily confused letters), kind
  (`personal`, `group`), name, waitlist entry (personal), uses allowed, uses,
  expires at, created by.
- `User` (existing): gains `invite_code_id`.
- `Feedback`: user, kind, message, screenshot, app version, platform, OS
  version, screen, language, created at, status, reply, replied at.

Endpoints (`/v1`, shapes defined in `packages/contracts`):

| Method and path | Purpose |
| --------------- | ------- |
| `POST /waitlist` | Join the waitlist (public, rate-limited) |
| `POST /waitlist/confirm` | Confirm with the emailed token |
| `POST /waitlist/leave` | Leave with the emailed token |
| `POST /invites/check` | Check a code before sign-up (rate-limited) |
| `POST /feedback` | Send feedback with an optional screenshot |
| `GET /me/feedback` | My feedback and replies |

Console endpoints under `/admin/v1`: the waitlist (filter, invite selected),
invite codes (create group codes, list, places left), and feedback (status,
reply).

Domain functions in `packages/domain`: whether a code can be used, and the
tester cap.

Events: `WaitlistJoined`, `WaitlistConfirmed`, `InviteSent`, `InviteUsed`,
`FeedbackReceived`, `FeedbackReplied`.

## 7. Privacy and safety

- **Waitlist:** email, role, corridors, language and source, to invite
  people to the beta (consent, given by confirming). Seen by the operator
  only. Deleted when the person leaves the waitlist, 30 days after they sign
  up, or 12 months after joining if never invited.
- **Feedback:** the message and screenshot can contain personal data. Seen
  by the operator only, stored in the EEA, kept 12 months after the beta
  ends, and deleted with the account (spec 11).
- **Invite codes** hold no personal data apart from the link to a waitlist
  entry for personal codes.
- All three are listed in the privacy register. The beta has no usage
  analytics, so no analytics data is collected.

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

| Key | English | Icelandic (draft) |
| --- | ------- | ----------------- |
| `beta.badge` | Beta | Beta |
| `beta.closed` | ShareRide is in a closed beta. Join the waitlist and we'll invite you. | ShareRide er í lokaðri beta-prófun. Skráðu þig á biðlistann og við bjóðum þér. |
| `waitlist.title` | Join the waitlist | Skráðu þig á biðlistann |
| `waitlist.role` | I want to | Ég vil |
| `waitlist.roleOffer` | Offer rides | Bjóða far |
| `waitlist.roleFind` | Find rides | Finna far |
| `waitlist.roleBoth` | Both | Bæði |
| `waitlist.corridors` | Where do you travel? | Hvert ferðast þú? |
| `waitlist.checkEmail` | Check your email to confirm. | Athugaðu tölvupóstinn þinn til að staðfesta. |
| `waitlist.confirmed` | You're on the list. We'll email you when there's a place for you. | Þú ert á listanum. Við sendum þér tölvupóst þegar pláss losnar fyrir þig. |
| `waitlist.leave` | Leave the waitlist | Fara af biðlistanum |
| `invite.enterCode` | Enter your invite code | Sláðu inn boðskóðann þinn |
| `invite.invalid` | This code isn't valid or has expired. | Þessi kóði er ekki gildur eða er útrunninn. |
| `invite.full` | The beta is full for now. We'll let you know when there's a place. | Beta-prófunin er full í bili. Við látum þig vita þegar pláss losnar. |
| `invite.emailSubject` | Your invitation to the ShareRide beta | Boð í beta-prófun ShareRide |
| `feedback.title` | Send feedback | Senda ábendingu |
| `feedback.kindProblem` | Something isn't working | Eitthvað virkar ekki |
| `feedback.kindIdea` | An idea | Hugmynd |
| `feedback.kindOther` | Something else | Annað |
| `feedback.placeholder` | What happened, or what could be better? | Hvað gerðist, eða hvað mætti betur fara? |
| `feedback.screenshot` | Include a screenshot of this screen | Láta skjámynd af þessum skjá fylgja |
| `feedback.screenshotCheck` | Check that the screenshot shows nothing you don't want to share. | Gakktu úr skugga um að skjámyndin sýni ekkert sem þú vilt ekki deila. |
| `feedback.thanks` | Thank you! We read every message. | Takk fyrir! Við lesum öll skilaboð. |
| `feedback.shake` | Shake to send feedback | Hrista símann til að senda ábendingu |

## 9. Testing

- **Unit (domain):** personal and group code rules (used, expired, out of
  uses); the tester cap; waitlist filters.
- **API integration:** sign-up without a valid code is refused while the
  requirement is on and allowed once it is off; a personal code cannot be
  used twice, even by two sign-ups at the same moment; unconfirmed waitlist
  entries are never invited; leaving deletes the entry; rate limits on the
  public endpoints; feedback refuses files that are not images or are too
  large.
- **End to end:** join the waitlist, confirm, get invited, sign up with the
  code; send feedback with a screenshot and see the operator's reply.
- **Manual:** shake to send on real iOS and Android phones; the invitation
  email in both languages and in the common mail apps.

## 10. Out of scope

Referral rewards; public sign-up (launch); surveys and interviews (run
outside the app during the beta); feature flags per tester; crash reporting
(engineering).

## Decisions

Accepted by Martin on 2026-11-13 as recommended.

| # | Question | Decision |
| - | -------- | -------- |
| 1 | During the beta, can people without an invite browse and search trips on the website? | Yes. They see real trips and a "closed beta, join the waitlist" message when they try to book or post. It shows the product and grows the waitlist; the phone apps are only on TestFlight and Google Play testing anyway |
| 2 | How should invitations go out? | Drivers first: invite the drivers on a corridor two weeks before its passengers, so trips are there on day one. Then passengers in weekly waves of about 25 per corridor, up to 150 testers in total |
| 3 | Do we need usage analytics in the beta? | No. The metrics in spec 10 already measure the exit criteria without tracking anyone, and feedback plus talking to testers tells us the rest. Dropping it means no consent screen, no analytics provider and no cookie banner. Revisit before launch |
