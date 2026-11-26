# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Once the apps ship,
releases follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added (Phase 2, build)

- Milestone 1 plan (foundation and phone sign-in) and ADR 0016: our own
  sign-in module instead of an auth library.
- Monorepo with pnpm workspaces, Turborepo and a shared tool catalog; shared
  TypeScript, ESLint and Prettier configuration in `packages/config`.
- `packages/domain` with the first rule: money as integer amounts with a
  currency, and the `Result` type for domain errors. Lint rules keep the
  domain free of I/O, frameworks, clock and randomness.
- CI for code: format, lint, type check, unit tests and a dependency audit
  on every pull request; Dependabot for npm packages.
- API skeleton (Hono): `/v1/health`, `/v1/health/ready` and
  `/v1/openapi.json`, the standard error shape, request IDs, security headers
  and JSON logs that redact personal data; environment checked at start-up.
- `packages/db` (Drizzle, PostgreSQL 18 with PostGIS) with the first
  migration, and `packages/contracts` for the API's schemas and routes.
- Local database with Docker Compose; API container image built in CI; CI
  runs integration tests against PostgreSQL with PostGIS.
- The app (`apps/mobile`, Expo SDK 58 with Expo Router) for iOS, Android and
  the web: welcome screen with a language switch and a "coming soon" page;
  opens in the device's language if Icelandic or English.
- `packages/i18n`: Icelandic and English texts in ICU MessageFormat with
  typed keys, a test that both languages have the same keys and arguments,
  money formatting ("2.500 kr." and "2,500 ISK") and country names.
- CI bundles the app for iOS, Android and the web and runs browser tests at
  phone and desktop sizes.
- Phone sign-in in the API (spec 1, ADR 0016): send and check a 6-digit code,
  sign up or sign in, rotating refresh tokens with reuse detection, sign out
  on one or all devices, my account and profile, legal documents and their
  acceptance with the age confirmation. Codes, numbers in sign-in tables and
  tokens are stored only as hashes; limits per number, IP address and
  country calling code.
- Sign-in screens in the app (spec 1): phone number with a country picker,
  code with a resend timer and clear errors, terms and age, create and edit
  a profile, my profile, and settings with language, legal documents, sign
  out and sign out on all devices. The session stays signed in: refresh
  token in the phone's secure storage, or an HTTP-only cookie on the web.
- Browser journeys against the API with a test database: sign up in English
  and in Icelandic, stay signed in after a reload, sign out on all devices.
- README: how to run the API and the app locally on Windows and macOS, and
  on a phone with Expo Go.
- Domain rules for phone numbers, codes, sending limits, token rotation,
  profile fields and the legal gate (rules R1.1 to R1.7).
- `packages/api-client`: a typed client for the API, checked against the
  contracts. A development SMS sender prints codes in the API terminal.
- Draft Terms, Community Rules and Privacy Policy for development
  (`pnpm --filter @shareride/db seed`).

- Milestone 2 plan (hosted and connected) and ADRs 0018 to 0022: Render in
  Frankfurt, 46elks for SMS, Sentry's EU region, MapTiler and Hetzner Object
  Storage in Helsinki.
- Real SMS for sign-in codes through 46elks, a daily cap on codes per
  country, and an `SMS_PAUSED` kill switch.
- Hourly clean-up of sign-in records past their retention: expired codes,
  rate-limit events, expired tokens, idle and ended sessions.
- Staging on Render in Frankfurt (`infra/render/render.yaml`): the API image
  serves the web app on its own origin with a content security policy,
  deploys after CI passes, migrates before it starts and finds client
  addresses behind Render's two proxies (`TRUST_PROXY=2`). CI smoke-tests
  the image. Runbook in `docs/operations/staging.md`.
- Error reports from the API and the clean-up job to Sentry's EU region,
  named by commit, with phone numbers, codes, tokens, emails, kennitölur,
  bodies, cookies, addresses and failed queries' values removed (shared
  `redactDeep` rule in the domain package), and
  `pnpm --filter @shareride/api sentry:check` to test a deployment. Logs
  also drop failed queries' values, and a request whose JSON does not parse
  gets 400 instead of 500.
- Sign-in codes by SMS through Vonage's EU endpoint (ADR 0023), with 46elks
  kept as the fallback (`SMS_PROVIDER`).
- Error reports from the app (web and phones) to Sentry's EU region with the
  same scrubbing rule, now shared from the domain package; a "Something went
  wrong" screen with a retry when a screen breaks; the web app's source maps
  uploaded to Sentry from the image build and never served.
- Milestone 3 plan (offer and find rides): sample meeting points and place
  search, cars, posting a trip, search with partial routes and trip details,
  before milestone 2's remaining PRs.
- Meeting points and place search (milestone 3, PR 2): the
  `meeting_points`, `places` and `legs` tables; 25 sample meeting points on
  the three launch corridors with 33 towns and landmarks, seeded on local
  and staging with distances from a sample road graph; the search rule that
  ignores accents, reads Icelandic letters typed in ASCII and allows small
  typos; `GET /v1/meeting-points`, `/v1/meeting-points/{id}`,
  `/v1/places/search` and `/v1/places/{id}/nearest-meeting-points`; in the
  app, meeting points by region, their details with "Open in maps", the
  place search used later by trips, and a place's nearest meeting points.
  Tags and cards from spec 15.
- Cars and the ready-to-drive list (milestone 3, PR 3): the `vehicles`
  table and the licence declaration date; `GET /v1/me/driver-readiness`,
  `PUT /v1/me/driver-licence-declaration` and `/v1/me/vehicles` to list,
  add, edit and remove cars, with the plate rules in the domain. In the app,
  "Offer a ride" on my profile leads to Before you publish, which lists what
  is missing and lets the driver add a car (make suggestions, colours, the
  plate now or later) and confirm their licence. Removing a car deletes it
  with its plate; number plates are hidden in logs and error reports.
- Route quotes and prices (milestone 3, PR 4): the price rules P2 to P4
  with the worked example as a test, the meeting points on the way, where
  an added stop goes, the route and time checks and planned times, all in
  the domain with property tests. `GET /v1/routes/stops-along` and
  `POST /v1/routes/quote` give a driver the stops, distances, typical times,
  prices per stretch, the highest price level and what to fix.
- Posting a trip, the server side (milestone 3, PR 5a): drafts saved as
  the driver goes and started from their previous trip, publishing that
  checks every rule of spec 3 again and lists what to fix, no overlapping
  trips, the hourly clean-up of old drafts, and sample trips on local and
  staging. A car on a trip that has not ended cannot be removed; one that
  published trips used is kept for them.
- Posting a trip in the app (milestone 3, PR 5b): the five steps of spec 3
  (route with the stops on the way, date and times, price level, seats and
  preferences, check and publish), the published screen and "My trips",
  with spec 15's switch, radio card, stepper, price level and calendar.
  Dates, weekdays and numbers in Icelandic no longer depend on the
  device's calendar data.
- ADR 0025 (accepted): our own date and number formatting in
  `packages/i18n` instead of Intl's locale data, which some browsers and
  phones lack. Spec 3 now says a draft keeps a paused stop (decision 9).
- Search on the server (milestone 3, PR 6a): `GET /v1/trips/search` finds
  trips that pass through both places in order and answers the passenger's
  part, with its price, the seats free on every stretch and how far a
  nearby meeting point is; filters for instant booking and time of day,
  sorting by departure or price. `GET /v1/trips/search/alternatives`
  counts trips on the days around the date and finds trips from meeting
  points within 20 km. Anyone can search, without an account; searches are
  limited per network address.
- Search in the app (milestone 3, PR 6b): "Browse trips" and "Find a
  ride" open a search form with from, to, any day or a day, seats and the
  last five searches on the device, which the person can clear. Results
  show the passenger's part, times, price, booking mode, driver and seats
  left, grouped by day, with sorting by time or price and filters for
  instant booking and time of day. When nothing matches: other days with
  trips, trips from nearby meeting points, or "No trips yet on this route"
  with "Offer a ride".
- Trip details on the server (milestone 3, PR 7a): `GET /v1/trips/{id}`
  opens a published trip for any part of it, with that part's price, the
  seats free on it and whether it can be booked, the driver's first name,
  the car's make, model and colour, preferences and note. Trip pages are
  sent with `X-Robots-Tag: noindex`, and a finished trip's page stays open
  by link until a week after its last stop (Q17, agreed by Martin).
- Trip details in the app (milestone 3, PR 7b): a search result opens the
  trip for that part, with its times, the seat view (the car from above
  with the driver, taken, your and free seats), seats and price, the route
  with every stop, where the passenger can get in or out instead, the
  driver, the car, preferences and note. Share sends the trip's web
  address for the part, which opens the same part without an account; the
  page asks search engines not to index it. "Share the trip" and "See the
  trip page" after publishing. Booking comes next (spec 5).
- Our own map of Iceland (milestone 3, PR 8a; ADR 0024 replaces MapTiler):
  the coastline, glaciers, main roads and the Ring Road from Natural Earth's
  public-domain data, made into a small data file by
  `apps/mobile/scripts/build-iceland-map.ts` and drawn with
  `react-native-svg`. No account, key or map provider, and it works the same
  on the web and in Expo Go. Meeting points are dots on it: a tap shows the
  points at that spot, and a second tap on a lone point opens it. Wide
  screens show the map beside the list; phones switch between them. A
  point's details show it on the map next to "Open in maps".
- Routes on our map (milestone 3, PR 8b): trip details show the trip along
  the drawn roads, the passenger's part solid and the rest dashed, in the
  part of Iceland the trip needs; the route step of posting a trip shows
  the driver's route through the stops they keep.
- Booking rules (milestone 4, PR 2): the booking lifecycle and which
  statuses hold seats, request and payment deadlines, and the check a
  booking passes before it is stored (rule S4, the price last shown, no
  overlapping bookings, a request's message), with a property test that
  seats never exceed the car's.
- Booking on the server (milestone 4, PR 3): book an instant trip or request
  seats on an approval trip, safe to retry and with exactly one winner for
  the last seat; the driver accepts or declines, the passenger withdraws;
  requests past their deadline free their seats; my bookings, a booking for
  its passenger or driver, and the driver's requests and bookings on a trip.
  The number plate and where to stand show only once a booking is confirmed.
- Paying with a test provider (milestone 4, PR 4): an accepted booking starts
  a payment, and the outcome confirms it once within the 30-minute window; a
  late success is refunded (asked again every minute until the provider has
  taken it) and a failure can be tried again. Local and staging only
  (`PAYMENT_PROVIDER`, refused in production); no money moves.
  The API stores expired requests and unpaid bookings every minute, and
  `pnpm --filter @shareride/api expire-bookings` does it once.
- Booking and paying in the app (milestone 4, PR 5): trip details' "Book" or
  "Send request" opens the booking screen (spec 5, 3.1) with the part, seats,
  total, driver and car with luggage first, and the message for requests,
  checked for length and contact details as you type. Seats just taken and a
  changed price are explained, with a way back or the new total. The booking
  screen shows a request waiting for the driver, a booking to pay by its
  deadline (the test sheet, where no money moves), and a confirmed seat with
  the number plate, where to stand and "Open in maps". Someone without an
  account signs up on the way and comes back to the same part and seats.
- My bookings (milestone 4, PR 6): from the profile, upcoming and past
  bookings with their date, part, status, driver, car, seats and price. A
  request can be withdrawn after a second press, and never counts against
  the passenger. Declined, expired and withdrawn bookings offer "Search
  again" with the same route, seats and day. In the API an expired booking
  keeps the deadline that passed, so the app can say which ran out, and a
  booking says whether it was withdrawn.
- Requests for drivers (milestone 4, PR 7): "My trips" counts the requests
  waiting on each published trip and opens the driver's trip page. There
  each request shows who asks (first name, member since, "No reviews yet"),
  where they get in and out, seats, price, message and time left, with the
  seats on each stretch without and with it; "Accept", or "Decline" with an
  optional reason only the operator sees. Below come the passengers by
  where they get in and out, and the seats held on each stretch.
- iPhone builds in Expo's cloud for TestFlight, pointed at staging
  (`apps/mobile/eas.json`, app ID `is.shareride.app.preview`), and the app
  builds runbook with the first build from a Windows PC.
- A front page for people without an account: a route search on top, the
  rides leaving soonest (each for its whole route, opening its trip page),
  "See all rides" when there are more than five, "Offer a ride", which goes
  through sign-up straight to Ready to drive, and a small "Sign in". It
  replaces "Continue with phone" and "Browse trips". In the API,
  `GET /v1/trips/soonest` lists the rides leaving soonest, counted against
  the search limit.
- Choosing From or To no longer opens a screen of its own: on the front
  page, the search form and the route step of posting a trip, the field
  turns into a text box and the places found drop down under it. On the
  route step a town lists its nearest meeting points in the same list.
- Chat and notification rules (milestone 5, PR 2): when a booking's
  conversation opens and closes, the checks for a message (1 to 1 000
  characters, or a quick message such as "I'm running 10 minutes late"),
  who is told about each event and on which channels, the SMS window and
  daily limit, and when reminders and the other timed notifications come.
  Quick messages and the conversation's first line are in Icelandic and
  English.
- Conversations on the server (milestone 5, PR 3): a booking's conversation
  opens as it is confirmed (paid, or free), with the line "Booking
  confirmed. You can message each other here.", and is read-only 7 days
  after the trip. `GET /v1/me/conversations` lists them with unread counts,
  and `/v1/bookings/{id}/messages` reads a page of 50, sends a text or quick
  message (a retry with the same client ID is stored once, and 10 a minute
  at most) and marks messages read. A driver sends one message to every
  confirmed passenger with `POST /v1/trips/{id}/messages`, each in their own
  conversation. Only the two people can read a conversation; the hourly
  clean-up deletes it 12 months after the trip. Bookings confirmed before
  this update get their conversation when it is deployed.
- Chat in the app (milestone 5, PR 4): "Message {name}" on a confirmed
  booking, and "Message" by each confirmed passenger and "Message all
  passengers" on the driver's trip page. A conversation shows the safety tip,
  the message sent with the request, the messages with their times and
  "Seen", and quick messages ("I'm running late" asks how many minutes); it
  fetches new messages every 5 seconds while open, and can only be read once
  closed. A message that could not be sent stays as "Not sent. Tap to try
  again." and is sent once however often it is tried. `/messages` lists the
  conversations with unread counts; the Messages tab comes with the new tab
  bar.
- Notifications, first part (milestone 5, PR 5): booking, payment and chat
  changes write their event in the same transaction, and a worker inside the
  API (every 5 seconds, `WORKER=off` to stop it) turns each into one
  notification per person, with a delivery per channel that says what came
  of it: sent, failed after an hour of retries, or skipped with the reason.
  It reminds a driver of a request halfway to its deadline and a passenger 10
  minutes before the payment deadline, unless answered or paid, and a retry
  never sends a request or payment notification after the booking has moved
  on. One event that cannot be handled never holds back the rest. Texts are
  in the person's language. Push and email are connected in the next two
  updates; until then nothing is sent. The hourly clean-up deletes the
  notification log after 90 days.
- Push notifications (milestone 5, PR 6, ADR 0026 accepted): on Android
  and iPhone builds, once notifications are allowed, the app registers the
  phone with `PUT /v1/me/sessions/current/push-token`, and again when its
  token changes. Pushes go through Expo's push service; a tap opens the
  booking, trip or conversation, from a closed app too, and a push about the
  conversation on screen fetches it instead of showing a banner. A phone's
  token goes when its session ends (signing out, signed out from another
  device, or idle) or when Expo reports it dead, and belongs to one person
  at a time. A push whose answer was lost after it may have gone out is
  never sent again. `EXPO_ACCESS_TOKEN` is used when set. The Android test
  build (`preview-apk`) and its Firebase set-up are in the app builds
  runbook.
- Messages in the menu (milestone 5, spec 7, 3.1, item 9): a fifth place,
  between Offer and Profile, opens my conversations. Its badge counts the
  messages not yet read, up to "9+", on the phone's tab bar and the wide
  screens' top bar, and screen readers hear it with the name ("Messages, 3
  unread"). The count is fetched once signed in, when the app comes to the
  front, when a push arrives, after a conversation is read and, on the web,
  every minute while the page is on show. Signed out, Messages asks to sign
  in.
- Email (milestone 5, PR 7a, ADR 0027): news about a booking goes by email
  to someone with a verified address (the most important always, the rest
  only without a push device), in their language, in plain text and simple
  HTML with a link to the screen it is about, and no tracking. Someone
  without push who leaves a chat message unread for 15 minutes gets "You
  have unread messages about your trip on {date}", never the text, at most
  once an hour per conversation. Mailjet sends it when
  `EMAIL_PROVIDER=mailjet`; locally the API prints each email in its
  terminal, and staging sends none until there is a domain. An email whose
  answer was lost after it may have gone out is never sent again.
- Adding an email (milestone 5, PR 7b): "Your account" in Settings shows the
  phone number and the email, with "Add an email" or "Change your email".
  A link goes to the address, valid once for 24 hours and only the newest,
  at most one a minute and five a day (refused sends count, and are logged);
  the address becomes the account's when the link is opened in a browser,
  signed in or not. The email in use stays until a new one is confirmed,
  asking for it again gives up the change, and an address another account
  has is refused. Links are stored only as hashes and deleted after a day.
  Waits over an hour are shown in hours. The browser tests' API writes its
  emails to a file and runs the notification worker, so a journey can open
  a link and see the "Pay now" email.
- Trip reminders (milestone 5, PR 8a, spec 7, 3.5): a passenger hears at
  18:00 the evening before and an hour before boarding ("Tomorrow at 05:30 ·
  Meeting point: Hlemmur", with the driver and the car); tapping it opens
  the meeting point page, and the evening one comes by email to someone
  without push, with a "Directions" link. The driver gets one reminder for
  the trip, listing who gets in and out where, and "Add your number plate"
  while it is missing. A reminder is skipped if its moment passed before
  the booking was confirmed, and dropped if the booking ended, nobody is
  booked, or it comes too late (the evening one after midnight, any after
  the trip left), also when a failed send is tried again. Settings gains "Notifications" with a Trip reminders switch,
  saved to the account (`GET` and `PATCH /v1/me/notification-settings`);
  the rest of the news stays on, and Settings says so. Quick taps on the
  switch are saved one after the other, so the last one is kept.
- The prompt to turn on notifications or add an email (milestone 5, PR 8b,
  spec 7, 3.6.2): after posting a trip, someone with no verified email and
  no signed-in phone that gets push is asked "Turn on notifications" (the
  phone's own question, then the phone is registered) or "Add an email"; on
  the web, or once the phone was told no, only "Add an email". "Not now"
  closes it, and each occasion is asked until answered. `GET /v1/me` gains
  `pushOn`.
- The same prompt after booking (milestone 5, PR 8c): on the booking finish
  screen, under "You're booked!" or "Request sent"; on the booking once a
  request is accepted, while it waits for payment and once confirmed; and on
  an instant booking paid on its own page, as after leaving Check and pay.
- Change and cancellation rules in the domain (milestone 6, PR 2, spec 6):
  `cancellationTerms` gives a cancellation's refund and whether it counts
  on reliability (M2, R6.3, R6.7, R6.8), with the reasons for a trip, one
  booking and a passenger; `checkTripChange` checks a change to a published
  trip (departure, seats, price level, car, booking mode, details), with the
  new prices and who is told and may now cancel for free (R6.1 to R6.4,
  S5); and
  `stopsToCopy` gives the stops for posting a trip again or its return.
- The passenger cancels a booking (milestone 6, PR 3, spec 6, 3.5): "Cancel
  booking" on an accepted or confirmed booking, until the time to get in,
  opens its own screen with the
  refund first ("Full refund of 2,900 ISK", or none in the last 15 minutes
  before boarding), the reasons, and for the reason chosen whether it shows
  on the passenger's profile (less than 24 hours before boarding, never for
  the weather or a road closure, or after the driver moved the departure by
  more than 30 minutes). Confirming sends the terms shown; if a time limit
  passed meanwhile, the new terms show to confirm again. The seats are
  freed, a payment is refunded once (also one that settles afterwards, which the
  booking then shows), the
  driver is told by push and email, the conversation says who cancelled and why,
  and the passenger is told by email once the refund is made. Back on the
  booking, the outcome takes focus. `GET /v1/bookings/{id}/cancellation-preview`
  and `POST /v1/bookings/{id}/cancel`; a booking keeps its departure when
  booked, its reason, refund and whether it counts.
- The driver cancels one booking (milestone 6, PR 4a, spec 6, 3.4):
  "Cancel booking" under each passenger on the driver's trip page, until
  the time to get in, opens the same screen in the driver's words, with the
  driver's reasons, the passenger's refund ("Gunna gets a full refund of
  2,900 ISK", or nothing to refund before paying), whether it shows on the
  driver's profile, and an optional note to the passenger. The passenger
  sees the reason and the note on the booking and in the chat, and is told
  by push and email with the reason and the refund, and by SMS within 24
  hours of boarding (at most 5 a day) with the day, time and refund; never
  the note. Back on the trip, "Booking cancelled" takes focus. The SMS
  senders now say when a message may have gone, so it is never sent twice.
- The driver cancels the whole trip (milestone 6, PR 4b, spec 6, 3.3):
  "Cancel trip" at the end of the driver's trip page, until the planned
  departure, opens a screen with the reasons, who is affected ("1 passenger
  gets a full refund and will be told now", and those who asked or haven't
  paid yet), whether it shows on the driver's profile, and an optional note
  to everyone on it. Every booking is cancelled with a full refund of what
  was paid, requests are declined, and everyone is told at once by push and
  email, and by SMS within 24 hours of boarding; never the note. Each
  passenger reads "Bára cancelled the trip: Car problem" with the note on
  their booking and in the chat; a declined request says so too. The trip
  page then says it is cancelled, with focus, and offers nothing more, and
  the trip moves to Past in My rides, marked Cancelled. If someone paid or
  left while the screen was open, nothing is cancelled and it shows again.
  `POST /v1/trips/{id}/cancel`; a trip keeps its reason, note and whether
  it counts.
- The driver moves a trip's departure (milestone 6, PR 5a, spec 6, 3.2):
  "Edit trip", before "Cancel trip", opens the trip's parts; "Change the
  time" gives the date and the departure, with every stop moving along.
  "Check the change" names any rule the move breaks (more than 2 hours from
  when a passenger booked, too soon, another trip of the driver's), then
  shows the new times, who is told and who may now cancel with a full
  refund. Saved, passengers read "Departure changed from 10:00 to 10:45" at
  their own stop, on the booking and in the chat, and are told by push and
  email, and by SMS within 24 hours when it moved more than 30 minutes. A
  paid booking moved more than 30 minutes offers "Keep my booking" or
  "Cancel with full refund", with "The trip changed" chosen. Deadlines to
  answer and to pay, and the reminders, move with the trip; a reminder
  already sent is not sent again. `POST /v1/trips/{id}/changes`, with
  `?preview=true` for the check; each change is kept in `trip_changes`.
- The driver changes a published trip's price, seats, how people book, and
  preferences and note (milestone 6, PR 5b, spec 6, 3.2), each from its own
  row on Edit trip. The price shows each stretch's new price and is for new
  bookings only; the seats go no lower than are taken on any stretch, and
  more seats can lower the price level, which the screen says before
  saving; requests waiting for an answer stay open when the booking mode
  changes; the note never holds contact details. Nobody is notified: the
  trip shows the change. Each change is kept in `trip_changes`.
- The driver changes a published trip's car (milestone 6, PR 5c, spec 6,
  3.2) from Edit trip, choosing among their cars, with "Add a car" coming
  back to the list. Each passenger who booked reads "New car: Red Volvo
  XC40" on their booking and in the chat, and is told by push and email,
  never by SMS; a request is not told. Never with the number plate.
  `TripChanged` joins the outbox (migration 0016).
- The driver adds a stop to a published trip (milestone 6, PR 6a, spec 6,
  3.2) from Edit trip's stops row. The server places it where it is least
  out of the way, at a time between the stops either side, which keep
  theirs; the check shows where and when, the two new stretches' prices
  for new bookings, and who is told, or why the stop does not fit.
  Bookings over the split stretch keep their stops and totals. Each
  passenger who booked reads "New stop: Mosfellsbær at 09:20" on their
  booking and in the chat, and is told by push and email; search finds the
  trip from the new stop. A booking sends the meeting points it shows, so
  a part chosen before a stop was added is refused (`stops_changed`)
  rather than booked on other stops. Migration 0017 adds `addStop` to the
  trip change kinds.
- The driver removes a stop from a published trip (milestone 6, PR 6b,
  spec 6, 3.2) from Edit trip's stops row, choosing among the stops
  between the ends. A stop where a booking or request gets in or out
  cannot go until they end (R6.5), nor one whose way past needs more time
  than its neighbours leave (R3.6); the stops either side keep their
  times. The two stretches join, and bookings over both keep their stops
  and totals. Each passenger who booked reads "Stop removed: Borgarnes" on
  their booking and in the chat, and is told by push and email; search no
  longer finds the trip from that stop. Migration 0018 keeps a removed
  stop, marked with `removed_at`, for the bookings that still name it, and
  adds `removeStop` to the trip change kinds.
- Post again and post the return (milestone 6, PR 7, spec 6, 3.6) from the
  driver's trip page, also once it has left or been cancelled. Each makes
  a draft with the trip's stops, reversed for the return, car, seats,
  price level, booking mode, preferences and note, and opens it at the
  date and times. Stops the driver removed are left out, and so are
  meeting points no longer in use, which the next step names.
  `POST /v1/trips/{id}/copy?reverse=`.
- Trip day, dispute, review and reliability rules in the domain (milestone 7,
  PR 2, spec 8): when a trip departs and completes, when its pages become
  the trip day, the windows for "I'm here", a no-show and "The driver didn't
  come", the time to answer a report and what each outcome does to the
  booking, the refund, the payout and reliability; reviews on completed
  bookings, hidden until both sides have written theirs; the rating from
  revealed reviews only; and the reliability figure over 12 months, shown
  once 5 count, with the cancellations the operator can overrule. The
  booking lifecycle gains a driver absence before completion and the
  operator's two outcomes for a contested no-show.
- Safety rules in the domain (milestone 9, PR 2, spec 9): blocks in either
  direction and the trips they close, also to a blocked passenger booked on
  them (R9.4); `checkReport` with whom a report is about, the 24 hours to
  report a booking problem and the 1 000-character description (R9.1);
  urgent safety reports, the 24-hour response target, the queue's order and
  the payout a booking problem holds (R9.3, R9.9); the operator's alert by
  push, and SMS from 07:00 to 23:00; what a suspended person cannot do and
  what a suspension cancels (R9.10); statements of reasons and appeals
  within 14 days (R9.5); the operator's trip cancellation; and whether a
  trip leaves the capital area.
- Safety on the trip (milestone 9, PR 3, spec 9, 3.3): "Emergency: 112"
  opens the dialler; "Before you go" links to vedur.is, umferdin.is and
  safetravel.is, in the reader's language where the site has it, on a trip
  that leaves the capital area; "Share trip details" sends a confirmed
  booking's date, time, route, meeting point, driver and car with its
  plate, or the driver's date, time and route, through the share sheet, or
  copies it in a browser without one, or else shows it to copy. Nothing is stored (R9.8). On trip
  details, the booking page and the driver's trip page.
- Block and unblock (milestone 9, PR 4, spec 9, 3.2; R9.4): "Block" in a
  conversation asks first and blocks silently, then lists the bookings and
  requests the two still have together, each with the usual way out:
  cancel under the normal rules, withdraw or decline. Neither then finds
  the other's trips in search, rides leaving soon or "nothing matches",
  nor opens or books them, not even another part of a trip already booked.
  A trip the other person is only booked on stays open: who is booked is
  private, and closing it would let a block reveal their rides (milestone
  9 decision 2, revised on review; `tripClosedTo` counts only the driver
  now, `bookingClosedTo` is new). Their chats become read-only for both;
  only the blocker's says who blocked whom (`blockedByMe`), and the
  driver's message to all passengers skips them. Settings has a Safety
  section with Blocked people and Unblock. No user ID is shown to another
  person: blocking goes through a booking, unblocking through the block's
  own ID. A conversation coming back into view fetches at once, and so
  does each booking on the block screen. With no one to message, the
  driver's message to all passengers says that no passenger is confirmed
  or their chat is closed. `blocks` is in the personal data catalogue,
  erased with either account, and gets its own export section, People you
  blocked: each by first name, and since when, never who blocked them.
  Migration `0033_blocks`. `POST /v1/bookings/{id}/block`,
  `GET /v1/me/blocks`, `DELETE /v1/me/blocks/{id}`.
- Reports (milestone 9, PR 5a, spec 9, 3.1; R9.1, R9.2): "Report this
  trip" on trip details (not to its driver, whatever the trip's state:
  trip details gain `drivenByMe`); "Report {name}" in a conversation, on
  a request and by each passenger on the driver's trip page; a message
  pressed and held, a screen reader's action, or on the web a right click
  or the keyboard's menu key; and "Report a problem with this trip" on a
  booking that ran or is to run, until 24 hours after the trip
  (`problemReportable`, from the domain's `bookingProblemReportable`; a
  request has none). The report screen names the person from the booking
  the two share, never from its address; puts "Emergency: 112" first for
  a safety report, read out at once; takes an optional description of up
  to 1 000 characters; sends nothing until "Send report"; thanks; and
  offers to block the person too. A report about a person says it doesn't
  let us read the conversation (Q22). Settings, under Safety, has My
  reports with each report's outcome in general terms. Someone else's
  trip, message or booking that the person cannot see is refused as not
  found; a person cannot report themselves; 10 reports a day, also when
  sent at once. The person reported is never told who reported them.
  Migration `0035_reports`; `reports` is in the personal data catalogue,
  kept 3 years after closing, and chat clean-up keeps a conversation a
  report covers that long. "Download my data" has Reports you sent, never
  a report about the person. The category and outcome texts moved to
  `packages/i18n` (`reportCategoryText`, `reportOutcomeText`) for the app
  and the export. Blocking and reporting take a lighter row lock, so two
  people reporting or blocking each other at once cannot deadlock.
  `POST /v1/reports`, `GET /v1/me/reports`.
- The operator's alert for a new report (milestone 9, PR 5b, spec 9,
  R9.9): every active operator gets `report_filed` by push, or
  `report_filed_urgent` for a safety report, by push and also by SMS from
  07:00 to 23:00 Reykjavik time, push only at night (the domain's
  `alertChannels`, checked again on each try, so a retry never sends one
  after 23:00). Alerts have no daily SMS limit and don't count towards an
  operator's own one as a passenger (spec 7, R7.10). The alert says only
  "New report" or "New safety report", never who or what, and one not yet
  sent is dropped once its report is closed or the operator loses the
  role. A new outbox event `ReportFiled`; notifications gain `report_id`,
  in migration `0035_reports`.
- Suspension, warnings and reinstating (milestone 9, PR 6a, spec 9, 3.4.3
  and 3.6; R9.5, R9.7, R9.10): the operator's `suspend`, `warn` and
  `reinstate` in `apps/api/src/modules/moderation/`, for the console to
  call. A suspension has a rule, a reason written for the person and an
  end, or none; it cancels at once the person's upcoming trips and every
  booking or request they have not boarded, as ShareRide, with full
  refunds of what was paid and nothing on anyone's reliability. The
  others read only that ShareRide cancelled ("ShareRide cancelled the
  trip", "Cancelled by ShareRide: Jón", and a line in the chat), never
  why. A trip under way carries on, but takes nobody new: it leaves search,
  booking it is refused (`trip_not_bookable`), and its driver cannot
  accept a request, only decline it. While suspended, searching, booking,
  requesting, publishing, changing a trip, accepting a request, sending
  messages and reviewing answer 403 `account_suspended` with
  `suspendedUntil`; the person stays signed in to read, download or delete
  their data. Every minute the API ends the suspensions whose end has
  passed. Each action writes one audit entry
  (IDs and the names of the fields changed only) and sends the person
  their notice: the push says what happened, the email adds the rule,
  the reason and until when it can be appealed in the app (14 days).
  Two suspensions at once lock their trips in the same order, so they
  never deadlock. Migration `0036_moderation` adds `moderation_actions`,
  `users.suspended_until`, `trips.cancelled_by` (earlier cancellations
  are the driver's; empty from the version before, which only drivers
  used) and `notifications.moderation_action_id`; "Download my data" has
  Notices from ShareRide, the suspension's end, and who cancelled each
  trip.
- Notices, appeals and closing reports (milestone 9, PR 6b, spec 9, 3.1.6
  and 3.4.4; R9.5): `GET /v1/me/notices` lists what ShareRide did about
  the person and why, the latest first, never which operator; `POST
  /v1/me/notices/{id}/appeal` takes one appeal of up to 1 000 characters
  within 14 days, also while suspended (409 `not_appealable` for a
  reinstatement, `already_appealed`, `appeal_window_closed`). For the
  console, the operator's `answerAppeal` answers once and finally;
  reversing the suspension the person is under lifts it, while what it
  cancelled stays cancelled. `closeReport` closes a report with its
  outcome. The person hears "ShareRide answered your appeal" by push and
  email (the email with the answer), and the reporter "Your report" with
  the outcome in general terms, by push. Each writes one audit entry.
  Migration `0038_appeals` widens the notification and event kinds.
- Notices and the suspended account in the app (milestone 9, PR 6c, spec
  9, 3.4.4 and 3.6.2): Profile has Notices, where a notice's push and
  email lead: what ShareRide did and why, the rule, what it concerned,
  and one appeal of up to 1 000 characters within 14 days, then
  ShareRide's answer. A suspended person sees, in place of Find and
  Offer, until when and why, what is closed and what stays open, with
  "Read why and appeal" and My rides; booking a seat and a new trip are
  closed too, and a conversation stays readable with a line saying why
  nothing can be sent. The app reads the account again when it comes back
  into view and when an action is refused as suspended, and a suspension
  whose end has passed is over at once. Tapping the push of a notice opens
  Notices, and that of a report's outcome My reports. `GET /v1/me` gains
  `suspension` (its end, or null when not suspended). The browser tests'
  API can suspend a person (`POST /e2e/suspend`), as the console will. In
  Icelandic, Notices are "Orðsendingar frá ShareRide", apart from
  Messages ("Skilaboð").
- Hidden content and ShareRide's trip cancel (milestone 9, PR 6d, spec 9,
  3.4.3): for the console, the operator's `hideContent` hides a message,
  a review, a trip's note or About you, and `cancelTrip` cancels an upcoming trip
  with full refunds, on the driver's reliability only when the operator
  says so. A hidden message reads "Removed by ShareRide" to both people
  (in every conversation a message to all passengers went to), the app
  offers no Report on it, and it sends no push if it had not gone yet; a
  hidden note is not shown to passengers, nor copied by "Post again",
  until the driver writes a different one, and About you likewise, also
  on the public profile; a hidden review no longer shows to the person it
  is about. The
  person gets the notice with what it concerned, also in the email and in
  "Download my data"; the passengers of a cancelled trip only that
  ShareRide cancelled it. Reversing a hiding on appeal shows the
  content again. Each writes one audit entry. Migration
  `0041_hidden_content` adds `messages.hidden_at`,
  `trips.note_hidden_at` and `users.about_hidden_at`, which "Download my
  data" includes.
- The console's reports API (milestone 9, PR 7a, spec 9, 3.4 to 3.6):
  `/admin/v1/reports` lists open reports, safety first, then the oldest,
  each due 24 hours after it was filed, or the last 50 closed; a report's
  page has its records, both people's other reports, recent trips and
  actions, and the actions taken under it. It names the reported message
  without its words: `/admin/v1/reports/{id}/conversation` opens the
  conversation only for a message report, each opening logged (R9.6), with
  a message ShareRide removed marked `removed` (for disputes too). The
  operator closes a report, warns, suspends or reinstates a person, hides
  content and cancels a trip as ShareRide, each with the rule and the
  reason the person reads; `/admin/v1/appeals` lists open and answered
  appeals, and the answer is final. Only operators reach any of it.
- The console's Reports and Appeals pages (milestone 9, PR 7b, spec 9,
  3.4): the open reports, safety first, each with when it is due and an
  Overdue tag, and the last ones closed; a report's page with its records,
  both people and their history, the conversation only when asked, the
  actions (Reinstate too, for a suspended person) with the notice shown as
  the person reads it, in their language, before it is sent, and closing
  it, asked once more. Appeals lists those
  waiting with the action and its report, and the answer asks once more as
  it is final. A browser journey closes one report and suspends from
  another.
- Ratings, reliability and reviews in the console (milestone 9, PR 9c,
  spec 9, 3.4.2 and 3.5.2): a person's page shows their rating and
  reliability figure as their profile counts them, with the counts by
  role and whether the figure is below the watch level, and the 20 latest
  reviews about them and by them: every one, with its words, and whether
  it shows yet, ShareRide hid it or its author is deleting their account,
  each linking to the other person's page. Each side of a report shows the rating and the figure
  too, but none for the former member. Profiles and the console count
  them with the same code (`figuresOf`).
- Report and Block on a profile (milestone 9, PR 9b, spec 9, 3.1.1, 3.2.1
  and 3.3.4): someone else's profile offers Report and Block, each asking
  first on its own screen, and the community rules. Each review I did not
  write offers Report review, read out with its author and month, also on
  my own profile, so a review about me can be reported; a profile's
  reviews now say which are mine (`mine`). Blocking from a profile lists
  the bookings still shared, as from a conversation, and goes back to the
  profile; a person who left meanwhile is said to be gone. The console's report page shows a reported
  review's stars, words, author and date, and offers Hide the review while
  it is shown.
- Reporting and blocking from a profile, API (milestone 9, PR 9a, spec 9,
  3.1.1 and 3.2.1): a report can be about a review a profile shows, by
  anyone who reads it, linked to the review (migration
  `0047_review_reports`), or about the person a profile shows, filed as a
  report about a person with no booking. A review not shown yet, hidden,
  or by or about someone leaving ShareRide cannot be reported; a review by
  the former member can.
  `POST /v1/people/{profileId}/block` blocks the person a profile shows,
  as blocking from a booking does. The console's report page shows the
  review reported, with its words and whether it is hidden.
- The console's Users and Trips pages (milestone 9, PR 8b, spec 9, 3.5 and
  3.4.5): find a person by first name, phone number, email or ID without
  it entering the address, and each driver's request decline rate with the
  reasons; a person's page with their account, cars, trips, bookings,
  reports, actions and notes, where the operator warns, suspends or
  reinstates them and adds a note; the trips from today on, found by day,
  stop or ID, and a trip's page with every booking and request and why
  one was declined. A report's page links to each person's page. A
  browser journey finds a person, adds a note and reinstates them.
- The console's users and trips API (milestone 9, PR 8a, spec 9, 3.5 and
  3.4.5): find people by first name, phone number, email or ID, and trips
  by day, place, driver or a trip's or booking's ID; a person's page with
  their profile, cars, trips, bookings, reports, actions, notes and decline
  rate; a trip's page with every booking and request, and why a request
  was declined. Searching for a person is a POST, so a phone number or an
  email never sits in an address. Operators add notes about a person
  (migration `0045_operator_notes`), each in the audit log without its
  words; the person gets them in Download my data, never who wrote them
  (Martin's answer A49). Erasing the person erases the notes about them;
  erasing an operator keeps the notes they wrote, by the former member.
  Each driver's decline rate over 90 days, the highest first, so a pattern
  that could be discrimination can be looked at.
- Trips depart and complete on their own (milestone 7, PR 3, spec 8,
  R8.1 and R8.2): every minute the API departs a trip at its first stop's
  planned time and completes it 2 hours after its last, with its
  confirmed bookings, which then hold no seats. Migration
  `0019_trip_completion` adds `completed_at` to trips and bookings. The
  driver's trips keep a trip under way as upcoming until its last stop,
  and a past trip still shows the seats its passengers took. The chat
  stays on both sides after the ride, and "Message all" still reaches
  passengers whose bookings completed; "Where to stand" goes once the
  ride completed.
- A trip under way can still be booked at a later stop until that stop's
  cut-off (rule S4; Martin's answer A45 to Q21): search finds it, and the
  trip page offers it, as before trips departed on their own.
- "I'm here" in the API (milestone 7, PR 4a, spec 8, 3.2 and R8.3):
  `POST /v1/bookings/{id}/check-in` for the passenger at their boarding
  stop, and `POST /v1/trips/{id}/stops/{stopId}/check-in` for the driver at
  a stop of their trip, from 30 minutes before the stop's planned time to
  60 minutes after. It stores who said it and when, never where they are.
  The other side at that stop gets a push ("At the meeting point: Anna")
  and a line in the conversation; a repeat answers with the first and
  tells nobody again. A booking that boards, and the driver's trip, now
  give the trip day: its phase, when "I'm here" opens and closes, who has
  said it, and for the driver whether each passenger is at their stop. The
  driver's trip gives each stop's ID. Migration `0023_trip_day_check_ins`
  adds the `check_ins` table, one per booking and one per stop for the
  driver, and the new notification kinds.
- The trip day in the app (milestone 7, PR 4b, spec 8, 3.1 and 3.2): from
  3 hours before boarding, a confirmed booking leads with the time and
  meeting point, where to stand, the driver and car with its plate, then
  one large "I'm here" button and the chat; it says when the driver is at
  the meeting point. The driver's trip page says "Use this only when
  parked." and lists the stops in order with their times, who gets in at
  each with seats and whether they are here, who gets out, and "I'm here"
  at each stop where it is open, after the last one said and where someone
  gets in (`driverCheckInStops` in the domain). Before "I'm here" opens it
  says when it will. Both pages load again every 30 seconds while the trip
  day shows, and when the app comes back to the front. The
  browser tests' API can move one trip's times closer
  (`POST /e2e/trips/{id}/move`), never in the real server, and a journey
  has both sides check in and see each other's.
- Reports on the trip day in the API (milestone 7, PR 5a, spec 8, 3.3 to
  3.5): the driver marks a no-show 10 minutes after the passenger's stop
  time, once they said "I'm here" there, until the trip completes
  (`POST /v1/bookings/{id}/no-show`); the passenger says the driver didn't
  come from the same wait until 24 hours after the trip completes
  (`POST /v1/bookings/{id}/driver-absent`). Each takes a note for the
  operator, and a booking is reported once. The other side is told by push
  and email and answers "That's right" or "That's not right"
  (`POST /v1/disputes/{id}/answer`). An agreed report, or one nobody
  answered in time (the minute job), stands; a contested one waits for the
  operator's decision (`decideDispute`, with an audit entry, both sides
  told), which the operator's command and console will call. A no-show
  frees the seat and gives no refund; a driver absence that stands, or a
  passenger left behind, cancels the booking as if by the driver with the
  new reason "The driver didn't come", a full refund, and counts on the
  driver; a ride found to have happened completes. A booking with an open
  report does not complete with its trip. Bookings show their report
  (never the notes) and when each report opens and closes. Migration
  `0026_trip_day_disputes` adds the `disputes` table and widens the
  cancellation reasons and notification kinds.
- Reports on the trip day in the app (milestone 7, PR 5b, spec 8, screens
  3 to 5): "The driver didn't come" on the passenger's booking, from the
  wait after their time until 24 hours after the trip completes, and "Mark
  as no-show" for each passenger getting in on the driver's trip day, once
  the wait has passed and the driver said "I'm here" there; before that,
  the stop says to say it first. Each opens a screen that says what it does
  and who is told, with a note only ShareRide reads. The other side is asked
  "Is this right?" with the deadline and what not answering does, and
  answers "That's right" or "That's not right" on its own screen, with a
  note. Both sides see where a report stands: waiting for the other side,
  contested and waiting for ShareRide, or decided; the driver's trip page
  lists its reports first. A driver absence that stood says "{name} didn't
  come, so ShareRide cancelled this booking." with the refund. The browser
  tests' trip move also moves its "I'm here" and reports and lets a report
  nobody answered stand, and two journeys cover a no-show nobody contests
  and a driver absence that stands with a full refund.
- The console's dispute routes (milestone 7, PR 5c, spec 8, 3.5): the
  contested reports waiting for the operator (`GET /admin/v1/disputes`) and
  the last ones decided, one report with its notes, answer, planned times
  and "I'm here" times, and the decision, which tells both sides and is
  recorded in the audit log. The booking's conversation opens only for a
  contested report, through one function that checks this and that spec
  9's reports reuse, and each opening goes in the audit log as
  `conversation.opened`, without the text (R9.6). Martin chose this console page over the planned server
  command (decision 1, changed on 2026-11-17); the page follows in 5d.
- The console's Disputes page (milestone 7, PR 5d, spec 8, 3.5), at
  `/admin/disputes`: the reports waiting for a decision and the last ones
  decided; each report with what each side said, every stop's planned and
  "I'm here" times, and the passenger's "I'm here"; the decision, with
  what each outcome does and the operator's reasons, asked once more
  before it is made; and the booking's conversation, opened only when
  asked. In the app, a passenger whose no-show ShareRide finds was the
  driver leaving without them reads "{driver} left without you, so
  ShareRide cancelled this booking." instead of "didn't come".
- Ratings and reviews in the API (milestone 7, PR 6a, spec 8, 3.7): once a
  booking completes, the passenger rates the driver and the driver rates
  the passenger, 1 to 5 stars and an optional comment of up to 500
  characters without phone numbers, email addresses or links
  (`POST /v1/bookings/{id}/review`), once each and within 14 days. Nothing
  is written about someone who has left ShareRide or is leaving, and
  nothing while the passenger's report that the driver didn't come is
  open. A review shows once both have reviewed, or 14 days after
  completion (the minute job), and the person it is about is told by push.
  "How was your trip?" goes by push to each passenger and once to the
  driver when the trip completes, and once more 3 days later to those who
  have not reviewed, following the trip reminders switch. A driver
  absence that stands, or a passenger found absent, removes the booking's
  reviews. Bookings show their reviews: until when, your own, and the
  other's once it shows (never one the operator hid). Migration
  `0030_reviews` adds the `reviews` table, with `hidden_at` for
  moderation (spec 9), and widens the notification kinds.
- Rating and reviewing in the app (milestone 7, PR 6b, spec 8, screen 6):
  "Rate the driver" on a completed booking and "Rate your passenger" under
  each passenger of the driver's completed trip, with until when; while a
  report on the booking is open, or once the other person has left, it says
  why instead. Stars take the design system's rating colour (a new `rating`
  token) and show the number next to them. The rate
  screen takes 1 to 5 stars and an optional comment, checked as it is typed
  (500 characters, no phone numbers, emails or links), and says the review
  appears once the other person has reviewed too or after 14 days, or that
  both show now. The booking and the trip then show the review sent and,
  once it shows, the other's review. A browser journey: both review and
  each sees the other's.
- Public profiles in the API (milestone 7, PR 7a, spec 1, 3.5, and spec 8,
  3.7 and 3.8): `GET /v1/people/{profileId}` gives anyone signed in a
  person's first name, about, languages, badges, the month they joined,
  colour, rating and reliability figure, never their phone number, email, last name or
  user ID. A profile is reached by its own random reference: migration
  `0039_profile_ids` adds `users.profile_id`. The rating is the average of
  the reviews that show, to one decimal; `GET /v1/people/{profileId}/reviews`
  lists them newest first, 20 at a time, for one role or both, with the
  author's first name ("A former member" once erased) and the month. The
  figure is the share kept of the trips and bookings that count over the
  last 12 months, from 5 that count, with the counts by role. Nobody leaving
  ShareRide has a profile, and what they wrote shows nowhere until they are
  erased.
- Public profiles in the app (milestone 7, PR 7b, spec 8, screen 7): a
  member signed in opens the driver's profile from trip details ("See
  profile"). It shows the first name, about, languages, the month they
  joined and the verified badges; the rating to one decimal ("4.3 (3
  ratings)", or "No ratings yet"); the reliability figure, or "not enough
  trips yet" before 5 count, which opens the counts by role when tapped;
  and the reviews, newest first, each with the stars, the author's first
  name, how they travelled and the month, for both roles or one, with
  "Show more reviews". "See it as others do" now shows the same, from the
  API. `GET /v1/me` gives `profileId`, and trip details gives the driver's
  to members signed in only. The reviews journey ends on the driver's
  profile.
- Ratings and reliability beside people (milestone 7, PR 7c, spec 4, 3.4
  and 3.6; spec 5, 3.3.2): search results and the rides leaving soon show the driver's rating with the
  number of ratings, or "New driver"; trip details show the driver's rating
  to anyone, and their reliability figure to members; a request shows the
  passenger's rating, or "No reviews yet", and figure; a booking shows the
  driver's. Each opens the person's profile for members, and so does each
  passenger on the driver's trip.
  Someone leaving ShareRide, or a former member, shows neither. Search
  results, trip details and bookings give `rating` (and `reliabilityPercent`
  and, on bookings, `profileId`) for these people.
- The console's reliability routes (milestone 7, PR 7d, spec 8, 3.8; R8.10
  and R8.11): the cancellations that do not count only because of a
  weather or road-closure reason, making one count or undoing that, with
  the operator's note and an audit entry, and the people below 80%. Trips
  and bookings save whether their cancellation was excused by its reason,
  and when and why the operator overruled it (migration
  `0043_reliability_overrules`). "Download my data" tells whoever
  cancelled whether it counts and when ShareRide made it count; a booking
  the driver cancelled no longer shows this in the passenger's file. The
  operator's note goes when the account of whoever cancelled is erased.
- The console's Reliability page (milestone 7, PR 7e, spec 8, 3.8): the
  cancellations excused by a weather or road-closure reason, each made to
  count or undone with a note on its card, and the people below 80% with
  their counts by role. Texts in Icelandic and English.
- "Did something go wrong?" after a low rating (milestone 7, PR 6c, spec 8,
  3.7.4): a rating of 1 or 2 on the rate screen, before and after it is
  sent, offers a report: a problem with the trip until 24 hours after it,
  then the person. Texts in Icelandic and English.

- Visual design system (spec 15) with the first screen designs, and ADR 0017
  (accepted): our own parts on React Native primitives, the fonts Fredoka and
  Nunito, `react-native-svg` drawings and Lucide icons.
- The look of spec 15 in the app: its colours in light and dark mode with a
  test of every contrast pair, Fredoka and Nunito loaded at start, chunky
  buttons that fit their label and sink when pressed, a keyboard focus ring
  on the web, and
  restyled fields, tick boxes, chips, notices, links and the back button.
  A browser check saves screenshots of the first screens in CI.
- The app icon and opening screen from logo A ("A shared ride"): the icon
  with iOS dark and tinted versions, the Android adaptive and themed icons,
  the opening screen on frost or night, and the browser tab icon, exported
  from drawings in `apps/mobile/assets/logo`.
- Operator console, milestone 8: the plan and ADR 0028; console sessions,
  the guard on `/admin/v1` and the append-only audit log in the API
  (`recordAudit`, a trigger that refuses changes); passkey sign-in with
  `@simplewebauthn/server` (setup link, sign-in, adding and removing
  passkeys) and the `operator` command that gives or removes the role.
- `packages/ui`: the design tokens and the map of Iceland (data,
  projection, roads and views) moved out of the app, to be shared with the
  operator console; the app looks the same.
- The operator console app (`apps/admin`, React and Vite), served by the
  API at `/admin` with its own content security policy: sign-in and
  first-passkey setup with passkeys (`@simplewebauthn/browser`), the home
  page, the passkeys page, Icelandic and English, and the console in the
  API image.
- The audit log page in the console (spec 9, 3.8) and
  `GET /admin/v1/audit-log`: entries newest first, 50 at a time, filtered
  by the start of the action, the record, the operator and days in Iceland,
  each with its changes, network address and device. The filters stay in
  the address, so a filtered log can be reloaded or shared.
- Meeting points in the console (spec 2, 3.6). The Meeting points page
  shows every point on the map and in a list, filtered by status, region,
  type, season, review overdue and name, with the filters in the address.
  Its form adds a draft or edits a point: the spot is pasted as
  coordinates or a map link and shown on the map, and each problem is
  named by its field before saving. The API behind it, `GET`, `POST` and
  `PUT /admin/v1/meeting-points`, writes an audit entry of what changed.
  The rules for each field are in the domain (`validateMeetingPointDraft`);
  an edit made on an older copy is refused, and only a draft's spot is
  edited there. Migration `0027_meeting_point_console_fields` adds the
  shelter's weekly hours and note, and when the amenities and season were
  reviewed. The texts for regions, types and amenities move from the app
  to `@shareride/i18n`, so the console uses them too.
- The console is closed to an operator whose own account waits to be
  deleted (spec 11): their sessions, passkey sign-in and setup links are
  refused, and the `operator` command does not give them the role.

- Privacy self-service, part 1 (spec 11): the rules in the domain (what
  is open before deleting an account, the 7-day wait, what deletion does to
  each kind of data, retention cutoffs, holds, one export a day, blocked
  numbers, due dates of privacy requests), and a catalogue of every
  table's personal data that a test keeps complete.
- Confirming with a fresh code (spec 11): `POST /v1/me/confirm-code` sends
  a code to the person's own number, which only confirms and never signs
  in, under the sign-in limits, for downloading data and deleting an
  account.
- Download my data, the API (spec 11, 3.2): asked for with a fresh code,
  one a day; built within seconds as a ZIP of `shareride-data.json` and a
  readable page in the person's language, with other people by first name
  only; kept encrypted for 7 days and downloaded through a one-time link
  that works for 2 minutes. A push and an email say when it is ready,
  without a link.
- Download my data in the app (spec 11, 3.1 and 3.2): a Privacy page in
  Settings, with Download my data and the Privacy Policy. The person
  confirms with a code sent to their own number, sees the file being made
  and when it is ready, and downloads it. The ready notice opens this
  screen.
- Delete my account, the API (spec 11, 3.4): what is still open, and with
  a fresh code and nothing open, signed out everywhere and hidden at once
  from search, trip details, booking and messages, with the data erased 7
  days later. Signing in meanwhile shows when, and keeping the account
  undoes it, leaving a suspension in place. Nothing new is booked or
  published while it waits. An email says when the data will be erased.
  The export now has the person's own check-in times.
- Erasure 7 days after "Delete my account" (spec 11, 3.5), in the hourly
  clean-up: what was the person's alone is deleted, and their trips,
  bookings and the cars those used move to one shared former member
  without free text or number plates, so the people they rode with keep
  their bookings, payments and history. Their messages read "Message
  deleted", and the app shows "A former member" for them. A suspended
  person's number cannot sign up again until the suspension would have
  ended. An open report about a ride (milestone 7) holds a deletion until
  it is decided. After a database restore, `privacy reapply-erasures`
  erases the accounts again and takes the deletions asked for or undone
  since from the old database.
- Pausing, bringing back and retiring a meeting point, the API (spec 2,
  3.6.4 and 3.6.5): `POST /admin/v1/meeting-points/{id}/pause`, `/resume`
  and `/retire`, with their rules in the domain (`nextPointStatus`,
  `validatePause`) and an audit entry each. A pause asks the driver of
  each future trip that stops there to choose another stop and tells the
  passengers who get in or out there, by SMS too within 24 hours of
  boarding. The API's minute job brings a paused point back on its end
  date and retires a retiring one after its last trip. A point in use is
  due for review a year after its last check (R2.9). Migration
  `0032_meeting_point_pauses` adds the `MeetingPointChanged` event and the
  meeting point of a notification. A point retired while paused keeps its
  reason and its news still goes out. Publishing a trip and adding a stop
  wait for a pause under way. The sample seed keeps the status the console
  gave a sample point.
- Pausing, bringing back and retiring a meeting point in the operator
  console: the point's "In use" panel shows its upcoming trips and a
  pause's reason, pauses it with a reason in both languages and an
  optional end date, brings it back, and retires it after saying whether
  that is at once or after its last trip.
- Meeting point photos, the API (spec 2, 3.6.3; ADR 0022 and ADR 0029): the console
  routes under `/admin/v1/meeting-points/{id}/photos` add, describe in both
  languages, order and remove up to five photos a point, each with an audit
  entry; the app's meeting point details list them with their
  descriptions. The domain's `checkPhotoFile` takes only a JPEG made of the
  segments a picture needs, without metadata, at most 2 MB and 1 600
  pixels. Photos are kept in the Hetzner
  bucket (`PHOTO_STORAGE=hetzner`, signed links that last at least an
  hour), a folder in development, or not at all. Migration
  `0034_meeting_point_photos` adds the `meeting_point_photos` table.
- Meeting point photos in the console and the app (milestone 8, PR 8b):
  a point's page has a Photos panel to add, describe in both languages,
  order and remove up to five photos. The browser makes each photo at most
  1 600 pixels and writes a new JPEG, and `stripPhotoMetadata` in the
  domain keeps only the picture's own segments, so Safari's Exif segment
  is gone before upload (ADR 0029). The app's meeting point details show
  the photos above "Where to stand", described for screen readers, with a
  note in place of a photo that does not load.
- Importing meeting points from a CSV file in the operator console
  (milestone 8, PR 9; spec 2, 3.6.9): the console shows each row as it
  will be saved, or its problems by column, then adds the rows without
  problems as drafts in one transaction with one audit entry
  (`meeting_point.imported`). Files saved by Excel in Icelandic
  (semicolons, decimal commas) are read too, and a name already in use is
  skipped, so the same file twice adds nothing. The domain's
  `readMeetingPointImport` reads and checks the file.
- "Something wrong here?" on a meeting point's details in the app
  (milestone 8, PR 10a; spec 2, 3.5): signed in, a person chooses what is
  wrong (closed or moved, unsafe, wrong location, wrong information,
  other) and may add a note of up to 300 characters, at most 5 reports in
  24 hours (R2.8, a setting). Signed out, the screen asks to sign in and
  opens the form again afterwards. Reports go to `meeting_point_issues`
  through `POST /v1/meeting-points/{id}/issues` for the operator's queue,
  and the open ones are in Download my data.
- The console's problem reports (milestone 8, PR 10b; spec 2, 3.5 and
  3.6): the open reports, the oldest first, with the point, what is wrong
  and the note, never who sent it; the home page counts them, and the
  list of points marks and filters the points with one, as needing
  review. Resolving needs a note of what was done, removes the link to
  the person and can mark the point checked today, with audit entries for
  the report and the point; "Pause … now" opens the point's pause at
  once. The hourly clean-up deletes a resolved report after 12 months.
  Browser journeys cover both sides.
- Our own road file for distances between meeting points (milestone 8,
  PR 11; ADR 0031): the "Road file" GitHub Actions job builds it
  from the OpenStreetMap extract of Iceland with `osmium-tool` and our
  builder, keeping the roads cars may use without F roads, closed roads
  and ferries, with a typical speed for each. The domain reads it, joins a
  meeting point to the nearest road within 1 km and finds the fastest way,
  one-way roads included. The file in the repository is from map data of
  16 November 2026 (19 474 km of road, 0.9 MB); a test checks known
  distances and that every sample meeting point reaches every other. How
  to update the map data: `docs/engineering/road-file.md`.
- Distances for real meeting points (milestone 8, PR 11b): the API finds
  legs on the road file through the `Router` port, which reads it on
  first use (straight lines in API tests). "Recompute all" computes every
  leg between points in service again, with an audit entry, and
  activating or moving a point will compute its own (PR 12). The
  console's Distances page, under meeting points, shows how many legs
  there are, when they were computed and on which map data, the points
  with no road within 1 km and the legs missing; a browser journey
  recomputes them on the real road file. Joining a point to a road is
  about eight times faster, and the sample seed keeps road file legs.
- Activating a meeting point (milestone 8, PR 12a; spec 2, 3.6.3): a
  draft's page in the console shows its activation checklist (R2.3), each
  item done or still to do, from what is saved; it is checked again when
  the point or a photo is saved. Its last item asks for a road within
  1 km that reaches a point in service. Activate says how much is left
  when the API finds something still to do. Activating makes the point active
  with its yearly review date and computes its legs both ways with every
  point in service, in the same transaction, with an audit entry
  `meeting_point.activated`. The API refuses a draft whose checklist is
  not done (`activation_not_ready`, naming each item).
- Moving a meeting point in use (milestone 8, PR 12b; spec 2, 3.6.6):
  Move in the console's "In use" panel takes a new spot, pasted as for a
  draft, and says how far it is from the point and who is told. The API
  checks the spot is in Iceland, is not where the point is and has a road
  that reaches a point in service, then saves it and computes its legs
  again in one transaction, with an audit entry `meeting_point.moved`.
  Moved more than 50 m (R2.10), the driver of each trip still to stop
  there and each passenger who gets in or out there are told "Meeting
  point moved", passengers by SMS within 24 hours of boarding. Migration
  0044 adds the notification kinds `meeting_point_moved` and
  `meeting_point_moved_driver` and the event `MeetingPointMoved`.
- Delete my account in the app (spec 11, 3.4): under Privacy in Settings,
  what is still open, each opened where it is cancelled under the normal
  rules and looked at again on coming back, and what is erased and kept.
  Once nothing is open, a fresh code by text message deletes it: this
  device is signed out with the rest, and the screen says when the data
  goes. Signing in meanwhile shows only that date, with "Keep my account"
  and "Sign out", and no other signed-in screen opens. Asking to delete
  again while it waits keeps the first date.
- Download my data has each report about a ride the person made or
  answered (spec 8, 3.3 and 3.4): what was reported and by whom, the
  answer, the outcome and when, with the person's own note only. The other
  side's note and the operator's stay with the operator.
- Retention runs and holds (spec 11, 3.7): the hourly clean-up records, for
  each retention rule, when it ran and how many records it erased, never
  which; a rule that fails is reported and the others still run. It now
  also deletes blocked numbers once their date comes, the list of erased
  accounts after 30 days, ended holds after 3 years and its own records
  after 90 days. A hold keeps what the clean-up would delete about a
  person, a trip or a booking (their conversations, ended sessions,
  notification log and drafts, and the account itself) until its end. The
  `privacy` command shows the last run of each rule (`runs`) and lists,
  sets and ends holds (`holds`, `hold`, `end-hold`), each in the audit log.
- Erasure blocks a suspended person's number only until their suspension
  ends, at most 3 years, now that suspensions have an end (R11.9); a
  suspension for good still gets the 3 years.
- Trips and bookings are made anonymous 3 years after the trip (spec 11,
  3.7): the hourly clean-up moves the trip, its bookings, "I'm here" and
  reports to the former member with their free text emptied, and gives
  the trip a car of the same make, model and colour without a plate.
  Stops, prices and payments stay. A hold on the trip, a booking, the
  driver or a passenger keeps it until the hold ends.
- Reviews of a trip made anonymous no longer name who wrote them or the
  ride (Martin's answer A51): they keep their stars, comment and dates for
  the person they are about, so ratings stay the same. A profile shows
  them as by "A former member", as it shows those of people who left, and
  Download my data lists those about the person from such trips in their
  own section. A hold on anyone they name keeps them as they are.
  Migration `0042_reviews_of_old_trips` makes a review's booking optional.
- Erasure keeps a conversation a report covers (spec 9, section 7;
  Martin's answer A47): the erased person's messages read "Message deleted" to
  the other person, but the operator can still read them until the
  report's time is over and the clean-up deletes the conversation.
- A chat push still waiting when its sender is erased is no longer sent,
  so what a report keeps never reaches the other person (A47).
- Ask about my data in the API (spec 11, 3.6): `POST /v1/me/privacy-requests`
  takes an objection, a restriction, a correction or a question from
  someone with a verified email, at most 5 a day, due a month later. The
  `privacy` command lists those waiting (`requests`) and answers one
  (`answer`), in the audit log; the answer goes by email in the person's
  language. Requests and answers are in Download my data, kept under the
  former member when the account is erased, and deleted 3 years after the
  answer.
- Ask about my data in the app (spec 11, 3.6): under Settings, Privacy,
  choose what it is about (an objection, a limit, a correction or a
  question) and write it; the app says the answer comes by email within a
  month. Without an email, it asks to add one first.
- Download my data has the reviews (spec 8, 3.7): with each booking, and
  each passenger on a trip the person drove, the review they wrote and
  the one about them once it shows, and when ShareRide hid either. A
  review that does not show yet stays out of the other person's file.
- The trip limit, part 1 (spec 17, ADR 0030): a booking that would take a
  trip past what a full car pays at the price caps, counting what the
  trip's bookings already pay the driver, is refused with
  `trip_limit_reached`, and the app says fewer seats or a shorter part may
  fit and leads back to the trip; the domain gains `tripLimit`, `takingsOf`,
  `limitRoom` and the highest price level within the limit.
- The trip limit, part 2 (spec 17, ADR 0030): the price level follows the
  limit. More seats after people booked, a stop whose new stretches leave
  too little room, a no-show (the driver's or the operator's decision), a
  cancellation, or a request declined after the level was raised lower the
  level for new bookings to the highest that keeps a full car within the
  limit, recorded as a price level change with its reason; a higher level
  is refused. The driver's trip shows its takings, and the price, seats and
  stop screens say when what passengers booked sets the highest level,
  down to free. On a trip under way, the stretches already driven still
  count (A50).
- Milestone 11 plan (the beta gate, feedback and operator settings) and
  ADR 0032: which values the operator can change, their ranges, and which
  rules read a trip's or a booking's settings version.
- The settings store (spec 10, 3.2; ADR 0032): `setting_changes`, a history
  the database lets nobody edit, from which the values of every settings
  version are worked out; the first two settings, "Invite code required"
  and the most testers; the console's Settings page, where a change needs
  a reason, shows what it does first and lands in the history; and
  `GET /v1/config` for the apps.
- Spec 18 (approved) and its plan: the web app on a laptop. From 900 wide,
  every main screen gets two columns or a grid in a page 1144 wide, under
  the top bar; phones keep their layouts.
- The laptop layout's groundwork (spec 18, 3.2 to 3.4): a `Screen` can be a
  page 1144 wide, with `Columns` (a main column and a side column that
  stays in view) and a `Grid` of cards for the screens to come. On the web,
  parts show the pointer: a card's edge turns moss, a row, a chip and a
  secondary button are tinted, a primary button turns a step darker. The
  top bar's logo and language line up with the page's edges, and the logo
  and name open Find. Phones are unchanged.
- Invite codes and the closed beta's gate in the API (spec 12, 3.2; R12.1
  to R12.3). While "Invite code required" is on, a number with no account
  is answered `invite_required` after its text-message code, which is kept:
  sent again with `inviteCode`, the account is made, records its code and
  counts as a tester. A wrong invite code counts as a wrong try; no code
  works once the testers reach the cap (`beta_full`), also when two
  sign-ups come at once. A member signing in is never asked.
  `POST /v1/invites/check` says whether a code would work (10 a minute per
  address). The console's routes list the codes with the places left, make
  a group code (a name, 1 to 500 uses, an end at most 12 months ahead) and
  end one, each in the audit log. `pnpm --filter @shareride/api invite add`
  prints a code for the first account of a new server, and the local
  seed command makes `BETA2345`, never on staging. The app asks for the code in the next change;
  until then the app's browser tests run with the requirement off.
- Find on a laptop (spec 18, 3.5): the search is one row in a card, with
  From, To, the date, the seats and "Find a ride" on one line from 1280
  wide; the place list and the calendar open downwards in their own part.
  Under it are the rides leaving soon, six of them, in two columns from
  about 1140 wide and in one under that, with your next ride and the offer
  to drive beside them. Phones are unchanged.
- Search results on a laptop (spec 18, 3.6): our map beside the list, with
  the stretch of the first trip found, or of the trip the pointer or the
  keyboard came to last, whose card is marked. The map is always there,
  without a trip when there is none to show, and stays still between
  trips. The chips wrap instead of scrolling sideways. Phones are
  unchanged.
- The invite code in the app and the console (spec 12, 3.2.3, 3.2.6 and
  screen 5). A new number is asked for its invite code after the
  text-message code, on a screen of its own in step 2; a code that does not
  work is said in the field, a full beta under it, and when the
  text-message code has run out the person is back at step 1 with the
  invite code kept. A link `/invite/<code>` opens sign-up with the code
  filled in. A small "Beta" label sits beside the name while the beta is
  closed (`GET /v1/config`). The console's Invite codes page shows the
  places left, makes a group code and ends one after asking.
- Feedback in the API (spec 12, 3.3; R12.5; milestone 11, PR 5; migration
  `0049_feedback`): a signed-in person sends a message of up to 2 000
  characters with its kind and the app's details, and from phones a
  screenshot (a JPEG without metadata of at most 1 MB, kept in the
  database), 10 a day, and reads back what they sent with the replies.
  Console routes list feedback by status and kind, show the screenshot,
  set the status and send one reply, which reaches the tester by push
  ("ShareRide replied to your feedback") and email (the reply itself);
  each is in the audit log. "Download my data" has a feedback section
  with the screenshots as files, deleting the account deletes both, and
  the clean-up deletes feedback 12 months after "Invite code required"
  was last turned off.
- Trip details, Check and pay and a request on a laptop (spec 18, 3.7 and
  3.8): pages of two columns with no bottom bar. On trip details, your
  part (Get in beside Get out), who you ride with (the seat view beside
  the driver) and safety are in the main column; booking, with the seats
  beside the price they change, and the route are in the side column. On
  Check and pay and a request, what you read and fill in is in the main
  column, and the ride, the total and the button are beside it. The panel
  320 wide beside trip details is gone (`Screen footerBeside`). Both are
  pages also while they load and when the trip cannot be loaded, so Back
  stays in its place. Phones are unchanged.
- Messages on a laptop (spec 18, 3.11): one card with two panes. My
  conversations are at the left and the open one at the right, with the
  field to write in at its bottom; each pane scrolls on its own. Messages
  in the menu asks to choose a conversation and opens none by itself.
  Another row shows its conversation in the same place, and the list
  follows what is read and sent. A chat opened from a booking has the two
  panes too. Phones are unchanged.
- A booking, My rides and Profile on a laptop (spec 18, 3.9, 3.10 and
  3.12). A booking is a page of two columns: where it stands and what to
  do now (Pay, Withdraw request) in the main column, then the driver and
  where to stand, side by side where there is room, "I'm here" on the
  trip day and Safety; the ride with its price, Message, Cancel booking
  and reporting beside them, whole in a small laptop's window. An open
  payment stays when the window turns narrow or wide. My rides shows the
  rides as a grid of two or three columns in the same order. My profile
  has who I am in a card at the left and its rows beside it. Phones are
  unchanged.
- Offer a ride and the driver's trip on a laptop (spec 18, 3.13 and
  3.14), the last of the laptop layouts. Each step of posting a trip is
  two columns: the step at the left, and beside it "Your trip so far",
  which fills in as the route, the day and times, the price and the seats
  are chosen, then the step's button, and on the first step the map of the
  route. The button keeps its place when the map comes and is whole in a
  small laptop's window. What is typed or chosen on a step stays when the
  window turns narrow or wide. The driver's trip has "Edit trip" and
  "Cancel trip" beside its name, requests and passengers in the main
  column and the seats on each stretch beside them. Phones are unchanged.
- Find on a laptop, after Martin's look at it (spec 18, 3.5, decisions 15
  to 17). From, To and the date show their value in a field a shade off
  the card, so it is plain where to press. Beside the rides leaving soon
  stands our map of Iceland with every meeting point, and on it the road
  of one ride: the first, or the one the pointer or the keyboard came to
  last, whose card is marked. "Offer a ride" is a line under the rides,
  and a card where they would be when none leave soon; "See the meeting
  points" is under the map. A wide Find now also asks for the meeting
  points. Phones are unchanged.
- Send feedback in the app and the console (spec 12, 3.3; milestone 11,
  PR 6): the form opens from the Beta label, Profile and Settings, and on
  phones from a shake, which a switch in Settings turns off. Phones take a
  picture of the screen the person came from, shown before sending and
  removable; the web sends none. "My feedback" in Settings shows what was
  sent and ShareRide's replies. The console's Feedback page lists it by
  status and kind, shows the screenshot on request, sets the status and
  sends the one reply. New in the app: `react-native-view-shot` and
  `expo-sensors`.
- Switches for emergencies (spec 10, 3.3; R10.5; milestone 11, PR 7;
  migration `0050_switch_reminder`): the operator can pause new sign-ups,
  new trips, new bookings and payments, and text messages, emails and
  push notifications, each with a reason on the console's Settings page.
  A pause refuses only what is new and never cancels or changes a trip
  or a booking; while bookings are paused no booking runs out for lack
  of payment, and each gets its payment window again afterwards. Paused
  messages wait and go out when their channel is back on, unless the
  news is old by then. The app says what is paused on the booking
  screen, on Offer and on step 1 of signing in. A switch left off for an
  hour reminds the operators, and again each day.
- The search log and corridors (spec 10, 3.4.1 and 3.4.5; R10.6;
  milestone 11, PR 8; migration `0051_search_log_and_corridors`): each
  search answered is noted with its two ends, the day searched for, how
  many trips it showed, the platform and the hour, and with nothing of
  the person: no account, session, device or address, a random key and no
  exact time. The apps name their platform in an `X-Client-Platform`
  header. Rows are deleted after 14 months. The console's new Corridors
  page lists the roads the weekly figures will be counted for, each a
  name and its places in order; a corridor can be added, changed, and
  left out of the counting, never deleted. Local development and staging
  start with the three launch corridors.
- Weekly metrics and the beta's exit criteria (spec 10, 3.4; decision 2;
  milestone 11, PR 9; migration `0052_weekly_metrics`): every night after
  03:00 the API counts the current week and the two before it, for
  everything and for each corridor: searches and how many showed a trip,
  requests per search with a result, trips and seats offered, bookings
  and seats confirmed, seat fill by kilometre, drivers' cancellations
  that count, passengers' late cancellations and no-shows, repeat
  passengers, reports and the time to answer them, money paid and
  refunded, and active drivers and passengers. The console's new Metrics
  page shows the six exit criteria as met, not met or without data over
  the last four complete weeks, the figures week by week for everything
  or one corridor, bars per week for one figure, and a CSV file in which
  a figure about fewer than 5 people reads "<5". `pnpm --filter
  @shareride/api metrics recompute <weeks>` counts more weeks again.
- Announcements and Beta news (spec 10, 3.5; R10.7; milestone 11, PR 10;
  migration `0053_announcements`): on the console's new Announcements
  page the operator writes news about the beta in Icelandic and English
  (both required) for everyone, drivers, passengers or the people with a
  trip or a booking on a corridor, sees how many it would reach by
  notification and by email, sends it to themselves in both languages,
  and sends it once, after a second button. Each person gets it in their
  language by push and, with a verified address, by email, which ends
  with why they get it and how to turn it off. Settings in the app has a
  "Beta news" switch beside "Trip reminders", on until turned off, and a
  Beta news page that lists the announcements sent to the person in the
  last 90 days. Accounts that are suspended or waiting to be deleted get
  none.
- Prices and the seat limit from the operator's settings (spec 10, 3.2;
  R10.1, R10.3; ADR 0032; milestone 11, PR 11; migration
  `0054_trip_settings_version`): the console's Settings page has a new
  group, Prices and seats, with the suggested rate, the reference cost of
  driving, the price step, the price level step and the most seats on a
  trip. A price value shows what it does to Reykjavík to Akureyri with 3
  seats before it is saved, and a suggested rate the largest car's cap
  cannot carry is refused. A published trip keeps the price values it was
  published under through every later change; the seat limit applies at
  once, and the app reads it from `GET /v1/config`.
- The console's home page shows what needs the operator today (spec 10,
  3.1.1; milestone 11, PR 14): open reports, urgent ones first, appeals,
  disputes, meeting point problem reports and overdue reviews, failed
  notifications, people below the reliability watch level and new
  feedback, as links to their lists; the switches that are off; and the
  places left in the beta.
- Trip day and reliability values from the operator's settings (spec 10,
  3.2; ADR 0032; milestone 11, PR 13): the Settings page's last group has
  the wait before a no-show, when a trip completes, and the reliability
  figure's period, the count it is shown from and the watch level. All
  five apply at once. The profile and the console's Reliability page name
  the period as it is set.
- Booking and cancellation values from the operator's settings (spec 10,
  3.2; R10.3; ADR 0032; milestone 11, PR 12; migration
  `0055_booking_settings_version`): the Settings page has two more groups,
  Booking and paying (when booking closes, the time to answer a request,
  the time to pay) and Changes and cancellations (free cancellation until,
  a large change of departure, the largest change of departure, late
  cancellation). A booking keeps the cancellation values it was made
  under; the others apply from the change on. The app's texts take the
  values in place of fixed numbers.
- Milestone 11 closed: the roadmap ticked, the glossary's beta and
  settings terms (tester, invite code, setting, settings version, switch,
  corridor, weekly figures, announcement), and a browser journey through
  the operator's side of the beta in the console.
- Spec 20 (approved), its plan and ADR 0035 (accepted): an open beta on the web,
  reaching members by email. No invite code by default; the hour-before
  reminder and "How was your trip?" by email when there is no push; email
  links that open their screen after signing in; and an email at sign-up
  on the web. The roadmap drops the waitlist and calls Phase 3 an open
  beta.
- By email without push (spec 20, 3.1 and 3.4; ADR 0035): the hour-before
  reminder and "How was your trip?" now fall back to email, as the evening
  reminder and a new request do, so web members hear of them. The
  passenger's "How was your trip?" opens the rating screen, by push and by
  email; the driver's opens the trip. The beta is open: "Invite code
  required" is off by default, and the Beta label shows for everyone until
  launch.
- A meeting point for every settlement (spec 21, ADR 0036, Accepted): a
  point can be activated before it has a photo, which the console's
  checklist now shows as recommended. Every settlement of Statistics
  Iceland with people in 2026, less the ferry islands (110), is a town or
  village in place search, seeded in every environment by the migration
  command. `packages/db/src/places/settlement-meeting-points.csv` holds 104
  meeting points from OpenStreetMap, one in or near each settlement, for
  the operator to import in the console as drafts.
- Activate several meeting points at once (spec 21, 3.5.5): the console's
  Meeting points list has a tick box on each draft and "Confirm and
  activate N points", which activates each ticked draft in turn, with
  today as the day confirmed and its amenities and season reviewed, each
  with its own legs and audit entry. Drafts that cannot be activated are
  listed with the reason. `POST /admin/v1/meeting-points/{id}/activate`
  takes `confirmToday`.
- Meeting points at the main sights (spec 21, 3.6): 32 sights on ordinary
  roads, from the Golden Circle to Hengifoss, are landmarks in place
  search (25 new), and `packages/db/src/places/sight-meeting-points.csv`
  holds a point in each one's visitor car park, from OpenStreetMap, for
  the operator to import. Where to stand says where parking is paid.
- Paying the driver in person until card payments work (ADR 0038, rule M6),
  the console's switch "Pay the driver in person" (off by default).
  While it is on, a new booking is paid to the driver in person, in cash or
  by bank transfer, and is confirmed as soon as it is accepted; each
  booking stores how it is paid (migration 0059), so the switch never
  changes a booking already made. Cancelling one refunds nothing, and a
  cancelled or no-show booking paid in person counts nothing towards the
  trip limit. `/v1/config` says `payInPerson`, and a booking says its
  `payment`. While the switch is on, the booking screen and the trip page
  say that card payments are coming soon and to pay the driver in cash or
  by bank transfer, with no payment sheet; a booking's page, the cancel
  sheets, the trip day's no-show and report texts and the chat's tip say
  there is nothing to refund. Steps in the staging runbook.
- Sign in with Google and Apple (spec 19, ADR 0034; migration
  `0057_sign_in_identities`): "Continue with Google" and "Continue with
  Apple" on step 1 of signing in, on the web, Android and iPhone, through
  our API's browser flow (`expo-web-browser`, a one-time ticket and the
  app's own secret). A newcomer gives their phone number once, at
  sign-up; a member Google or Apple knows is signed in with no code.
  Settings, Sign-in methods lists the phone number and the linked
  accounts, and adds one only after a code to the account's own number.
  A development stand-in replaces Google and Apple locally and in tests;
  staging turns them on with the runbook's steps.
- Email links after signing in (spec 20, 3.2): a link to a screen that
  needs an account, such as "How was your trip?" in an email, opened in a
  browser that is not signed in, opens Sign in and then that screen once
  the account is ready. Only the path is kept, in the app's own storage,
  for an hour; a booking or Offer chosen in the app goes first.
- An email at sign-up on the web (spec 20, 3.3): step 3, About you, asks
  for an email after the first name when the account has none verified or
  waiting, and sends its link before the profile is saved, once. A server
  that sends no email lets sign-up go on. The phone apps do not ask.
- Profile photos (milestone 13; ADRs 0033 and 0037): a member adds,
  changes or removes a photo in Profile, from their photos or, on phones,
  the camera. The app crops it square, at most 640 pixels, writes a JPEG
  and drops what the phone added; the API checks it again and keeps it in
  the Hetzner bucket in Nuremberg (migration `0056_profile_photos`). A file
  nobody has any more is deleted at once, or by the `photo-files` job every
  minute. Every avatar beside a name shows the photo, or the first letter.
  A driver needs one to publish a trip while the server keeps photos. The
  operator can hide one from the console, with appeal (migration
  `0058_hide_profile_photos`).
- Production at `https://puffinride.is` (ADR 0042): its own Render
  blueprint, `infra/render/production.yaml`, with its own database and
  secrets, following the `production` branch. The "Release to production"
  action moves that branch to a commit on `main` whose CI passed, which
  staging already runs; the production runbook has the setup steps.
- Pull to refresh (spec 16, 3.9): pulling down at the top of Find, search
  results, Rides leaving soon, My rides, Messages, a booking or the
  driver's trip page loads it again, with a spinner and then "Updated" or
  "Couldn't update" for two seconds, read out. What was on screen stays
  until the new answer comes, and stays if it fails. Phones use their own
  pull; the web, where React Native has none, gets its own touch pull. The
  logo, on Find on a phone and in the top bar on a wide screen, loads Find
  again the same way.
- The legal documents published from the repository (ADR 0043): version 2
  of the Terms of Service, the Community Rules and the Privacy Policy, in
  English and Icelandic, adapted from the drafts for the lawyer to the open
  beta and naming Martin Safarcik as the operator. The migration command
  publishes every listed version a database lacks, in every environment,
  and a test fails if a published text changes. The app's reader shows
  their lists as bullet points.
- The console's password sign-in works on production too (ADR 0044,
  superseding ADR 0041's refusal there): the API starts with
  `ADMIN_PASSWORD` set on production, with the same limits and audit as on
  staging.
- Search engines (spec 23): production's public pages (Find, the meeting
  points, the places, the legal texts) may be indexed, each in Icelandic
  and English at `?lang=is` and `?lang=en`, which open the site in that
  language. The API fills the page's language, title, description,
  canonical address, alternates and link preview per request, serves
  `/robots.txt` and `/sitemap.xml`, and answers every other address, and
  every address off production, with `X-Robots-Tag: noindex`. The public
  screens set their own title and description; Find's rides leaving soon
  are kept out of snippets; `public/share.png` is the link preview.
- Google Analytics on the website, only after the visitor accepts (spec 23,
  ADR 0045). With `GOOGLE_ANALYTICS_ID` set, `/v1/config` names it, the web
  app's Content Security Policy lets Google's tag load, and a question
  about cookies shows at the bottom of every screen, with Accept and
  Decline alike. Nothing from Google loads before Accept. Page views carry
  the screen's pattern, such as `/trips/[id]`, never its address, with
  only the campaign tags (`utm_`) of our own ads' and flyers' links; Google
  signals and ad personalisation are off, and cookies last 13 months. The
  choice is kept in the browser for 12 months. The new Cookies page, under
  Terms, rules and privacy, turns it off, which removes Google's cookies.
  Privacy Policy version 3, in both languages, describes it; it is not
  material, so nobody accepts it again. The phone apps count nothing.
- Link previews (spec 23, 3.6): `public/share.png` is the two puffins in
  their round yellow car over the logo and the name in both languages, and
  Facebook and Messenger get the preview in Icelandic when they ask for it
  (`X-Facebook-Locale` or `fb_locale`).
- An email to the operator when new members join (spec 25), PR 1: the
  `new_members` notice, by email only, saying how many finished signing up
  since when and how many members there are, never who; its own footer;
  migration 0061 (`notification_preferences.new_members_since`); the choice
  in Download my data; an email preview.
- An email to the operator when new members join (spec 25), PR 2: the
  worker's step that makes it, as soon as someone new finished signing up
  and at most one an hour (R25.3), holding the operator's settings row so
  two workers make one; `GET` and `PUT /admin/v1/me/emails`; the console's
  page Emails to you, above Passkeys, with one checkbox that saves at once;
  a console journey; the production runbook says how to turn it on.
- Sign in with a code by email (spec 26, ADR 0046): `POST
  /v1/auth/email/start` and `/verify`; the sign-in screen asks for the
  email under Google, then the code, and only a new account gives its
  phone number, texted a code once; migration 0062 (`email_sign_ins`, the
  `email_sign_in` code purpose). A member from before signs in with an
  email and the same number once, and the email is added; a lost email is
  replaced the same way, and the old address is told. Settings, Sign-in
  methods lists the email.
- Passwords for members (spec 27, ADR 0047): `POST /v1/auth/password`,
  `PUT` and `DELETE /v1/me/password`, and the password in `GET
  /v1/me/sign-in-methods`; 8 to 128 characters with no other rule than
  not a common password or the email; scrypt hashes from `node:crypto`,
  checked outside any database transaction, one answer for every wrong
  try, 10 wrong tries an hour per email and 30 per network address, and an
  email to the verified address on each change. The
  sign-in screen takes a password under the email ("Send code" becomes
  "Sign in"), with "Forgot your password?" through the email code;
  Choose a password in Settings, Sign-in methods, and once after sign-up
  ("Sign in faster next time"). Migration 0063 (`member_passwords`, and
  the passkey tables for spec 27's next part); Download my data says
  whether a password is set.
- Face ID or fingerprint on the website (spec 27, ADR 0048): a passkey kept
  on the device's own lock (Face ID, Touch ID, a fingerprint, Windows
  Hello), never a hardware key. `POST /v1/auth/passkey/options` and
  `/v1/auth/passkey` sign in with no email typed; `POST /v1/me/passkeys/options`,
  `POST /v1/me/passkeys` and `DELETE /v1/me/passkeys/{id}` set it up and
  remove it; `GET /v1/me/sign-in-methods` lists the devices and `GET
  /v1/config` says `passkeySignIn`. The sign-in screen's "Face ID or
  fingerprint" button where the browser has a built-in authenticator, the
  devices in Settings, Sign-in methods, and "Use Face ID or fingerprint"
  after sign-up. Setting one up needs a sign-in in the last 10 minutes or a
  confirm code, at most 10 devices, and an email to the verified address;
  Download my data lists the devices. New app package
  `@simplewebauthn/browser`.
- A shared ride's own link preview (spec 23, 3.10, ADR 0049): a trip
  page's link, as the Share button gives it, shows on Facebook, Messenger
  and other apps with the part's route and when it leaves as the title, and
  a picture in our look with the route, the day and time, the stops on the
  way and the puffin driver's car; in the reader's language, and never a
  name, a photo, the car, a price or a seat count (R23.8). A cancelled,
  departed or unknown trip keeps the general card. The picture is drawn on
  first request at `GET /v1/trips/{id}/preview.png` and kept in memory
  (at most two drawn at once, with a request limit of its own), with resvg and the app's
  fonts kept in `apps/api/assets/trip-preview/` (copied there by
  `export-icons.ts`). New API package `@resvg/resvg-js`.
- A share icon on ride result cards (spec 28, 3.1): search results, the
  front page's rides leaving soon and All rides have a quiet icon in the
  top right corner that shares the card's part in the phone's or browser's
  share window, or copies its link and shows a tick; it is a button of its
  own, so it never opens the trip. `Card` takes a `corner`, `IconButton`
  can be `quiet` (drawn 36 in a 44 button), and the token `iconButtonSmall`.
- Share this ride (spec 28, 3.2 to 3.4 and 3.6): after publishing, and on
  a screen of its own opened from the share icon on a published trip in My
  trips and beside the name on the driver's trip page. It opens the phone's
  or browser's share window with the post and the link (where there is
  one), Facebook's share window for the link (no Facebook script, nothing
  loaded before the tap), and shows the post's text ("Býð far: …", the
  day, the stops, the link; never a price, a fee or a name) in Icelandic or
  English to copy, with a link to follow PuffinRide's Facebook Page. It
  replaces "Share the trip" on the published screen.
- Story on Instagram (spec 28, 3.2 item 5 and 3.5), on the website's Share
  this ride: a picture of the ride for a story, 1080 × 1920
  (`GET /v1/trips/{id}/story.png`, the route large, the day, the stops, the
  Iceland scene, nothing in Instagram's own top and bottom), with Share
  picture where the browser can share a file, otherwise Download picture
  (`&download=1`, named after the route), and Copy link for the link
  sticker. Any site may show a trip's pictures; every other answer keeps
  the same-origin resource policy. `pnpm --filter @shareride/api
  story-pictures` draws sample stories.

- Carpool in Iceland (spec 23, 3.9): a public page at `/carpool-iceland`,
  "Samferða um Ísland" in Icelandic, that says in words what PuffinRide is
  and how carpooling with it works (find, book, meet, offer), the meeting
  points, where rides go, who you travel with and a few questions, with
  Find a ride and Offer a ride; nothing about money. Find links to it as
  "How carpooling works". It is in the sitemap with its own title, and the
  server writes its text into the first answer's `<noscript>` for search
  engines that do not run the app.
- Face ID in the email field (spec 29, 3.1 and 3.4): where the browser can
  list passkeys among the email field's suggestions, step 1 of signing in
  asks for options as it opens and hands them to the browser quietly, so
  picking the PuffinRide passkey there signs in as the "Face ID or
  fingerprint" button does; new options come every 4.5 minutes while it
  stays open, and the button, Google or Apple end the quiet request first.
  On a laptop the email field takes the focus. `POST /v1/auth/passkey`
  answers `passkey_unknown` for a passkey no member or operator has, and the
  app then tells the browser to forget it (the Signal API); removing a
  device in Settings tells this browser too, and `GET /v1/me/sign-in-methods`
  gives each passkey's `credentialId` for it. The console's passkeys stay
  `passkey_invalid` and are never reported (R29.4). Sign-in options are
  limited to 60 per 10 minutes per address (was 20).
- Face ID offered after another way in (spec 29, 3.2): after the email
  code, a password, Google or Apple, a member whose account is from before
  is asked once "Use Face ID or fingerprint next time?", where the browser
  has a built-in lock and is not known to have a PuffinRide passkey.
  "Set it up" uses the fresh sign-in as the proof; "Not now" waits 30 days
  on that browser; anything kept from before signing in (a booking, Offer,
  a link) opens instead. The browser keeps the way it last signed in with,
  its own passkey's ID and the date of "Not now" (privacy, device storage).
- About PuffinRide (spec 30), a public page at `/about`: what PuffinRide is,
  the Terms of Service, Community Rules, Privacy Policy and Cookies, who
  runs PuffinRide (as the Terms say it) and how to reach us
  (`admin@puffinride.is`, our Facebook Page and Instagram). It takes the place of "Terms,
  rules and privacy": Profile's row is "About PuffinRide", and `/legal`
  answers with a permanent redirect to `/about`. About has its own title, is
  in the sitemap in place of `/legal`, and its words are in the first
  answer's `<noscript>` for search engines.
- A footer on the website's public pages (spec 30, 3.3): About, Carpool in
  Iceland, Meeting points, the three documents, Cookies, our email, our
  Facebook Page and Instagram (@puffinride.is), as real links. On a laptop, four groups under a line as
  wide as the page; on a phone's browser, small links in a few lines. Not
  on signing in, forms, My rides, Messages, Profile or in the phone apps.

- The parts of "one ride, one ticket" (spec 31, 3.3), not on a screen yet:
  `RideTicket` (a ride as a timetable with a tear line and a foot, which
  moves a tag, the price or the foot's end to a line of its own where a
  narrow phone or large text leaves no room; `Timetable` is its times and
  places alone), `Road`
  (where a booking or a draft stands, with the puffins' car on the step),
  `NeedsYouCard` (what needs you, in the car's yellow), `ActionRows` (a card
  of rows, whose focus ring is drawn inside the row) and `ScreenHead` (Back,
  the title at the left, one line). `Row`
  can have an icon, be red, unfold, hold a switch or only show a value;
  `Tag` can have an icon; `Avatar` has a small size; tests can count a
  screen's filled buttons.
- What needs you is one rule (spec 31, 3.3, item 3) in `packages/domain`:
  `bookingNeed` and `tripNeed` say whether a booked seat or a ride I drive
  asks me to pay, to answer or is on its trip day, and by when;
  `soonestFirst` orders them; `busiestStretch` names a ride's fullest
  stretch. Each ride in `GET /v1/me/trips` says who asks in the request
  that closes first (`firstRequest`: the first name, the seats and the two
  stops' names), for "Dóra asks for 1 seat".

### Fixed

- Titles keep their words apart on the website (spec 31, 3.18): Fredoka's
  space is narrow and its kerning closed it further, so "N1 Vík" read as
  "N1Vík". Titles, headings, times, prices and button labels are set
  without kerning and with a word space 0.06 em wider.
- On Edit trip and on the last step of posting, a part's link goes under
  its title where the two do not fit on one line, where "Change the
  preferences and note" ran out of its card on a phone; "Remove a stop"
  starts at the left, under the stops (spec 31, 3.18).
- A profile picture stands with the name, at the top of the lines beside
  it, on the driver's card and on a request to answer, where it sat at
  their middle (spec 31, 3.18).
- Carpool in Iceland says what samferða means (spec 23, 3.9), with the
  spelling without ð (samferda) in English, for people who search for the
  word.
- Google names us "PuffinRide" and shows a round icon (spec 23, 3.6, items
  5 and 7): the front page carries WebSite structured data with the name
  PuffinRide, where Google showed "puffinride.is"; the tab icon,
  `/favicon.ico`, `/icon-192.png` and the email header's icon are a disc,
  so Google's round frame shows a full circle where the rounded square
  left its corners empty.
- A shared ride's picture spells Keflavík right: resvg drew Fredoka's "fl"
  as one letter that looked like "ƀ" (Kefƀavík). An "f" before a letter is
  now drawn on its own, and the picture's address changes, so a site that
  kept the old picture reads the new one.
- Google gets each public page's own title (spec 23, 3.6 and 3.9): the
  server's first answer for a meeting point or a place names it, such as
  "Hlemmur: carpool meeting point · PuffinRide", where every page said
  Find's title before; one the sitemap does not list answers with noindex.
  The links between the public pages are real links (`<a href>`) on the
  web, so search engines follow them: "See the meeting points", the
  meeting points in the lists and a place's nearest points. A plain click
  still opens the screen within the app.
- Google may show our icon beside puffinride.is in its results (spec 23,
  3.4 and 3.6): on production the icons and the link preview picture no
  longer answer with noindex, and every page links a 192-pixel icon
  (`/icon-192.png`) and a home screen icon (`/apple-touch-icon.png`).
- Offering a ride, **Choose date and time** shows as busy while the stops
  on the way load. A press then did nothing, without saying so.
- Staging deploys again. Since 2026-11-22 every Render build stopped
  during the web app's export with no error: Metro started a bundling
  worker per CPU of the build machine and ran out of memory. The image now
  exports with two workers, which peak at about 1.4 GB.
- The filters above the weekly figures in the operator console fit a
  phone's width. A card whose parts stack let them grow past its edge.
- Ending an invite code, sending an announcement to yourself and sending
  it to everyone work in the operator console. The API takes a change
  only as JSON, and the API client sent no JSON body for a change that
  has nothing to say, so the real console got "unsupported media type"
  for these three. The client now sends an empty JSON body with every
  change.
- A request accepted, or a departure moved, in the seconds after bookings
  and payments are paused or opened again gets the payment deadline that
  goes with the switch as it is. The pause was read from a value up to 5
  seconds old, so such a booking could keep a 30-minute window nobody
  could pay in, or wait until the cut-off after the pause had ended.
- The health check's 2-second statement timeout holds for its own
  transaction only. It used to stay on the pool's connection, so a later
  query on it, such as one waiting for the legs lock or writing every
  leg, was cancelled after 2 seconds.
- After signing up from a ride, the app opens that ride's booking again, and
  after "Offer a ride" it opens Ready to drive. The front page left open
  under the ride took the kept choice but could not show it, so people
  landed on My profile.
- Sign-in limits count an IPv6 address by its /64 network, as search does,
  so one connection cannot send more codes by changing its address.
- Tick boxes, chips and busy buttons now tell screen readers on the web
  whether they are ticked or busy: the web build ignored
  `accessibilityState`, so they use `aria-*` props instead. On the web,
  Space ticks a tick box or picks a chip, and a text field's help or error
  is its description (the web build also ignored `accessibilityHint`).

### Changed

- A booking's status tag follows what the colours say (spec 31, 3.2, rule
  6): declined, expired, cancelled and withdrawn are a quiet grey tag, as
  nothing is asked of anyone, and "No-show" is red. They were amber, or
  blue for a withdrawal. "Waiting for payment" stays amber. The tag of a
  cancelled ride you drive in My rides (grey) and "No-show" beside a
  passenger on the driver's trip day (red) follow.
- One name each (spec 31, 3.4): every English text a member reads says
  "ride" for what a driver offers and a passenger books, in the app, in
  notices, emails and text messages; "trip" stays in "Trip day", in the
  console and the legal documents, and where the marketing pages and About
  mean the drive itself ("a trip you are making anyway"). "Post a trip" is
  "Offer a ride", "Publish trip" is "Publish ride", the search button says
  "Find a ride", "Search again" is "Find another ride", "Post again" and
  "Post the return trip" are "Post it again" and "Post the way back". In
  Icelandic the search button says "Finna far" and the button that starts
  a ride on the driver's list "Bjóða far". No text key changed.
- In My rides, a ride on its trip day stands under "Needs you", for a
  passenger and a driver alike, and its row says "Trip day", there and
  under "Your next ride" on Find (spec 31, 3.3, item 3). Until now only a
  seat to pay for and requests to answer stood under "Needs you".
- A ride is a ticket wherever one is listed (spec 31, 3.5, 3.6 and 3.16):
  on Find, in the search results, on All rides, a place and a meeting
  point, and in My rides. A ride found shows its day, how it is booked,
  the two times and places, the price, and under the tear line the driver
  and the seats left; a ride of mine says "Passenger" or "You drive", and
  what it needs from me in a yellow tag. Signed in, Find greets you by
  name ("Hi Bára") with what needs you in the yellow card, or your next
  ride, over the search. On a laptop the title stands at the left of the
  scene with the car at the right, and someone new reads "How it works"
  in three lines beside the rides. The search results have one row (the
  order, one Filters chip that says how many are on, and the number of
  rides) and end with a card that leads to All rides. `/search` is the
  same search card as Find's. A ride found says its driver's `colour` in
  the API, so the circle in place of a photo is the same everywhere.
- CI skips its code jobs (bundles, unit, integration and web tests, the API
  image) for a change to docs, marketing and other files that no code reads,
  and on `main` when the pull request already tested exactly the same files
  (`.github/scripts/ci-changes.sh`). The format check and the dependency
  audit always run.
- A text message no longer signs in (spec 26): the phone step needs a
  waiting email, Google or Apple sign-in (`pendingSignIn`), at most 3 texts
  go for one, and all sign-in and confirm texts together stop at 300 an
  hour and 1 000 a day. Confirm codes go by email to the account's verified
  email, and the form says where they went. Changing the email after an
  account's first 30 minutes needs a confirm code. Pausing texts now pauses
  only the phone step.
- The front page says what PuffinRide is (spec 16, 3.2, amended
  2026-11-23): the title is "Share your ride" ("Verum samferða"), with
  "Carpool across Iceland: find a seat in someone else's car, or offer the
  empty seats in yours." under it, instead of "Where are you going?".
- Search engines read the words people look for a shared ride with (spec
  23, 3.6): carpool, ride share and lift; samferða, far, samakstur and
  deila bíl. They are in Find's title and description, the meeting point
  and place pages' texts, and a new `keywords` tag on every page.
- Offering a ride asks for the seats before the price (spec 3, amended
  2026-11-22): step 3 is seats and preferences, step 4 the price, which
  then shows the highest price level for the seats chosen instead of a
  guess from the last trip.
- The puffins drive a round, sun-yellow car with a domed roof (spec 15,
  decision 14), seen through its side windows, with a case on the roof: on
  the front page and when a seat is booked. The pale open car almost
  vanished on the frost background. The launch ads use the same drawing.
- Every email looks like PuffinRide (spec 24): the puffin pin and the name
  at the top, sent inside the email so nothing loads when it is opened, a
  white card with the title, the words and one moss button, and the footer
  with the web app's address. Dark mode in Apple Mail
  and Outlook, Outlook on Windows handled, no downloaded fonts. The
  plain-text part starts with the title and sets the footer apart. The
  words did not change. `pnpm --filter @shareride/api email-previews`
  writes the key emails to look at; the runbook's "Show the puffin beside
  our emails" gives `hello@` the puffin as its picture in Gmail.
- On a phone the search is one card: From and To, the date and the seats on
  one line, and Find a ride, which is now on the first screen (spec 16, 3.2,
  amended 2026-11-22). The date opens the calendar under it, as on a laptop.
  In Icelandic "Any day" is "Allir dagar".
- The front page's top is an Iceland scene (spec 15, decision 15): on a
  phone the name, the language and the puffins' car stand on a sky with
  mountains, glaciers, hills and a road, and on a laptop the title's line
  and the top of the search sit on a rounded panel with the same land.
- Signed out, My rides, Offer, Messages and Profile have the puffin by its
  pin over their title; Profile says what an account is for and shows the
  meeting points and the legal documents as rows. Offer's first step says
  what meeting points are for until both ends are chosen.
- Sign out is on Profile too (spec 16, 3.4 item 4), under the rows; Sign
  out on all devices stays in Settings.
- The living docs and the legal drafts say PuffinRide (ADR 0039): the
  README, CLAUDE.md, the glossary, product, architecture, compliance,
  engineering and strategy docs, SECURITY.md, the ADR skill, and the terms,
  privacy policy and community rules for the lawyer. Older ADRs, specs and
  plans keep the name they were written with.
- Staging's address is `https://staging.puffinride.is` (ADR 0039): the
  console's origin, the emails' links and sender (`hello@puffinride.is`),
  Google's and Apple's return address and the phone test builds' API all
  use it. `staging.skinnar.is` still answers until nobody uses it; console
  passkeys are made again on the new address.
- The app's IDs and link scheme say PuffinRide (ADR 0039): slug and scheme
  `puffinride` (the phones' sign-in return is `puffinride://sign-in/return`),
  iPhone preview `is.puffinride.app.preview`, Android `is.puffinride.app`,
  and Apple's Services ID `is.puffinride.preview.web` in the runbook. The
  runbook's Google and Apple steps use `staging.puffinride.is` and
  `admin@puffinride.is`. Nothing was registered under the old IDs yet.
- ShareRide is now PuffinRide (ADR 0039): every Icelandic and English text,
  the app's name and photo permission texts, the email sender name and SMS
  sender (`PuffinRide`), the console's passkey name and page title, and the
  names of downloaded files (`puffinride-data.json`, `puffinride-metrics-…`).
  A test keeps the old name out of the texts. Message keys, internal names
  and the export's key purpose keep "shareride". Staging answers on
  `staging.puffinride.is` too, beside `staging.skinnar.is`; the runbook's
  "Move to puffinride.is" lists Martin's steps.
- The logo is a puffin for PuffinRide (spec 15, decision 12): logo C, the
  puffin pin, our own cartoon puffin as a map pin with its beak pointing
  the way, replaces the car of logo A in the app icon (iOS light, dark and
  tinted; Android adaptive and themed), the opening screen, the browser
  tab and the logo beside the name. The puffin's drawing colours are tokens
  (`puffin`), and a test keeps the `Logo` part and `icon.svg` the same.
- Puffins sit in the seat view instead of the shape people (spec 15, 5.3):
  the driver in a knitted hat of their colour, you in a moss scarf, and a
  grey puffin with no colour on a seat someone else took, all facing the
  way the car drives. The booked screen's seat shows your puffin too.
- More puffins (spec 15, 5.3, decision 13): two puffins in a little open
  car over "Where are you going?" on the front page and driving off on
  "You're booked!", and a puffin by a map pin on empty screens (Rides
  leaving soon, My rides, Chats and My trips). A request sent keeps your
  seat with you in it. In dark mode the puffins drawn on the screen lift
  their black (`puffin.nightBlack`); screen readers skip all of them.
- Photos are kept in Hetzner Object Storage in Nuremberg, not Helsinki,
  which Hetzner did not offer when the staging bucket was made (ADR 0037).
  The privacy policy draft, the privacy register and the runbook say so;
  staging's `PHOTO_BUCKET_ENDPOINT` is `https://nbg1.your-objectstorage.com`.
- Staging sends error reports to Sentry's EU region: the blueprint has the
  DSNs of the `shareride-api` and `shareride-app` projects in the
  organisation `shareride-ehf`, whose projects scrub with the defaults and
  store no IP addresses (ADR 0020).
- Staging's address is `https://staging.skinnar.is`, on Martin's domain
  `skinnar.is` for now: the blueprint adds the domain and sets the
  console's `ADMIN_ORIGIN`, and the email's `WEB_APP_URL` and `EMAIL_FROM`
  (`hello@skinnar.is`, unused until Mailjet is on). The phone test builds
  talk to it. The staging runbook has "Point the domain" (a CNAME in ISNIC
  DNS Hosting) and the Mailjet records for the domain.

- Nothing about 112 in the app (milestone 9, PR 9d; spec 9, decision 5):
  on Martin's word, people dial 112 themselves, so the "Emergency: 112"
  buttons are gone from trip safety and the safety report, and so are
  "If you are in danger, call 112 now" and the 112 hint when someone has
  sent too many reports. Trip safety shows nothing when there is nothing
  to check or share. The terms and community rules still say ShareRide is
  not an emergency service.
- One menu that never moves (spec 16): Find, My rides, Offer and Profile, as
  a tab bar on a phone's four main screens and as a top bar on every screen
  of a wide one. Signed out, My rides, Offer and Profile each say what they
  are for, with Sign in. Find is the home for everyone: the logo, a route
  search with the seats and Find a ride as the main button, the rides
  leaving soon, and Offer a ride. Signing in or up leads to the ride or offer
  kept, or to Find, instead of My profile. Ride cards say "Book instantly" or
  "Driver approves", and name the driver's whole trip only when it goes
  further than your part.
- My rides lists my bookings and the trips I drive together, coming up or
  past (spec 16, 3.3). Coming up puts what needs me first under "Needs
  you": a booking to pay, with Pay, and a trip with requests to answer
  before they close, with Answer requests. Each row says Passenger or
  Driving; a trip says the seats taken and the seats free on each stretch.
  Find shows Your next ride on top when signed in. `GET /v1/me/trips` takes
  `when` (upcoming or past), and says the seats taken on each stretch and
  when the first open request closes.
- Profile shows the first name, the languages and "Member since", with Edit
  profile, "See it as others do", and rows for My cars, Driving licence,
  Meeting points, Settings, and Terms, rules and privacy (spec 16, 3.4). The
  phone number moves to Settings.
- Signing up takes three steps, numbered "Step 1 of 3" and so on: the phone
  number ("Sign in or create an account"), the code, and "Last step: about
  you" (spec 16, 3.5). While a booking or an offer is kept through signing
  up, each step shows it: "You're booking" with the day, times, route,
  seats, price and driver, or "Next: offer a ride". Step 3 takes the first
  name, the languages (the app's language ticked, five common ones, the rest
  under "More languages"), a few words (folded) and the terms in one go, and
  its button names what comes next, such as "Create account and book". The
  terms show on their own only when they change later.
- Booking takes fewer steps (spec 16, 3.7). Trip details starts with your
  part: how booking works, Get in and Get out with Change, and the seats
  free with the price per seat; then who you ride with, then the route and
  the free cancellation line. Check and pay replaces the booking screen:
  for instant booking, "Pay {total}" books the seats and opens the payment
  at once. A payment that does not finish keeps the seat held, says until
  when, and Pay tries again for the same booking. After paying, or booking
  a free ride, "You're booked!" says when and where the driver picks you
  up, what happens next and where to stand, with "See it in My rides";
  after a request, "Request sent" says until when the driver can answer.
- Offer opens the first step of posting a trip, "Where are you driving?",
  instead of "Before you publish" (spec 16, 3.6). The newest draft shows on
  top as "Continue your draft", with "See all drafts" when there are more.
  The times at the other stops are worked out and folded, with Change; a
  problem with one unfolds them. Step 5 starts with what is still missing,
  "Two things before you publish" (your car and your licence), and Publish
  trip waits until both are done, saying why under it. The profile photo
  row goes until photos exist. Cars and the licence are in Profile.
- Search results start with one button for the search, the route with the
  day and seats and Change, which opens the search filled in on the same
  screen (spec 16, 3.8). The order is one chip, "Sort: Earliest", that opens
  Earliest and Cheapest, and "Book instantly only" is a filter of its own.
  The From and To list shows towns and areas first, then meeting points,
  each under a small heading, with the sample tag once under the list.
  Settings shows the language as two choices side by side, English and
  Íslenska, then Your account, Notifications, Legal documents (as rows) and
  signing out, its rows starting at the left.
- Times on the time step of posting a trip are chosen on a wheel of hours
  and minutes in 5-minute steps (24-hour clock) instead of being typed. A
  time saved earlier that is not on 5 minutes shows rounded up to the next
  5 minutes, and the departure's wheel starts at the earliest time one can
  leave.
- Close, while choosing From or To, is a small X inside the field rather
  than a round button beside it.
- From the closed beta on, a change that saves a new kind of data ships in
  two deploys, the code that reads it first, so a rollback always lands on
  a version that understands what is stored (engineering conventions,
  Database). Stop removal (milestone 6) stays one deploy, as production
  starts after it.
- MVP feature list rewritten with feature IDs, priorities, questions for the
  owner and the order in which specs are written.

### Added

- Spec 1: sign-in, profile, settings and legal acceptance (approved).
- Spec 2: meeting points, place search and their admin (approved).
- Spec 3: driver setup and posting a trip with prices (approved).
- Spec 4: search and trip details (approved).
- Spec 5: booking and requests (approved).
- Spec 6: changes and cancellations (approved).
- Spec 7: chat, notifications and reminders (approved).
- Spec 8: trip day, reviews and reliability (approved).
- Spec 9: safety and moderation (approved).
- Spec 10: operator settings and metrics (approved).
- Spec 11: privacy self-service (approved).
- Spec 12: beta access and feedback (approved). All MVP specs are approved.
- Spec 13: payments, refunds, payouts and receipts (approved).
- ADR 0012: one price level per trip instead of per-segment price editing
  (supersedes ADR 0006).
- ADR 0013: all payments through the app, from the beta (supersedes ADR
  0008).
- ADR 0014: a passenger service fee from public launch (answers Q5).
- ADRs 0007, 0009, 0010 and 0011 accepted; open questions Q5, Q8, Q9, Q10,
  Q11 and Q13 answered.
- Launch corridors decided (Q6): Selfoss, Keflavík Airport, and Akranes and
  Borgarnes, with Akureyri if the waitlist shows demand.
- Women-only trips in the MVP (Q12): spec 14 (approved) and ADR 0015
  (accepted). All open questions are answered.
- Development strategy, roadmap and open questions.
- Product vision, pricing and seat rules, meeting point strategy.
- Architecture overview, domain model and integrations.
- Architecture Decision Records 0001 to 0011.
- Engineering workflow, conventions, testing, CI/CD, security and Claude Code
  setup guides.
- Legal, regulatory and privacy notes for Iceland.
- Repository conventions: CLAUDE.md, CONTRIBUTING.md, PR and issue templates,
  CODEOWNERS, docs CI, shared Claude Code settings and the `write-adr` skill.
