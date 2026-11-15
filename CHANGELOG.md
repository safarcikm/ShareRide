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

### Fixed

- Sign-in limits count an IPv6 address by its /64 network, as search does,
  so one connection cannot send more codes by changing its address.
- Tick boxes, chips and busy buttons now tell screen readers on the web
  whether they are ticked or busy: the web build ignored
  `accessibilityState`, so they use `aria-*` props instead. On the web,
  Space ticks a tick box or picks a chip, and a text field's help or error
  is its description (the web build also ignored `accessibilityHint`).

### Changed

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
