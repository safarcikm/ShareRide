# Spec 5: Booking and requests

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Approved (2026-11-13)

Features: D3 Book seats on the whole trip or only part of it, D4 My bookings,
C7 Accept or decline requests ([features](../product/features.md)).
Related: [pricing and seats](../product/pricing-and-seats.md) (rules P1, S1 to
S5, booking modes and lifecycle), [domain model](../architecture/domain-model.md),
[architecture: booking sequence](../architecture/overview.md),
[ADR 0006](../decisions/0006-meeting-points-and-segment-pricing.md) and
[ADR 0012](../decisions/0012-trip-price-level.md),
[ADR 0013](../decisions/0013-in-app-payments-only.md) (payments in the app),
[spec 4](2026-11-13-search-and-trip-details.md).

## 1. Problem and goal

Booking is where the partial-route model must be exactly right: a seat freed
in Borgarnes can be sold onward, two people can never get the last seat, and
the price paid is the price shown. All payments go through the app, so a seat
is confirmed only once it is paid, and refunds follow fixed rules.

Goal: a passenger books, or requests, seats on any part of a trip in a few
taps, pays in the app once accepted, and knows the refund rules. A driver in approval mode decides on
requests quickly with the information they need. Both see their bookings and
their status at all times.

## 2. User stories

- As a passenger, I book one seat from Borgarnes to Akureyri on a Reykjavík to
  Akureyri trip and pay only for that part.
- As a passenger, I book two seats for me and a friend.
- As a passenger, I send a request with a short note ("I have one big
  suitcase"), and know how long the driver has to answer.
- As a driver, I see who is asking, their rating and reliability, where they
  get in and out, and accept or decline with one tap.
- As a passenger, I pay in the app once my booking is accepted, and get all my
  money back if I cancel in time.
- As a passenger, I see my upcoming and past bookings, where to stand, the car
  and the number plate.
- As both, I can trust that the seat count is never wrong, even when two
  people book the last seat at the same moment.

## 3. Behaviour

### 3.1 Booking screen

Opened from trip details (spec 4) with the chosen part and seats.

1. **Needs an account:** signed in, verified phone number and the current
   terms accepted (spec 1, R1.6). A visitor without an account signs up and
   comes back to this screen with their choice kept.
2. Shows: the part (boarding and alighting stops with times), seats (1 up to
   the seats free on that part), price per seat and total, or "Free", the
   driver, the car, the driver's preferences (luggage first) and the booking
   mode.
3. **Payment:** "You pay {total} in the app once your booking is accepted.
   Free cancellation, with a full refund, up to 15 minutes before your
   departure." ([ADR 0013](../decisions/0013-in-app-payments-only.md))
4. **Reliability note:** "If you can't make it, cancel as early as you can.
   Late cancellations and no-shows show on your profile." (rules in spec 6).
5. **Message to the driver:** optional for requests, up to 300 characters; no
   phone numbers, email addresses or links (as in spec 3, R3.10). Instant
   bookings have no message; the chat opens at once.
6. Button: "Book" (instant) or "Send request" (approval).
7. **Women-only trips:** only people who have opted in can book, and a
   booking of more than one seat needs a confirmation ([spec 14](2026-11-13-women-only-trips.md)).

### 3.2 Confirming

1. The server checks rule S4 inside a transaction that locks the trip
   ([architecture](../architecture/overview.md)), then stores the booking with
   a snapshot of each segment's price (rule P4).
2. **Seats taken meanwhile:** "Sorry, those seats were just taken", with the
   seats now free on that part and other options.
3. **Price changed meanwhile** (the driver changed the price level): the new
   price is shown and the passenger confirms again. The price booked is always
   the price the passenger last saw.
4. **Retries are safe:** each attempt carries a key, so a double tap or a retry
   on a poor connection never creates two bookings.
5. **Instant booking:** the booking is accepted and the passenger goes straight
   to paying (3.5).
6. **Request:** the booking is requested and holds the seats (rule S1). The
   passenger sees "Request sent. {driver} has until {time} to answer."

### 3.3 Requests: the driver's side

1. The driver sees each request on the trip page and in a "Requests" list, with
   a badge, and gets a notification (spec 7).
2. A request shows: the passenger's first name, photo, rating, number of
   reviews, reliability and badges (spec 8), member since; where they get in
   and out with times; seats; price; their message; and the time left to
   answer.
3. The driver's seat view shows how the request fits: seats taken on each
   segment before and after accepting.
4. **Accept:** the booking is accepted and the passenger is asked to pay
   (3.5). The seats stay held until they pay or the payment window ends.
5. **Decline:** the driver can pick a reason (trip plans changed, luggage
   won't fit, other), which only the operator sees. The passenger sees "The
   driver couldn't take this request" and a button to search again with the
   same route and date.
6. **Expiry** (rule R5.5): an unanswered request expires; its seats are freed
   and the passenger is told, with the same search button. The driver is
   reminded once, halfway to the deadline.

### 3.4 Requests: the passenger's side

- A pending request shows its deadline and can be **withdrawn** at any time,
  which frees the seats and never affects reliability.
- A passenger cannot hold requests or bookings on two trips that overlap in
  time (decision 1). To change plans, they withdraw or cancel one first.

### 3.5 Paying

1. Once a booking is accepted, the passenger sees "Pay {total} to confirm your
   seat" with the deadline: 30 minutes, and never later than the booking
   cut-off (rule M1 in [pricing and seats](../product/pricing-and-seats.md#rule-m1-paying)).
   A notification is sent too (spec 7).
2. Payment uses the payment provider's own screen or SDK: card, Apple Pay or
   Google Pay. Card details never reach ShareRide's servers.
3. When the payment succeeds, the booking is **confirmed**: both are notified,
   the chat opens (spec 7), and the passenger sees the number plate (if added)
   and the meeting point's "where to stand". A receipt follows (spec 13).
4. If a payment fails, the passenger can try again within the window. If the
   window ends unpaid, the booking expires, its seats are freed and the driver
   is told.
5. Free rides skip this step: an accepted free booking is confirmed at once.
6. Cancellations and refunds (rule M2) are spec 6; payouts to drivers are
   spec 13.

### 3.6 My bookings

1. **Upcoming:** requested, awaiting payment and confirmed bookings, soonest
   first. **Past:**
   completed, cancelled, declined, expired and no-show.
2. Each shows the date, the part with times, status, driver, car, price and
   seats.
3. A confirmed booking adds: the number plate (or "added before departure"),
   the meeting point's photo and "where to stand", "Open in maps", the chat, and
   "Cancel booking" (spec 6).
4. Upcoming bookings and their meeting point details stay available offline
   once loaded (feature I4).

### 3.7 The driver's trip view

On their trip, the driver sees every request and booking, grouped by where
passengers get in and out, with seats per segment. Changing and cancelling a
trip with bookings is spec 6.

## 4. Rules

Rules P1, S1 to S5, the booking modes and the booking lifecycle in
[pricing and seats](../product/pricing-and-seats.md) apply. This spec adds:

| ID | Rule |
| -- | ---- |
| R5.1 | Booking or requesting needs a verified phone number and the current terms accepted (R1.6). |
| R5.2 | Rule S4 is checked inside a transaction that locks the trip, and the capacity invariant S2 is also enforced by the database. |
| R5.3 | The price booked equals the price last shown to the passenger; if it changed, the passenger confirms again. Each booking stores its segment prices. |
| R5.4 | Creating a booking is idempotent per attempt key. |
| R5.5 | A request expires 12 hours after it was made or 2 hours before boarding, whichever is earlier. A request made less than 2 hours 30 minutes before boarding instead expires at the booking cut-off (15 minutes before boarding). |
| R5.6 | Request messages are at most 300 characters and contain no phone numbers, email addresses or links. |
| R5.7 | Decline reasons are seen only by the operator. |
| R5.8 | Withdrawing a request never affects reliability. |
| R5.9 | Seats per booking are 1 up to the seats free on that part. Companions need no account; the person booking is responsible for them (decision 2). |
| R5.10 | A passenger's requested, accepted and confirmed bookings never overlap in time, from boarding to alighting (decision 1). |
| R5.11 | A booking is confirmed only when paid within the payment window (rule M1); a free booking is confirmed at once. |
| R5.12 | The chat, the number plate and the exact meeting details open when the booking is confirmed. |

The 12-hour and 2-hour values are the existing settings `request_expiry` and
the booking cut-off; the 300-character limit is a setting (feature H4).

## 5. Screens

1. Booking screen (instant or request)
2. Seats taken or price changed
3. Booked, or request sent
4. Pay to confirm, with the deadline; payment failed
5. Driver: requests list and a single request, with the seat view
6. Declined or expired, with "Search again"
7. My bookings: upcoming and past
8. Booking details
9. Driver: trip view with passengers by segment

## 6. Data and API

Entities (see [domain model](../architecture/domain-model.md)): `Booking` adds
`message`, `decline_reason`, `attempt_key` (unique per passenger),
`reminder_sent_at` and `payment_due_at`; `BookingSegmentPrice` and `Payment`
as in the domain model (payment details in spec 13).

Endpoints (`/v1`, shapes defined in `packages/contracts`):

| Method and path | Purpose |
| --------------- | ------- |
| `POST /trips/{id}/bookings` | Book or request: stops, seats, the total shown, message, attempt key. Returns the booking, or "seats taken" or "price changed" with current values |
| `GET /me/bookings?when=upcoming\|past` | My bookings |
| `GET /bookings/{id}` | Booking details for the passenger or the driver |
| `POST /bookings/{id}/withdraw` | Passenger withdraws a request |
| `POST /bookings/{id}/accept`, `POST /bookings/{id}/decline` | Driver decides on a request |
| `POST /bookings/{id}/payment` | Start or retry payment; returns what the provider's payment screen needs. The provider's confirmation (spec 13) confirms the booking |
| `GET /me/trips/{id}/bookings` | Driver's view of requests and bookings on a trip |

A background job expires requests and unpaid bookings at their deadlines and
sends the halfway reminder; a sweep every few minutes catches any missed ones.

Domain functions in `packages/domain`: validate a booking (S4), price for a
part (P1) and its snapshot, request deadline (R5.5), payment deadline (M1),
and the booking state changes in the lifecycle.

Events: `BookingRequested`, `BookingAccepted`, `BookingConfirmed`,
`BookingDeclined`, `BookingExpired`, `BookingWithdrawn`. Notifications for each come in spec 7.

## 7. Privacy and safety

- The driver sees a requesting passenger's public profile and message only.
  Once the booking is confirmed they talk in the chat; phone numbers are never
  shown.
- The passenger sees the number plate and exact meeting point details only
  once the booking is confirmed.
- Card details are handled only by the payment provider.
- Other passengers' names are not shown to passengers.
- Decline reasons stay with the operator, so nobody is told why they were
  turned down; patterns of declines can be reviewed for discrimination
  (spec 9).
- Bookings are kept as in the privacy inventory (trips and bookings).

## 8. Texts (first draft; Icelandic to be reviewed by a native speaker)

| Key | English | Icelandic (draft) |
| --- | ------- | ----------------- |
| `booking.payInApp` | You pay {total} in the app once your booking is accepted. Free cancellation, with a full refund, up to 15 minutes before your departure. | Þú greiðir {total} í appinu þegar bókunin hefur verið samþykkt. Ókeypis afbókun, með fullri endurgreiðslu, allt að 15 mínútum fyrir brottför. |
| `booking.payNow` | Pay {total} to confirm your seat | Greiddu {total} til að staðfesta sætið |
| `booking.payBy` | Pay by {time} to keep your seat | Greiddu fyrir kl. {time} til að halda sætinu |
| `booking.paymentFailed` | The payment didn't go through. Try again or use another card. | Greiðslan gekk ekki í gegn. Reyndu aftur eða notaðu annað kort. |
| `booking.confirmed` | Your seat is confirmed | Sætið þitt er staðfest |
| `booking.reliabilityNote` | If you can't make it, cancel as early as you can. Late cancellations and no-shows show on your profile. | Ef þú kemst ekki skaltu afbóka eins fljótt og hægt er. Seinar afbókanir og fjarvistir sjást á prófílnum þínum. |
| `booking.message` | Message to the driver (optional) | Skilaboð til ökumanns (valfrjálst) |
| `booking.book` | Book | Bóka |
| `booking.sendRequest` | Send request | Senda beiðni |
| `booking.seatsTaken` | Sorry, those seats were just taken | Því miður, þessi sæti voru rétt í þessu tekin |
| `booking.priceChanged` | The price has changed to {total}. Book at this price? | Verðið hefur breyst í {total}. Bóka á þessu verði? |
| `booking.requestSent` | Request sent. {driver} has until {time} to answer. | Beiðni send. {driver} hefur til {time} til að svara. |
| `booking.declined` | The driver couldn't take this request | Ökumaðurinn gat ekki tekið þessari beiðni |
| `booking.expired` | The driver didn't answer in time | Ökumaðurinn svaraði ekki í tæka tíð |
| `booking.searchAgain` | Search again | Leita aftur |
| `booking.withdraw` | Withdraw request | Draga beiðni til baka |
| `request.accept` | Accept | Samþykkja |
| `request.decline` | Decline | Hafna |
| `request.timeLeft` | {time} left to answer | {time} eftir til að svara |
| `myBookings.upcoming` | Upcoming | Framundan |
| `myBookings.past` | Past | Liðnar |

## 9. Testing

- **Unit (domain):** booking validation for every S4 condition; prices for a
  part and the snapshot; request deadlines, including requests made just
  before and just after 2 hours 30 minutes before boarding; payment deadlines,
  including ones capped by the booking cut-off; every allowed and forbidden
  lifecycle change.
- **Property tests:** random sequences of bookings, requests, acceptances,
  declines, expiries and withdrawals never break the capacity invariant, and
  free seats always equal rule S3.
- **API integration (real PostgreSQL):** two passengers booking the last seat
  at the same moment, exactly one succeeds; the database constraint rejects an
  over-booking even if the application check is bypassed; price changed between
  viewing and booking; the same attempt key twice creates one booking; a
  successful payment confirms the booking exactly once; unpaid bookings expire
  and free their seats; free bookings are confirmed at once; expiry job and
  sweep; blocked users and own trips.
- **End to end:** instant booking and a request that is accepted, both paid
  with the provider's test card, in Icelandic and English, on iOS, Android and web; a passenger without an account signs up
  mid-booking and keeps their choice.
- **Manual:** screen reader pass on the booking screen and the driver's
  request view.

## 10. Out of scope

Cancelling bookings and trips, and changes after booking (spec 6), chat and
notifications (spec 7), trip day, no-shows and reviews (spec 8), reports and
blocking (spec 9), the payment provider integration, receipts, refunds and
payouts (spec 13), waiting lists for full trips, and
adding a booking to the phone's calendar (could come later).

## Decisions

Accepted by Martin on 2026-11-13 as recommended.

| # | Question | Decision |
| - | -------- | -------- |
| 1 | Can a passenger hold requests or bookings on two trips that overlap in time? | No. They withdraw or cancel one first |
| 2 | Can one booking include companions who have no account? | Yes, up to the free seats; the person booking is responsible for them |
