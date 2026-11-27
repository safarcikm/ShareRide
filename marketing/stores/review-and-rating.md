# PuffinRide in the stores: age rating, notes for the reviewers, and the rest of the forms

The answers both stores ask for besides the texts, the pictures and the
privacy answers (spec 32, 3.9). Version 1.0, 2026-11-27. The review
account's password is **never** written here or anywhere in the repository:
Martin types it into the two stores' forms only.

## Before the first review: the review account (Martin)

Spec 32, step 9, and R32.6 (sample data only):

1. On `puffinride.is`, make an account for the reviewers: the first name
   **Review**, an email address of ours that receives mail (for example a
   new alias of `admin@puffinride.is` in Google Workspace), a password
   (Profile, Sign-in methods), and the phone check with a number of ours. No
   photo of a real person: the PuffinRide puffin, or none.
2. Make a second one the same way, **Puffin**, as a driver, with a car
   (any make, model and colour, and no number plate, so no real car's plate
   shows) and the puffin as its photo. Post a ride
   from it about three weeks ahead, from **N1 Borgarnes** to **Olís
   Blönduós**, two seats, booked instantly, with the note "A sample ride for
   the App Store and Google Play reviewers."
3. Put the Review account's email and password into both stores' forms
   (below). Write them nowhere else.
4. After each review, cancel any booking the reviewers made, and post the
   sample ride again before the next one.

## Testers (TestFlight and Google Play testing)

Invite testers by their email address alone, with no names: Privacy Policy
version 4 says we give Apple or Google only the email address. In
TestFlight, leave the first and last name empty; in Google Play testing,
add the addresses to the testers' list (or a Google Group).

## App Store Connect

### App Information

| Field | Answer |
| ----- | ------ |
| Primary category | Travel |
| Secondary category | None |
| Content rights | Yes, it shows third-party content, and we have the rights: what members write and their photos (under the Terms of Service), the meeting point photos we put up, and our map drawn from Natural Earth (public domain) |
| Age rating | The questionnaire below |
| License agreement | Apple's standard one |

### Age rating questionnaire

| Question | Answer |
| -------- | ------ |
| Parental controls | No |
| Age assurance | No (people confirm they are 18 or over at sign-up; nothing checks it) |
| Unrestricted web access | No (links open our own pages, and the stores, Google's and Apple's sign-in, Facebook and Instagram in the phone's browser) |
| User-generated content | Yes: profiles, chat, reviews, ride notes. People can report and block (spec 9) |
| Messaging and chat | Yes, between a driver and their passengers once a booking is confirmed |
| Advertising | No |
| Every content question (violence, sexual content, profanity, horror, alcohol, tobacco and drugs, medical, gambling, contests, loot boxes) | None |

Apple then works out the rating. If App Store Connect offers a higher age
rating than the one it worked out, choose **18+**, as the Terms of Service
do; if it does not, keep its rating: the 18-and-over confirmation at sign-up
still applies.

### Pricing and availability

- Price: the free tier (the app costs nothing to download).
- Availability: every country and region the App Store offers (spec 32,
  3.9: visitors download from their own country's store).

### App Review Information

- **Sign-in required:** yes. Username: the Review account's email.
  Password: its password (typed in App Store Connect, never here).
- **Contact:** Martin's name, `admin@puffinride.is` and the phone number
  of the trader details.
- **Notes**, to paste:

```text
PuffinRide is carpooling in Iceland: drivers offer the empty seats on rides they make anyway, and passengers book a seat for all or part of the way, between public meeting points.

Signing in: on the Profile tab, Sign in, then the email and password above. The account already passed the one-time phone check, which needs an Icelandic text message.

To try booking: on Find, search from Borgarnes to Blönduós. The ride by "Puffin" is our own sample ride; please book only that one, as the other rides are real people's.

Passengers pay their share of the ride to the driver in person, in cash or by bank transfer, when they ride. Nothing is bought in the app, and PuffinRide takes no money: it is a real-world service used outside the app (guideline 3.1.3(e)).

People who meet through the app can report and block each other: Report and Block are on a person's profile and at the top of a chat, and Report this ride is on each ride. Our team answers reports; the community rules are under Profile, About PuffinRide. Contact: admin@puffinride.is.

Deleting an account: Profile, Privacy and your data, Delete my account. The steps are also at https://puffinride.is/delete-account.

Version 1.0 has no Sign in with Apple and no other third-party sign-in on the iPhone: email code and password only.

The app is for people aged 18 and over (Terms of Service, confirmed at sign-up).
```

### Export compliance

The app uses only the encryption built into iOS (HTTPS) and declares it
(`usesNonExemptEncryption: false` in `apps/mobile/app.json`), so App Store
Connect asks nothing more.

### URLs

| Field | Address |
| ----- | ------- |
| Privacy Policy URL | `https://puffinride.is/legal/privacy` |
| Support URL | `https://puffinride.is/about` |
| Marketing URL | `https://puffinride.is` |

## Google Play Console

Play Console, PuffinRide, Policy and programs, App content: each item and
its answer.

| Item | Answer |
| ---- | ------ |
| Privacy policy | `https://puffinride.is/legal/privacy` |
| App access | All or some functionality is restricted. Add instructions: name "Review account", the Review account's email and password (typed in the Console only), and the notes above from "Signing in" to "Deleting an account" |
| Ads | No, the app has no ads |
| Content rating | The IARC questionnaire below |
| Target audience | 18 and over only. Not designed for children; nothing in it is meant to appeal to them |
| News app | No |
| Data safety | [privacy-answers.md](privacy-answers.md) |
| Government app | No |
| Financial features | My app doesn't provide any financial features |
| Health apps | No |
| Account deletion | `https://puffinride.is/delete-account` |

### Content rating (IARC)

- Email for the rating certificate: `admin@puffinride.is`.
- Category: **All other app types** (utility, productivity, communication
  or other); PuffinRide is not a game, and its first purpose is travel, not
  social networking.

| Question | Answer |
| -------- | ------ |
| Violence, fear, sexuality, language, controlled substances, crude humour | No, to each |
| Does the app allow users to interact or exchange content? | Yes (chat, reviews, profiles) |
| Does the app share the user's current physical location with other users? | No (people choose meeting points; the app never reads the phone's location) |
| Does the app allow users to buy digital goods? | No |
| Does the app contain gambling, or simulated gambling? | No |
| Does the app contain unrestricted access to the internet? | No |
| Is the app a web browser or search engine? | No |

Expected result: the lowest rating in each country, with the note that
users interact. Target audience (18 and over) is what keeps it for adults.

### Store settings

- Category: **Travel and local**. Tags: carpooling, travel, transport if
  offered.
- Contact details: `admin@puffinride.is`, the website
  `https://puffinride.is`, and the phone number Martin chose for the trader
  details (spec 32, step 7).

### Countries

Every country Google Play offers (production track, Countries and regions),
as on the App Store.

## What changes when

- Sign in with Apple and Google sign-in on the iPhone: take the line about
  third-party sign-in out of the App Store notes.
- Payments in the app (milestone 15): rewrite the payment paragraph of the
  notes (Apple's rules for services used outside the app still apply), and
  Financial features on Google Play.
- The company (ehf.) takes over the accounts: new contact and trader
  details, with a new version of the Terms and the privacy policy (spec 32,
  section 10).
