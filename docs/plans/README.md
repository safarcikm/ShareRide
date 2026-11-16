# Plans

One implementation plan per approved spec, written with the Superpowers
`writing-plans` skill. See the [workflow](../engineering/workflow.md#plans).

File name: `YYYY-MM-DD-<topic>.md`, matching its spec.

A plan lists small tasks in order. Each task names the files it touches, the
test to write first, the code change, and the command that proves it works.
Tick tasks as they are completed so a new session can resume where the last
one stopped.

## Index

| Plan | Covers | Status |
| ---- | ------ | ------ |
| [Milestone 1: foundation and phone sign-in](2026-11-13-milestone-1-phone-sign-in.md) | Monorepo, CI, local development, Expo app on iOS, Android and web, phone sign-in ([spec 1](../specs/2026-11-13-sign-in-and-profile.md)) | Merged; Martin's phone check to do |
| [Visual design system](2026-11-13-visual-design-system.md) | Tokens, fonts, icons and restyled parts, then the app icon and splash ([spec 15](../specs/2026-11-13-visual-design-system.md)) | Approved; PR A merged, PR B in review |
| [Milestone 2: hosted and connected](2026-11-13-milestone-2-hosted-and-connected.md) | Staging in the EEA, real SMS, error tracking, meeting points on a map, Google and Apple sign-in, profile photo, development builds and Maestro | Approved; PRs 1 to 4 and SMS through Vonage merged, iPhone builds waiting for Apple, the rest after milestone 3 |
| [Milestone 3: offer and find rides](2026-11-14-milestone-3-offer-and-find-rides.md) | Sample meeting points and place search, cars, posting a trip with prices, search with partial routes, trip details, maps ([specs 2, 3 and 4](../specs/README.md)) | Merged; Martin's check on the web and an Android emulator to do |
| [Milestone 4: booking and requests](2026-11-14-milestone-4-booking-and-requests.md) | Booking and requests, paying with a test provider, deadlines, my bookings, the driver's requests ([spec 5](../specs/2026-11-13-booking-and-requests.md)) | Merged; Martin's check on the web and an Android emulator to do |
| [Front page](2026-11-15-front-page.md) | Route search, rides leaving soon, "Offer a ride" through sign-up ([spec 1](../specs/2026-11-13-sign-in-and-profile.md), [spec 4](../specs/2026-11-13-search-and-trip-details.md#38-rides-leaving-soon)) | Merged |
| [Milestone 5: chat and notifications](2026-11-15-milestone-5-chat-and-notifications.md) | Chat per booking, message all passengers, the outbox and worker, push, email, reminders and the Trip reminders switch ([spec 7](../specs/2026-11-13-chat-and-notifications.md)) | Merged; Martin's check to do: chat between two accounts on the web, a push on the Android test build (needs the expo.dev project ID and Firebase), and an email in the development outbox |
| [Milestone 6: changes and cancellations](2026-11-16-milestone-6-changes-and-cancellations.md) | Changing and cancelling a published trip, cancelling a booking with refunds by rule, SMS for last-minute news, post again and the return ([spec 6](../specs/2026-11-13-changes-and-cancellations.md)) | Merged; Martin checked it locally (2026-11-16) |
| [Milestone 7: trip day, reviews and reliability](2026-11-16-milestone-7-trip-day-reviews-and-reliability.md) | The trip day and "I'm here", trips that complete on their own, no-shows and a driver who didn't come with the operator's decision, reviews, public profiles with rating and reliability ([spec 8](../specs/2026-11-13-trip-day-reviews-and-reliability.md)) | In progress; Martin accepted the four choices (2026-11-16) |
| [Milestone 9: safety and moderation](2026-11-16-milestone-9-safety-and-moderation.md) | Emergency 112, before you go and sharing trip details, block and report, the operator's alerts, moderation actions with statements of reasons and appeals, suspension, and the console's reports, users, trips and bookings pages ([spec 9](../specs/2026-11-13-safety-and-moderation.md)) | Proposed; Martin's choices to make |
| [One home and simpler flows](2026-11-15-one-home-and-simpler-flows.md) | The menu and Find as home, My rides, sign-up in three steps, Check and pay, Offer opening the form, small fixes ([spec 16](../specs/2026-11-15-one-home-and-simpler-flows.md)) | Merged (PRs 1 to 6) |
