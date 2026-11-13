# Features

**Owner:** Martin · **Last reviewed:** 2026-11-13

Features grouped by release. Each MVP feature gets its own spec in
`docs/specs/` before it is built. "MVP" means the closed beta (Phase 3).

## MVP (Phase 2 build, Phase 3 beta)

### Accounts and profiles

- Sign up and sign in with a phone number (one-time code); Apple and Google
  sign-in as alternatives
- Profile: first name, photo, short bio, languages spoken, verification badges
- Phone verification for everyone; driving licence confirmation for drivers
- Vehicles: make, model, colour, number of seats, registration number (shown to
  booked passengers only)
- Preferences: smoking, pets, music, conversation level, luggage space
- Delete account and export my data from the app

### Meeting points

- Map and list of curated meeting points with photos, directions, amenities
  and opening hours of nearby shelter
- Search by place name, accent-insensitive ("Hofn" finds "Höfn")
- Users can suggest a new meeting point; the operator approves it

### Trips (driver)

- Post a trip: choose meeting points in order, departure date and time,
  number of seats, booking mode
- Planned time at each stop, prefilled from typical driving times
- Suggested price per segment, adjustable within the allowed range
- Edit a trip; changes notify booked passengers; some changes need their
  consent
- Cancel a trip, with a reason
- Duplicate a past trip

### Search and booking (passenger)

- Search by from, to and date; results include trips that pass through both
  places in the right order, with seats free on that stretch
- Trip details: route on a map, stops and times, price for my segment range,
  driver profile and ratings, vehicle, preferences
- Book one or more seats on a segment range
- Booking modes: instant, or request and wait for the driver's approval
- Cancel a booking, with the cancellation policy shown before confirming

### During and after the trip

- Chat between the driver and each booked passenger
- Reminders before departure; "I'm here" check-in at the meeting point
- Mark no-shows
- Two-way ratings and short reviews after the trip, revealed when both sides
  have reviewed or after 14 days
- Report a user or a trip; block a user

### Notifications

- Push notifications, with email and SMS for critical messages (booking
  confirmed, trip cancelled, trip changed)
- Notification settings per category

### Operator (admin console)

- Manage meeting points (create, edit, deactivate, approve suggestions)
- Search users, trips and bookings; suspend users
- Report queue with actions and an audit log
- Basic metrics: searches, results, bookings, cancellations

### Cross-cutting

- Icelandic and English
- WCAG 2.2 AA accessibility
- Works on iOS, Android and the web

## Public launch (Phase 4)

- Weather warnings and road closures shown on affected trips, with
  penalty-free cancellation
- Optional identity verification with Auðkenni (Icelandic electronic ID)
- Website with route pages for search engines
- Help centre and in-app support contact
- Emergency information: 112 and SafeTravel links on trip screens

## Grow and monetise (Phase 5)

- In-app payments, driver payouts, service fee, refunds, receipts
- Recurring trips (commuters)
- Ride alerts for saved searches
- Passenger ride requests that drivers can answer
- Polish language
- Keflavík Airport flows that take flight times into account
- Live trip sharing with a contact
- Trip-level options such as women-only trips (if the beta shows demand)
- Partner programmes (employers, universities, tourism)

## Ideas parking lot

Not planned; recorded so they aren't lost.

- Carbon savings per trip and per user
- Integration with Strætó timetables for first and last mile
- Ferry connections (Herjólfur, Baldur, Norræna) as trip endpoints
- Corporate accounts with invoicing
- Parcel delivery along trips
