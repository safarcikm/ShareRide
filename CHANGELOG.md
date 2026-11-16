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
  (`recordAudit`, a trigger that refuses changes).

- Privacy self-service, part 1 (spec 11): the rules in the domain (what
  is open before deleting an account, the 7-day wait, what deletion does to
  each kind of data, retention cutoffs, holds, one export a day, blocked
  numbers, due dates of privacy requests), and a catalogue of every
  table's personal data that a test keeps complete.

### Fixed

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
