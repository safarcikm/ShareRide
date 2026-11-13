# Features

**Owner:** Martin · **Last reviewed:** 2026-11-13 · **Status:** Accepted
(2026-11-13), including the recommended answers to its design questions

This is the feature list for the closed beta (the MVP), plus what comes after.
Each feature has an ID so specs, plans, issues and PRs can refer to it.

**Changing this list:** propose additions or cuts in an issue or PR; the
owner approves. Decisions that shaped the list are recorded in
[Decisions](#decisions).

Priorities:

- **Must:** the beta cannot run without it.
- **Should:** the beta is clearly better with it; build it if time allows.
- **Could:** nice to have; first to drop.

## Summary

| ID | Feature | Priority | Spec |
| -- | ------- | -------- | ---- |
| A1 | Sign up and sign in | Must | 1 |
| A2 | Profile | Must | 1 |
| A3 | Driver setup: vehicle and licence | Must | 3 |
| A4 | Settings | Must | 1 |
| A5 | Export and delete my data | Must | 11 |
| A6 | Terms, privacy policy and community rules | Must | 1 |
| B1 | Meeting point catalogue | Must | 2 |
| B2 | Place search | Must | 2 |
| B3 | Suggest a meeting point (dropped, decision 10) | – | – |
| C1 | Post a trip | Must | 3 |
| C2 | Segment prices | Must | 3 |
| C3 | Seats and booking mode | Must | 3 |
| C4 | Trip preferences and notes | Should | 3 |
| C5 | Manage my trips | Must | 6 |
| C6 | Duplicate a trip or create the return trip | Should | 6 |
| C7 | Accept or decline requests | Must | 5 |
| C8 | Payouts to drivers | Must | 13 |
| D1 | Search trips, including partial routes | Must | 4 |
| D2 | Trip details | Must | 4 |
| D3 | Book seats on the whole trip or only part of it | Must | 5 |
| D4 | My bookings | Must | 5 |
| D5 | Cancel a booking | Must | 6 |
| D6 | Help when nothing matches | Should | 4 |
| D7 | Pay in the app | Must | 13 |
| D8 | Receipts | Must | 13 |
| E1 | Reminders | Must | 7 |
| E2 | "I'm here" check-in | Should | 8 |
| E3 | Mark a no-show | Should | 8 |
| E4 | Trip completion | Must | 8 |
| F1 | Chat | Must | 7 |
| F2 | Notifications | Must | 7 |
| G1 | Ratings and reviews | Must | 8 |
| G2 | Report and block | Must | 9 |
| G3 | Reliability figure | Should | 8 |
| G4 | Safety information and trip sharing | Must | 9 |
| H1 | Admin: meeting points | Must | 2 |
| H2 | Admin: users, trips and bookings | Must | 9 |
| H3 | Admin: reports and audit log | Must | 9 |
| H4 | Admin: pricing and timing settings | Must | 10 |
| H5 | Admin: beta metrics | Should | 10 |
| H6 | Admin: message all beta testers | Could | 10 |
| H7 | Admin: payments, refunds and payouts | Must | 13 |
| I1 | Icelandic and English | Must | all |
| I2 | Accessibility | Must | all |
| I3 | Web app | Must | all |
| I4 | Works with poor mobile coverage | Should | all |
| I5 | Dark mode | Could | all |
| J1 | Beta access | Must | 12 |
| J2 | In-app feedback | Must | 12 |
| J3 | Usage analytics with consent | Should | 12 |

## A. Accounts and profiles

**A1. Sign up and sign in (Must).** Enter a phone number and a six-digit
code. Sign in with Apple or Google as alternatives, but every account confirms
a phone number before booking or posting. Stay signed in; see signed-in
devices; sign out everywhere.

**A2. Profile (Must).** First name, photo, short bio, languages spoken,
verification badges, member since, rating and reliability. Others see the
first name only, never the phone number.

**A3. Driver setup: vehicle and licence (Must).** Add one or more vehicles
(make and model, colour, number plate; the plate can be added up to
departure). Any car the driver may use; who owns it does not matter. Declare a
valid
driving licence before publishing the first trip (see decision 3).
The registration number is shown only to booked passengers.

**A4. Settings (Must).** Language, notification choices per category,
blocked users, signed-in devices.

**A5. Export and delete my data (Must).** Download my data; delete my
account from the app (required by Apple and Google, and by the GDPR). Open
bookings must be cancelled or completed first.

**A6. Terms, privacy policy and community rules (Must).** Accepted at sign-up,
versioned, and accepted again when they change. Readable in the app in both
languages.

## B. Meeting points

**B1. Meeting point catalogue (Must).** Map and list of active meeting points.
Each has a photo, where exactly to stand, amenities (shelter, toilets, shop,
lighting, parking), opening hours of nearby shelter, and whether it is
seasonal.

**B2. Place search (Must).** Type a town or meeting point and get matches
even without Icelandic letters ("Hofn" finds "Höfn"). "Near me" uses the
phone's location once, with permission, and does not store it.

**B3. Suggest a meeting point (dropped 2026-11-13).** Users do not suggest
meeting points; the operator curates them all (decision 10). Users can report a
problem with an existing point (spec 2).

## C. Driver: trips

**C1. Post a trip (Must).** Choose the start and end meeting points; the app
adds the meeting points along the way as stops automatically, and the driver
can remove any they will not stop at (decision 11). Pick the date and
departure time; planned times at each stop are prefilled from typical driving
times and can be adjusted. Target: a trip posted in under a minute.

**C2. Segment prices (Must).** The app works out a price for each segment
from its distance. The driver sets one price level for the whole trip, from
free up to the cost-sharing cap, instead of editing segments one by one
(decision 12, [ADR 0012](../decisions/0012-trip-price-level.md)). The screen
shows what a passenger pays for the whole route and explains why there is a
cap.

**C3. Seats and booking mode (Must).** Seats offered (at most the vehicle's
seats). Instant booking or request and approval.

**C4. Trip preferences and notes (Should).** Luggage space, pets, smoking (no
by default), child seat available, music and chat level, plus a free-text note.

**C5. Manage my trips (Must).** Upcoming and past trips. A seat view per
segment shows who rides where. Edit a trip within the rules in
[pricing and seats](pricing-and-seats.md#trip-changes-after-bookings-exist);
cancel with a reason; passengers are notified.

**C6. Duplicate a trip or create the return trip (Should).** Copy a past trip
to a new date, or create the return trip with the stops in reverse order.

**C7. Accept or decline requests (Must).** In approval mode, the driver sees
the passenger's profile, segment and seats, and accepts or declines. Requests
expire if not answered in time.

**C8. Payouts to drivers (Must).** The driver sets up payouts with the
payment provider once (identity and bank account, held by the provider) and is
paid automatically after each trip.

## D. Passenger: search and booking

**D1. Search trips, including partial routes (Must).** From, to and date.
Results include every trip that passes through both places in the right order,
not only trips that start and end there. Searching Borgarnes to Blönduós finds a
Reykjavík to Akureyri trip that stops at both. Each result shows the departure
time at my boarding stop, my price for that part, the seats free on that part
and the driver's rating.

**D2. Trip details (Must).** Route on a map with all stops and times, my price,
the driver's profile and reviews, the vehicle (model and colour; registration
after booking), preferences and booking mode.

**D3. Book seats on the whole trip or only part of it (Must).** A passenger
joins between any two meeting points on the trip, in travel order, and pays
only the segments in between. Seats are counted per segment, so a seat freed at
one stop can be booked by someone else from there on (rules in
[pricing and seats](pricing-and-seats.md#seats)). Choose the number of seats,
see the total price and the cancellation rules, confirm. Instant bookings are
accepted at once; requests can include a short message to the driver. Either
way the passenger pays in the app once accepted (D7).

**D4. My bookings (Must).** Upcoming and past bookings with status, meeting
point directions and a link to the chat.

**D5. Cancel a booking (Must).** With a reason. Free, with a full refund, up to
15 minutes before my departure; the app shows the refund and how it affects my
reliability (weather and road closures don't count).

**D6. Help when nothing matches (Should).** Suggest the same route on nearby
dates and trips from nearby meeting points.

**D7. Pay in the app (Must).** When a booking is accepted, the passenger pays
in the app (card, Apple Pay or Google Pay through the payment provider) within
the payment window; the booking is then confirmed. Refunds follow
[pricing and seats](pricing-and-seats.md#payment-and-refunds) (decision 13).

**D8. Receipts (Must).** A receipt by email and in the app for every payment
and refund.

## E. Trip day

**E1. Reminders (Must).** The day before and about an hour before departure,
with directions to the meeting point.

**E2. "I'm here" check-in (Should).** One tap at the meeting point tells the
other side you have arrived. No location tracking.

**E3. Mark a no-show (Should).** After the planned time plus a grace period,
the driver can mark a passenger absent; the passenger can dispute it.

**E4. Trip completion (Must).** A trip completes automatically after its last
stop, which opens reviews.

## F. Communication

**F1. Chat (Must).** One conversation per booking between the driver and that
passenger. Text only. Phone numbers are never shared by the app; people may
share contact details themselves once the booking is confirmed.

**F2. Notifications (Must).** Push for every booking and trip event. Email for
confirmations, changes and cancellations. SMS only for sign-in codes and,
within 24 hours of boarding, for passengers whose trip is cancelled, moved by
more than 30 minutes, or whose meeting point changes, to control cost.

## G. Trust and safety

**G1. Ratings and reviews (Must).** After a completed trip, both sides rate
1 to 5 and can write a short review. Reviews appear when both have reviewed, or
after 14 days.

**G2. Report and block (Must).** Report a user, trip or message with a
category. Blocking hides both people from each other's searches and trips.

**G3. Reliability figure (Should).** Share of trips and bookings completed
rather than cancelled, on every profile. Weather and road-closure
cancellations, and passenger cancellations made more than 24 hours before
boarding, are excluded.

**G4. Safety information and trip sharing (Must).** A 112 link on trip
screens, SafeTravel information for remote routes, and "share trip details"
that sends the route, time, driver's first name and vehicle to a contact.

## H. Operator console (web)

**H1. Meeting points (Must).** Create, edit, activate, deactivate; review
problem reports; recompute distances.

**H2. Users, trips and bookings (Must).** Search and view; suspend and
reinstate users with a reason.

**H3. Reports and audit log (Must).** Report queue with actions (warn,
suspend, dismiss) and a log of every operator action.

**H4. Pricing and timing settings (Must).** Suggested rate, reference cost per
km, price step, booking cut-off, request expiry, with change history.

**H5. Beta metrics (Should).** Searches, share with results, booking requests,
bookings, cancellations, by corridor and week: the beta's exit criteria.

**H6. Message all beta testers (Could).** Send an announcement by push and
email.

**H7. Payments, refunds and payouts (Must).** See payments, refund a booking,
hold or release a payout, and handle chargebacks.

## I. Across the whole app

**I1. Icelandic and English (Must).** Every screen, email, SMS and push in both.

**I2. Accessibility (Must).** WCAG 2.2 AA: screen readers, large text,
contrast, touch targets.

**I3. Web app (Must).** The same app in the browser (see decision 5).

**I4. Works with poor mobile coverage (Should).** Booking details and meeting
point directions stay available offline once loaded; actions retry when the
connection returns.

**I5. Dark mode (Could).** Follows the phone's setting; easier on the eyes in
winter darkness.

## J. Beta

**J1. Beta access (Must).** Sign-up through invite codes from the waitlist, so
the beta stays on the launch corridors and with known testers.

**J2. In-app feedback (Must).** Send a note with an optional screenshot from any
screen; it lands in the operator console.

**J3. Usage analytics with consent (Should).** Anonymous usage events, only
with consent, to measure the beta's exit criteria.

## Decisions

Decisions 1 to 9 were accepted by Martin on 2026-11-13 as recommended;
decisions 10 to 13 are his own, from the same day, and he later changed
decisions 3 and 6.

| # | Question | Decision |
| - | -------- | -------- |
| 1 | Default booking mode in the beta (open question Q4)? | Request and approval by default; drivers can switch a trip to instant |
| 2 | Can passengers message a driver before booking? | No. A request can include a short message; full chat opens with the booking. Less spam and harassment |
| 3 | How is a driving licence confirmed in the beta? | A declaration only: the driver ticks "I declare that I hold a valid driving licence". No expiry date or spot checks (changed by Martin on 2026-11-13 from the recommended self-declaration with expiry date and spot checks) |
| 4 | Invite-only beta, or open sign-up limited to the launch corridors? | Invite codes from the waitlist |
| 5 | Is the web app part of the beta? | Yes for searching and booking, since Expo makes it cheap; driver flows are designed phone-first |
| 6 | Maximum number of stops per trip? | No limit; the app adds every meeting point on the way (changed by Martin on 2026-11-13 from the recommended 8) |
| 7 | How far ahead can a trip be posted? | 60 days |
| 8 | Should the app ever show a phone number? | No in the beta; chat only. Consider masked calling later |
| 9 | Minimum age (open question Q7)? | 18 |
| 10 | Can users suggest meeting points? | No. The operator curates every meeting point; users can report a problem with one |
| 11 | Does the driver pick the stops along the way? | No. The app adds the meeting points along the route automatically; the driver can remove any they will not stop at |
| 12 | Can the driver edit each segment's price? | No. One price level for the whole trip, from free up to the cap ([ADR 0012](../decisions/0012-trip-price-level.md)) |
| 13 | How do passengers pay? | Only in the app, from the beta: they pay when the booking is accepted; free cancellation with a full refund up to 15 minutes before departure ([ADR 0013](../decisions/0013-in-app-payments-only.md)) |

## After the MVP

Already planned for later phases (see the [roadmap](../strategy/roadmap.md)):

- Weather warnings and road closures on trips, with penalty-free cancellation
- Optional identity verification with Auðkenni
- Website with route pages for search engines
- Help centre and support contact
- A passenger service fee (open question Q5)
- Recurring trips for commuters
- Ride alerts for saved searches
- Passenger ride requests that drivers can answer
- Polish language
- Keflavík Airport flows that take flight times into account
- Live trip sharing with a contact
- Women-only trips, if the beta shows demand
- Saved favourite routes and meeting points
- Partner programmes (employers, universities, tourism)

Ideas parking lot (not planned): carbon savings per trip, Strætó timetable
connections, ferry connections (Herjólfur, Baldur, Norræna), corporate
accounts with invoicing, parcel delivery along trips, connecting two trips into
one journey.

## Spec order

Each spec is written, approved, planned and built in this order. Cross-cutting
features (I1 to I5) apply to every spec.

1. Sign in, profile, settings and legal acceptance (A1, A2, A4, A6)
2. Meeting points, place search and their admin (B1, B2, H1)
3. Driver setup and posting a trip with prices (A3, C1, C2, C3, C4)
4. Search and trip details (D1, D2, D6)
5. Booking and requests (D3, D4, C7)
6. Changes and cancellations (C5, C6, D5)
7. Chat, notifications and reminders (F1, F2, E1)
8. Trip day, reviews and reliability (E2, E3, E4, G1, G3)
9. Safety and moderation (G2, G4, H2, H3)
10. Operator settings and metrics (H4, H5, H6)
11. Privacy self-service (A5)
12. Beta access and feedback (J1, J2, J3)

Spec 13, payments, payouts and refunds (D7, D8, C8, H7), was added on
2026-11-13 when payments moved into the beta. It is written right after
spec 5.
