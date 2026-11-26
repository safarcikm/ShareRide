# Spec 24: Emails that look like PuffinRide

**Owner:** Martin · **Date:** 2026-11-22 · **Status:** Approved
(2026-11-22, by Martin after the previews: "Guess the links wont be visible,
otherwise approved")

Features: E1, F2 and A1, every email the API sends
([features](../product/features.md)). Changes how emails look, not what they
say or when they go: [spec 7, 5](2026-11-13-chat-and-notifications.md#5-screens)
("Emails are plain and readable without images") and
[spec 20](2026-11-22-email-alerts-and-open-beta.md). Follows the
[visual design system](2026-11-13-visual-design-system.md) (spec 15).
Related: [ADR 0027](../decisions/0027-email-through-mailjet.md) (Mailjet),
[ADR 0039](../decisions/0039-rename-to-puffinride.md) (the sender
`hello@puffinride.is`), [staging runbook](../operations/staging.md#show-the-puffin-beside-our-emails).

## 1. Problem and goal

Martin, 2026-11-22: "Also start a thread that will make the emails look
good", and "hello@PuffinRide doesn't have icon".

Every email is a paragraph and a bare link, without the logo, the colours or
a button, and the sender has no picture in the inbox. Members read these
emails for things that matter: a booking request with a deadline, the hour
before a ride, the link that confirms their address. A plain message from an
unknown sender looks like spam and gets less trust than the app.

**Goal:** every email looks like PuffinRide (the puffin pin, the moss button,
our colours and type) in Icelandic and English, reads well on a phone and a
computer, in light and dark mode, in Gmail, Outlook and Apple Mail, with a
plain-text part as good as the HTML. The words, the legal texts and when an
email goes stay as they are. The sender shows the puffin in Gmail.

## 2. User stories

- As a member, I recognise an email from PuffinRide at a glance, and I can
  tell what it is about and what to do from its title and its one button.
- As a member reading on my phone at night in dark mode, the email is dark
  too and still easy to read.
- As a member whose mail app blocks pictures, the email still reads well and
  its button still works.
- As a member with a text-only mail app, or a screen reader, I get the same
  words and the link, in a sensible order.
- As a Gmail user, I see the puffin beside the sender `PuffinRide`.

## 3. Behaviour

### 3.1 One layout for every email

All emails are made by one function (`emailContent`), from a notification's
title, words and link, and the address-confirmation email the same way. The
layout, from top to bottom:

1. **Preview line:** hidden, the first paragraph of the words, so the inbox
   list shows what the email says rather than "PuffinRide" again.
2. **Header:** the puffin pin icon (the browser tab icon, a disc since
   2026-11-25) 40 pixels wide, then "PuffinRide" in Fredoka SemiBold at 24
   pixels in `text`, 10 pixels apart (spec 15, 4.9: the name at 0.6 of the
   icon's height, a quarter of it apart). On `background` (frost).
3. **Card:** `surface` (white), corners `card` (22), the chunky bottom edge
   (`card` 3 in `edge`), padding `xl` (32), `lg` (24) on a phone.
   - The **title** in `title` type (Fredoka 28/34) in `text`.
   - The **words** in `body` type (Nunito 17/24) in `text`. A blank line in
     the words starts a new paragraph; a single line break stays a line
     break. When the words start with the title (a statement of reasons), the
     title is not repeated.
   - The **button**: the link's words ("Open in PuffinRide", "Confirm my
     email", "Directions", …) in `button` type on `primary` (moss) in
     `onPrimary`, corners `control` (16), with the `buttonPrimary` bottom
     edge (4) in `primaryEdge`. It fits its label. The link is not written
     out under it (Martin, 2026-11-22); the plain-text part has it.
4. **Footer:** under the card, in `small` type in `textMuted`: why the email
   came (the existing footer), then "PuffinRide · puffinride.is" linking to
   the web app (on staging its address).

Everything in the card is left-aligned, as long texts (a statement of
reasons, an announcement) read best that way; the header and footer follow
it. The column is `maxContentWidth` (480) wide, and narrower on a phone,
with `md` (16) around it.

```text
 ┌────────────────────────────────────────┐   frost
 │ [pin] PuffinRide                        │
 │ ┌────────────────────────────────────┐ │
 │ │ Booking confirmed                  │ │   white card
 │ │                                    │ │
 │ │ Saturday 14 November at 09:00 ·    │ │
 │ │ BSÍ bus terminal                   │ │
 │ │                                    │ │
 │ │ ( Open in PuffinRide )             │ │   moss button
 │ └────────────────────────────────────┘ │
 │ You get this email because you have a  │   grey footer
 │ PuffinRide account. …                  │
 │ PuffinRide · puffinride.is             │
 └────────────────────────────────────────┘
```

### 3.2 Dark mode

Mail apps that follow the phone's or computer's dark mode and read our
styles (Apple Mail on iPhone, iPad and Mac, Outlook on Mac, iOS and Android,
Outlook on the web) get the dark column of spec 15: `background` night,
`surface`, `text`, `textMuted`, the light moss button with dark text. The
Gmail apps change the colours by themselves; the layout is made so their
change keeps it readable (live text, no text in pictures, the icon on its
own moss square, which reads on light and dark).

### 3.3 Mail apps

The layout is tables with the styles written on each part, as mail apps
need, and a `<style>` block only for dark mode, the phone width and Apple's
automatic links. It is checked in Gmail (web, Android, iOS), Outlook
(Windows, Mac, web), Apple Mail (Mac, iPhone) and at 320 pixels wide.
Outlook on Windows shows the button with square corners; everything else is
the same.

### 3.4 Pictures

The icon travels inside the email (an inline picture, `cid:`), not loaded
from our server: it shows where outside pictures are blocked (Outlook, some
work accounts), and nothing tells us or anyone else when an email was opened
(R7.9). It is the only picture. It has no alternative text, as the name next
to it says the same; with pictures off, the email loses nothing.

No fonts are downloaded (spec 15, ADR 0017). Fredoka and Nunito are named
first, for the few who have them; Apple devices then use their rounded system
font for titles and buttons, and others their own system font.

### 3.5 The plain-text part

The same words, in this order:

```text
Booking confirmed

Saturday 14 November at 09:00 · BSÍ bus terminal

Open in PuffinRide: https://puffinride.is/bookings/0190a1d6-…

--
You get this email because you have a PuffinRide account. News about your
bookings is always sent, because others rely on it.
PuffinRide · https://puffinride.is
```

Paragraphs are as written: a statement of reasons keeps its lines. The link
stays after its words on one line, as the app's tests and the journeys read
it there.

### 3.6 The sender's picture

Gmail shows the profile photo of the Google account whose address sends the
email. `hello@puffinride.is` has none: it is not an account, so members'
replies never reach a mailbox (ADR 0039). Martin chose, on a decision card
(2026-11-22), to make it a Google Workspace user (one more Business Starter
seat) with the puffin as its photo, and a Gmail rule that refuses any mail
sent to it, so replies still go back to their sender and it holds no member
data. The steps are in the
[staging runbook](../operations/staging.md#show-the-puffin-beside-our-emails).
Gmail then shows the puffin in its apps and in an opened email.

Not now:

- **BIMI** puts the logo in the inbox list of Gmail and Apple Mail (Outlook
  shows none). It needs DMARC at `quarantine` or `reject` (ours is `none`), a
  logo in SVG Tiny PS, and a certificate of about 750 to 1 450 US dollars a
  year: a VMC needs a registered trademark (PuffinRide has none) and a CMC
  needs the logo in public use for 12 months (from about November 2027).
  Revisit then. Moving DMARC to `quarantine` once its reports are clean is
  worth doing before.
- **Apple Branded Mail** (Apple Business) shows the logo in Apple Mail; Apple
  must first verify the organisation, so it waits until the company is
  registered.
- **Gravatar** reaches only a few mail apps (Thunderbird with an add-on,
  Airmail, Postbox), and its sign-up email to `hello@` would be refused.

## 4. Rules

| #     | Rule |
| ----- | ---- |
| R24.1 | Every email uses the one layout of 3.1. Its words are the notification's or the address confirmation's, unchanged; the layout adds only the name "PuffinRide" and the web app's address. |
| R24.2 | An email loads nothing from the internet: the icon travels inside it, no fonts, no tracking pixel, and open and click tracking stay off (R7.9). Its links lead only to the web app. |
| R24.3 | It reads fully without pictures and without styles, and the plain-text part carries the same title, words, link and footer (3.5). |
| R24.4 | Colours, type, corners and spacing are spec 15's tokens, from `@shareride/ui`; text meets 4.5:1 in light and dark mode. |
| R24.5 | The one button is a link with its words, at least 44 pixels high. The HTML does not write the address out; the plain-text part does. |

## 5. Screens

The layout of 3.1, in light and dark mode, on a phone and a computer.
Previews of the key emails (confirm your email, a booking request, booking
confirmed, the hour before, "How was your trip?") are in the project files,
`branded-emails/`, made with `pnpm --filter @shareride/api email-previews`.

## 6. Data and API

- `EmailMessage` gains `images`: inline pictures with their content ID, file
  name, type and bytes. The Mailjet adapter sends them as
  `InlinedAttachments` (Send API v3.1); the development outbox and the test
  fakes keep them with the message.
- The icon is `apps/api/assets/email-logo.png`, 120 pixels square (three
  times its size in the email), exported from `favicon.svg` by
  `apps/mobile/scripts/export-icons.ts` with the other pictures.
- No new table, endpoint, setting or migration.

## 7. Privacy and safety

- No new personal data. The email holds what it held (R7.9): first names,
  places, times and the screen's link; never a chat message's text.
- Nothing in an email reaches out when it is opened (R24.2), so no one learns
  who read it or when.
- The preview line repeats the first paragraph of the words, which the email
  already shows.
- `hello@puffinride.is` as a Workspace user refuses all incoming mail, so
  members' replies are never stored (ADR 0039 holds).

## 8. Texts

None new: the layout uses the existing titles, words, link words and
footers in Icelandic and English, and the name PuffinRide.

## 9. Testing

- API unit tests (`email-content.test.ts`): the plain text's order; the
  HTML's language, title, preview line, paragraphs and line breaks, the
  button as the only link to the screen, footer and home link; no repeated title; everything
  escaped, in the words and in the link; the icon referenced by `cid:` and
  sent with the email; no other picture, no script, no address outside the
  web app; the colours from the tokens, light and dark.
- `email-mailjet.test.ts`: inline pictures become `InlinedAttachments`.
- `email-logo.test.ts`: the icon is a 120-pixel PNG.
- By hand, once: the previews in Gmail (web, iOS), Outlook (web) and Apple
  Mail (iPhone, light and dark), from the Mailjet sandbox or a real send on
  staging.

## 10. Out of scope

- Changing any email's words, adding emails, or a newsletter template.
- Receipts (spec 13) and their company details in the footer: they come with
  card payments.
- BIMI, Apple Branded Mail and Gravatar (3.6).
- An email preview in the operator console.

## Decisions

| #   | Question | Decision |
| --- | -------- | -------- |
| 1   | How is the HTML made? | Hand-written tables in our own code, with spec 15's tokens (my call). Not chosen: MJML or React Email (a new dependency and build step for one layout), Mailjet's templates (the words would leave the repository and its translations). |
| 2   | How does the icon get there? | Inside the email, as an inline picture (my call). Not chosen: loaded from puffinride.is (blocked by default in Outlook, and it tells the server when an email is opened), or no picture. |
| 3   | Downloaded fonts? | None, as in the app (spec 15); system fonts stand in (my call). |
| 4   | Left or centred? | Left-aligned in the card, for long texts (my call; spec 15 centres titles and buttons on screens). |
| 5   | The sender's picture | `hello@` as a Workspace user with the puffin photo and a rule refusing mail to it (Martin, 2026-11-22, on a decision card; not chosen: not now). BIMI when a certificate is possible. |
| 6   | Write the link out under the button? | No: the button only (Martin, 2026-11-22, after the previews). |
