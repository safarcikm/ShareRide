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
| [Milestone 5: chat and notifications](2026-11-15-milestone-5-chat-and-notifications.md) | Chat per booking, message all passengers, the outbox and worker, push, email, reminders and the Trip reminders switch ([spec 7](../specs/2026-11-13-chat-and-notifications.md)) | Approved; all three choices accepted |
| [One home and simpler flows](2026-11-15-one-home-and-simpler-flows.md) | The menu and Find as home, My rides, sign-up in three steps, Check and pay, Offer opening the form, small fixes ([spec 16](../specs/2026-11-15-one-home-and-simpler-flows.md)) | Written; PR 1 next |
