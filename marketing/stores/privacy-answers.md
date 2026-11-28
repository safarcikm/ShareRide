# PuffinRide in the stores: the privacy answers

Apple's privacy label (App Store Connect, App Privacy) and Google's data
safety form (Play Console, App content, Data safety) for the Android and
iPhone apps, version 1.0. Spec 32, 3.9 and section 7. The answers come from
the [privacy register](../../docs/compliance/privacy-gdpr.md) as it stands
on 2026-11-27; when a row there changes what the apps collect, change this
page and both stores' answers in the same pull request.

What the stores count is narrower than the register:

- They count what leaves the phone, through our code or a library in it,
  and is kept longer than it takes to answer the request. Data kept only on
  the phone (recent searches, the booking chosen before signing up) is not
  collected.
- They do not count data that only our processors handle for us (Render,
  Hetzner, Expo, Mailjet, Vonage) as shared, nor what a person chooses to
  show other members (their profile, a chat message to the driver).
- The phone apps have **no analytics, no advertising and no tracking**: no
  Google Analytics (it is on the website only, after consent, spec 23), no
  advertising ID, no Meta Pixel. Phone builds send **no error reports to
  Sentry** (they have no DSN). If either changes, these answers change first.
- The apps never use the phone's location. "Approximate location (on
  request)" in the register is a later feature; the apps ask for no
  location permission today.
- No payments happen in the apps: passengers pay the driver in person
  (ADR 0038), so there is no financial information.

## Apple: App Privacy

**Data collection:** Yes, we collect data from this app.

**Tracking:** No data is used to track people. PuffinRide does not link
what it collects with other companies' data for advertising, and shares
nothing with data brokers, so the app shows no tracking prompt.

For each type below: **Linked to the person** means it is kept with their
account. **Purpose** is the one Apple lists. None is used for tracking.

| Apple's data type                  | What it is in PuffinRide                                                                                                                                  | Linked | Purpose           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------- |
| Contact Info: Name                 | First name                                                                                                                                                | Yes    | App Functionality |
| Contact Info: Email Address        | The verified email, and an email typed to get a sign-in code                                                                                              | Yes    | App Functionality |
| Contact Info: Phone Number         | The phone number checked once at sign-up                                                                                                                  | Yes    | App Functionality |
| User Content: Photos or Videos     | The profile photo; a screenshot a person adds to feedback                                                                                                 | Yes    | App Functionality |
| User Content: Customer Support     | Feedback and its reply; "Ask about my data" and its answer                                                                                                | Yes    | App Functionality |
| User Content: Other User Content   | Chat messages, a booking request's message, a driver's note on a ride, reviews, reports, the bio                                                          | Yes    | App Functionality |
| Search History                     | The searches made in Find (from, to, the day and seats), kept without the account, a device ID or the network address                                     | No     | Analytics         |
| Identifiers: User ID               | The account's ID, and Google's or Apple's ID for the person when they sign in with one                                                                    | Yes    | App Functionality |
| Identifiers: Device ID             | The phone's push token; Expo's random install ID for app updates                                                                                          | Yes    | App Functionality |
| Diagnostics: Crash Data            | After a launch that failed, its error message, sent to Expo with the update check so the app goes back to the version that worked                         | No     | App Functionality |
| Diagnostics: Other Diagnostic Data | App version, phone system and model, with feedback and with each device signed in to the account                                                          | Yes    | App Functionality |
| Other Data                         | Rides posted and booked, cars (make, model, colour, number plate), languages, the reliability figure, the 18-and-over confirmation, notification settings | Yes    | App Functionality |

Not collected: health and fitness, financial info, location (precise or
coarse), sensitive info, contacts, emails or text messages from the phone,
audio, gameplay content, browsing history, purchases, product interaction,
advertising data, other usage data, performance data, physical address,
other contact info.

Apple's notes we followed: chat messages inside the app are "Other User
Content", as Apple's "Emails or Text Messages" means the phone's own email
and messages; the push token is a device-level ID, so it is declared.

**Privacy policy URL:** `https://puffinride.is/legal/privacy`.

## Google Play: Data safety

### Data collection and security

| Question                                                                 | Answer                                                                                                                                       |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Does your app collect or share any of the required user data types?      | Yes                                                                                                                                          |
| Is all of the user data collected by your app encrypted in transit?      | Yes (HTTPS only)                                                                                                                             |
| Which ways of making an account does your app support?                   | Username, password and other authentication (a code by email); OAuth (Google and Apple sign-in)                                              |
| Delete account URL                                                       | `https://puffinride.is/delete-account`                                                                                                       |
| Can people ask for some data to be deleted without deleting the account? | Yes: they remove their photo, bio and cars in the app, and ask for anything else with "Ask about my data" or by email to `admin@puffinride.is` |
| Has your app completed an independent security review?                   | No                                                                                                                                           |

### Data shared

None. Processors acting for PuffinRide and what a person shows other
members themselves do not count as sharing (Google's own exceptions).

### Data collected

"Required" means the app cannot be used without it;
"optional" means the person chooses to give it. None is processed only
ephemerally.

| Google's category: type                    | What it is in PuffinRide                                                 | Required                                         | Purposes                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| Personal info: Name                        | First name                                                               | Required                                         | App functionality, Account management                                            |
| Personal info: Email address               | The verified email                                                       | Required                                         | App functionality, Account management                                            |
| Personal info: Phone number                | Checked once at sign-up                                                  | Required                                         | App functionality, Account management, Fraud prevention, security and compliance |
| Personal info: User IDs                    | The account's ID; Google's ID for a person who signs in with Google      | Required                                         | App functionality, Account management                                            |
| Personal info: Other info                  | Languages they speak, the bio, the 18-and-over confirmation              | Required (the confirmation); optional (the rest) | App functionality                                                                |
| Photos and videos: Photos                  | The profile photo; a screenshot added to feedback                        | Optional                                         | App functionality                                                                |
| Messages: Other in-app messages            | Chat, a booking request's message, feedback                              | Optional                                         | App functionality                                                                |
| App activity: In-app search history        | Searches in Find, kept without the account                               | Required                                         | Analytics                                                                        |
| App activity: Other user-generated content | Rides posted and booked, cars, a driver's note, reviews, reports         | Optional                                         | App functionality, Fraud prevention, security and compliance                     |
| App info and performance: Crash logs       | A failed launch's error message, to Expo with the update check           | Required                                         | App functionality                                                                |
| App info and performance: Diagnostics      | App version, phone system and model, with feedback and signed-in devices | Optional                                         | App functionality                                                                |
| Device or other IDs                        | The push token; Expo's random install ID for app updates                 | Required                                         | App functionality                                                                |

Not collected: location, financial info, health and fitness, emails and SMS
on the phone, audio, files and documents, calendar, contacts, installed
apps, web browsing, app interactions, other actions, performance data.

## When to look at these again

- Error reports from the phone apps (Sentry on phones, spec 32, section 10):
  add Crash Data and Diagnostics, linked, for App Functionality.
- Payments in the app (milestone 15): add Financial Info (purchase history;
  card details stay with the payment provider) in both forms.
- Location for nearby meeting points: Approximate location, optional, App
  functionality, not stored.
