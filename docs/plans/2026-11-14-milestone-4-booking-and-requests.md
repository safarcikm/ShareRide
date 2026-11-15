# Milestone 4 plan: booking and requests

**Owner:** Martin · **Date:** 2026-11-14 · **Status:** Approved by Martin
(2026-11-15: all three choices in section 3 accepted)

Turns trips into rides: a passenger books, or requests, seats on any part of a
trip, pays in the app once accepted, and sees their bookings; a driver
accepts or declines requests and sees who rides where. It implements
[spec 5](../specs/2026-11-13-booking-and-requests.md) (booking and requests)
with the rules in [pricing and seats](../product/pricing-and-seats.md)
(P1, S1 to S5, the booking modes and lifecycle, M1). Screens follow
[spec 15](../specs/2026-11-13-visual-design-system.md#54-screens). Martin
chose this order on 2026-11-14 (milestone 3 plan, decision 5) and asked on
the same night to keep building while the milestone 3 PRs wait for him.

It builds on milestone 3 (trips, segments with an occupancy column, trip
details with "Booking opens soon") and on ADRs
[0006](../decisions/0006-meeting-points-and-segment-pricing.md) (segment
prices and the capacity invariant),
[0012](../decisions/0012-trip-price-level.md) and
[0013](../decisions/0013-in-app-payments-only.md) (payments only in the
app, behind a `PaymentProvider` port). No new ADR is needed: section 3's
choices are temporary or inside existing decisions.

## 1. Goal

When this milestone is done, on the web and on an Android emulator:

- A passenger opens Borgarnes to Blönduós on Anna's trip, books one seat,
  pays on a test payment screen and sees the booking confirmed, with the
  number plate and where to stand.
- On an approval-mode trip, the passenger sends a request with a short
  note; the driver sees it on their trip with the time left, accepts it,
  and the passenger pays. Unanswered requests and unpaid bookings expire
  and free their seats.
- Two people trying for the last seat at the same moment never both get it,
  and a double tap never books twice.
- A visitor without an account signs up in the middle of booking and comes
  back to their choice.
- Both see their bookings: the passenger in "My bookings", the driver on
  their trip, grouped by where passengers get in and out.

## 2. Scope

| In milestone 4 | Later |
| -------------- | ----- |
| Booking and requests (spec 5, 3.1 to 3.4), every rule R5.1 to R5.12 | Cancelling a booking or a trip, changes after booking, refunds (spec 6) |
| Paying through the `PaymentProvider` port with a **test provider** on local and staging (decision 1) | The real provider, receipts, payouts, the ledger (spec 13) |
| Deadlines: request expiry (R5.5), the payment window (M1) | The driver's halfway reminder and every notification (spec 7); until then the app shows requests and deadlines (decision 2) |
| My bookings, upcoming and past, and booking details | Offline bookings (feature I4), the chat (spec 7) |
| The driver's requests and trip view, with the seat view before and after | Ratings, reviews, reliability and badges on a request (spec 8): "No reviews yet" until then |
| | Blocking (spec 9): rule S4's block check starts when blocking exists. Women-only trips (spec 14) |
| | The booking events (`BookingRequested` and the rest) that notifications will need (spec 7) |

## 3. Decisions for Martin

| # | Choice | Decision (accepted) | Why | Alternative |
| - | ------ | ----------- | --- | ----------- |
| 1 | Paying before a payment provider is chosen | **A test provider on local and staging**: "Pay" opens our own test payment screen, marked "Test payment: no money moves", that can succeed or fail. It sits behind the `PaymentProvider` port, so the real provider (spec 13) replaces it without touching bookings. The API refuses to start with it in production | The whole booking lifecycle (accepted, paid, confirmed, expired) can be built and tried now; the provider needs the company, a contract and the legal opinion first | Build booking without the payment step until the provider is chosen, which breaks rule M1 and means rebuilding the flow later |
| 2 | How a driver learns about a new request before notifications exist | **In the app only**: a count on "My trips" and the trip, with each request's time left | Notifications are their own spec (7) and need push, email and SMS set up; for testing on staging the app is enough | Send the driver a text message for each request now, through Vonage, at a few krónur each |
| 3 | Where the deadlines run | **Inside the API, every minute**, and again inside every booking on that trip, so a late sweep never keeps a seat taken. The architecture's worker takes the sweep over when notifications need queued jobs | No new service to run or pay for; safe with more than one API instance (each row is locked while it changes) | A Render cron job every few minutes, as the clean-up runs: another service, and seats stay taken until it runs unless bookings check too |

Settings start as values in the domain package, as pricing and seats gives
them: the booking cut-off 15 minutes, `request_expiry` 12 hours and never
later than 2 hours before boarding (2 h 30 min marks a late request), the
payment window 30 minutes, messages up to 300 characters.

## 4. Design notes

### 4.1 Booking rules (domain)

Pure functions in `packages/domain/src/bookings/`, with property tests:

- `settings.ts`: `BookingSettings` and `defaultBookingSettings`
  (`bookingCutoffMinutes: 15`, `requestExpiryMinutes: 720`,
  `requestLatestBeforeBoardingMinutes: 120`, `lateRequestMinutes: 150`,
  `paymentWindowMinutes: 30`, `messageMaxLength: 300`).
- `lifecycle.ts`: `bookingStatuses` (`requested`, `accepted`, `confirmed`,
  `declined`, `expired`, `cancelled`, `completed`, `no_show`),
  `holdsSeats(status)` (rule S1: requested, accepted, confirmed) and
  `nextStatus(status, event): Result<BookingStatus, { code: "not_allowed" }>`
  for the events `accept`, `decline`, `expire`, `withdraw`, `pay`,
  `cancel`, `complete`, `no_show`, exactly the lifecycle diagram's arrows.
- `deadlines.ts`: `requestDeadline(requestedAt, boardsAt, settings)` (R5.5)
  and `paymentDeadline(acceptedAt, boardsAt, settings)` (M1: 30 minutes,
  never past the cut-off).
- `check.ts`: `checkBooking(input, settings): Result<BookingPlan,
  BookingProblem>`. The input is the trip as booking sees it (status,
  driver, booking mode, stops with times, segments with price, capacity and
  occupancy), the passenger, the part, the seats, the total they were shown,
  the message, the passenger's other bookings that hold seats (their
  boarding and alighting times) and `now`. Problems, in this order:
  `trip_not_bookable` (not published, or past the boarding stop),
  `invalid_part`, `own_trip`, `booking_closed` (cut-off),
  `invalid_seats`, `message_not_allowed` (a message on an instant booking),
  `message_too_long` or `message_has_contact_details` (R5.6, with the trip
  note's contact check), `seats_taken` (with the seats free now),
  `price_changed` (with the current total; R5.3) and `overlapping_booking`
  (R5.10). The plan has the starting status
  (`accepted` for instant, `requested` for approval, `confirmed` for a free
  instant booking), the segment prices, the total and the deadlines.
- An occupancy model for the property test: random bookings, requests,
  acceptances, declines, expiries and withdrawals never break S2, and free
  seats always equal rule S3. The pricing and seats worked example is a test.

### 4.2 Bookings on the server

- Tables (migration 0005): `bookings` as in the domain model (stop IDs,
  `seats`, `status`, `total_price` and `currency`, the timestamps, `message`,
  `decline_reason`, `attempt_key` unique per passenger) and
  `booking_segment_prices`. Checks mirror the domain: seats ≥ 1, statuses,
  a message of at most 300 characters. Segments already hold occupancy
  between 0 and the capacity.
- **Booking transaction:** lock the passenger's row, then the trip row
  (`FOR UPDATE`), expire the trip's bookings past their deadlines, load what
  `checkBooking` needs, insert the booking and its prices, and add the seats
  to the occupancy of every segment of the part. The passenger's lock keeps
  their overlap check and attempt key to one booking at a time; answering,
  withdrawing and the expiry job lock only the trip, so locks are always
  taken in the same order. Freeing seats subtracts them in the same transaction as the
  status change. The database check stops an over-booking even if the
  application check is bypassed (R5.2).
- **Retries:** the same attempt key from the same passenger returns the
  booking it made (200), whatever the second request says.
- **Account:** booking needs the account to be complete (R5.1), as
  publishing does; otherwise 403 `account_incomplete`.
- **Privacy:** the plate, "where to stand" and the meeting point details for
  the booking come back only once it is confirmed (R5.12). A driver sees a
  passenger's first name, member-since month and message, never a phone
  number. Decline reasons are stored and never returned (R5.7). Booking
  messages are personal data: they are kept with the booking and listed in
  the privacy inventory.

Endpoints (`/v1`), shapes in `packages/contracts/src/bookings.ts`:

| Method and path | Answers |
| --------------- | ------- |
| `POST /trips/{id}/bookings` | 201 the booking; 200 the same booking on a retry; 409 `seats_taken` with the seats free, `price_changed` with the current total, `overlapping_booking`, `booking_closed` or `trip_not_bookable`; 400 for the part or the message; 403 `account_incomplete` or `own_trip` |
| `GET /me/bookings?when=upcoming\|past` | Upcoming: requested, accepted and confirmed until the passenger gets out, soonest first. Past: the rest, latest first |
| `GET /bookings/{id}` | The passenger's or the driver's view; 404 for anyone else |
| `POST /bookings/{id}/withdraw` | The passenger, while requested (R5.8) |
| `POST /bookings/{id}/accept`, `POST /bookings/{id}/decline` | The driver, while requested and before its deadline; decline takes an optional reason (`plans_changed`, `luggage`, `other`) |
| `POST /bookings/{id}/payment` | Starts or restarts paying an accepted booking (section 4.3) |
| `GET /me/trips/{id}/bookings` | The driver's requests and bookings on their trip, with seats per segment |

### 4.3 Paying and deadlines

- `PaymentProvider` port (`apps/api/src/platform/payments.ts`):
  `startCheckout({ paymentId, amount, description }) → { providerRef }`.
  The test adapter returns a reference and nothing else; the app knows the
  provider is `test` from the payment response and shows its own sheet.
- Table `payments` (migration 0006): `booking_id`, `provider`,
  `provider_ref`, `amount`, `currency`, `status` (`pending`, `succeeded`,
  `failed`, `refunded`), timestamps. Card brand and last four digits come
  with the real provider.
- `POST /bookings/{id}/payment` reuses a pending payment for the booking or
  starts a new one, and answers `{ paymentId, provider, amount, dueAt }`.
- `settlePayment(paymentId, outcome)` is what the provider's signed
  confirmation will call (spec 13). It works once per payment: success within
  the window confirms the booking; success after the booking expired marks
  the payment refunded (R13.3); failure leaves the booking accepted so the
  passenger can try again. With the test provider,
  `POST /test-payments/{paymentId}` (`{ outcome }`, the paying passenger
  only) calls it; that route exists only when `PAYMENT_PROVIDER=test`, which
  the config refuses when `APP_ENV=production`.
- `expireDueBookings(now)`: requested bookings past `expires_at` and
  accepted ones past `payment_due_at` become `expired` and free their seats.
  It picks the trips that have such bookings and, for each, locks the trip
  (`FOR UPDATE SKIP LOCKED`: a trip being changed waits for the next run)
  and stores the expiries, so it takes locks in the same order as booking. The API runs it every
  minute (a timer that does not keep the process alive), the booking
  transaction runs it for its trip, and `expire-bookings-cli.ts` runs it
  once for tests and by hand.

### 4.4 Booking in the app

- Trip details: when the part is open, the bottom bar's button says "Book"
  (instant) or "Send request" (approval) and opens
  `/trips/{id}/book?from=&to=&seats=`. Someone who already holds a booking on
  the trip sees it instead, with a link.
- **Signed out:** the choice is kept on the device (`pending-booking.ts`,
  for up to an hour) and the person goes to sign-in; once their account is
  complete, the start screen opens the booking screen with it (R5.1, spec 5
  3.1.1).
- Booking screen (3.1): the part with times, seats (1 to the seats free),
  price per seat and total or "Free", driver, car, preferences (luggage
  first), the booking mode, the payment and reliability texts, the message
  for requests (300 characters, with a counter and the contact check as you
  type), and the button. Each opening makes one attempt key; retries reuse
  it. The key comes from `expo-crypto` (`randomUUID`) unless the global
  `crypto.randomUUID` works on iOS, Android and the web.
- Seats taken: "Sorry, those seats were just taken", with the seats free now
  and a way back. Price changed: the new total, and "Book at this price?".
- Request sent: "Request sent. {driver} has until {time} to answer.", with
  "Withdraw request".
- Pay: "Pay {total} to confirm your seat" and "Pay by {time} to keep your
  seat", then the test sheet with "Pay {total}" and "Make the payment fail".
  Failure shows `booking.paymentFailed` and lets them try again. Success
  shows "Your seat is confirmed" with the plate (or "added before
  departure"), where to stand and "Open in maps".
- My bookings (3.6): from the profile, "Upcoming" and "Past" as radio chips;
  cards with date, part with times, status, driver, car, price and seats;
  booking details by status, with "Search again" (same route and date) on
  declined and expired ones.
- Driver (3.3, 3.7): "My trips" shows a count of requests on each published
  trip. The driver's trip page lists requests first (first name and
  initial, member since, "No reviews yet", where they get in and out with
  times, seats, price, message, time left), with "Accept" and "Decline"
  (an optional reason, seen only by the operator), and the seat view before
  and after accepting; then passengers by part, with seats per segment.

## 5. Pull requests and tasks

Tests come first in every task. Each PR updates the docs it touches, runs the
browser journeys, and gets a code review before it opens. Tick tasks as they
merge.

### PR 1: `docs(plans)`: this plan

- [ ] This plan, the roadmap and the plans index

### PR 2: `feat(booking)`: booking rules in the domain

- [ ] `bookings/settings.ts`, `lifecycle.ts` (every allowed and forbidden
      change), `deadlines.ts` (a request 2 h 31 min and 2 h 29 min before
      boarding; a payment deadline capped by the cut-off)
- [ ] `check.ts` with a test per problem, in order; the contact check shared
      with the trip note
- [ ] Property test: random sequences keep S2 and free seats equal S3; the
      worked example
- Verify: `pnpm --filter @shareride/domain test`

### PR 3: `feat(booking)`: book and request, on the server

- [ ] Contracts, migration 0005 (bookings, booking segment prices), schema
      checks with an integration test that an over-booking is refused by the
      database itself
- [ ] `POST /trips/{id}/bookings`: instant, request, free; seats taken, price
      changed, overlapping, cut-off, own trip, incomplete account; the same
      attempt key twice; **two passengers for the last seat at once, exactly
      one wins**
- [ ] Withdraw, accept and decline, with who may do what; accepting a free
      request confirms it at once (R5.11); expiry inside the booking
      transaction frees seats before checking
- [ ] `GET /me/bookings`, `GET /bookings/{id}` (plate and where to stand only
      once confirmed), `GET /me/trips/{id}/bookings`
- [ ] Trip details and search count the new occupancy, and trip details
      name the viewer's booking on the trip
- [ ] Re-seeding the sample trips removes their test bookings first
- [ ] Privacy inventory: request messages and decline reasons

### PR 4: `feat(payments)`: paying with the test provider, and deadlines

- [ ] Migration 0006 (payments); `PaymentProvider` port, the test adapter,
      `PAYMENT_PROVIDER` in the config (refused as `test` in production)
- [ ] `POST /bookings/{id}/payment`, `settlePayment` (confirms exactly once;
      late success refunded; failure retried), `POST /test-payments/{id}`
- [ ] `expireDueBookings` with its timer and CLI; the e2e API serves the test
      provider
- [ ] Privacy inventory and integrations docs: payments

### PR 5: `feat(booking)`: booking and paying in the app

- [ ] Trip details' button; the booking screen; seats taken; price changed;
      request sent; pay with the test sheet; confirmed
- [ ] Signed out: sign up and come back to the choice
- [ ] Texts in Icelandic and English (spec 5, section 8, plus new ones)
- Verify: a browser journey books Borgarnes to Blönduós on an instant trip
  and pays, at phone and desktop sizes, in both languages

### PR 6: `feat(booking)`: my bookings

- [ ] Upcoming and past; booking details by status; withdraw; search again
- Verify: a browser journey withdraws a request and finds it under "Past"

### PR 7: `feat(booking)`: requests for drivers

- [ ] Request counts on "My trips"; the driver's trip page with requests,
      accept and decline, the seat view before and after, passengers by part
- Verify: a browser journey with two people: a passenger requests, the
  driver accepts, the passenger pays and both see it confirmed

## 6. Review focus

What the spec implies and a person would meet first, each with its test:

1. **Two people, one last seat, same moment:** exactly one booking; the other
   sees "Sorry, those seats were just taken" (PR 3, concurrent transactions
   against PostgreSQL).
2. **A double tap or a retry on a poor connection:** one booking, and the
   retry shows it (PR 3, same attempt key; PR 5, the button is disabled while
   sending and the key survives a retry).
3. **A deadline passes while nothing runs:** the next booking on that trip
   still finds the seat free (PR 3, expiry inside the transaction with the
   timer stopped).
4. **The payment confirmation comes twice, or after the booking expired:**
   confirmed once; the late one refunded, the seats not taken twice (PR 4).
5. **Signing up in the middle of booking:** the terms and profile steps come
   in between, and the booking screen still opens with the same part and
   seats (PR 5, a browser journey from signed out).

## 7. Martin's steps

1. Accept or change the choices in section 3 (done: all accepted on
   2026-11-15).
2. Try each PR locally on the web as it merges, with the test payment
   screen: no card is needed and no money moves.
3. Nothing to set up: the test provider needs no account or key.

## 8. Risks

- **Concurrency:** the trip lock serialises bookings on one trip, which is
  what rule S2 needs; trips are small, so waiting is short. The database
  check is the second line.
- **No notifications yet:** on staging, requests can expire unseen. Drivers
  testing it are told to check "My trips"; spec 7 closes the gap.
- **Test payments reaching production:** the config refuses them there, and
  a test proves it.

## 9. Definition of done

All seven PRs merged with green CI; Martin has booked and paid a seat on the
test screen, sent a request and accepted it as the driver, on the web and on
an Android emulator; docs, roadmap and CHANGELOG are updated.
