# One home and simpler flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One menu that never moves (Find, My rides, Offer, Profile), Find as
the home for everyone, and fewer steps to sign up, book and offer a ride.

**Architecture:** The root `Stack` keeps every screen that opens on top (a
trip, a booking, a posting step). A new `(tabs)` group holds the four main
screens, laid out with Expo Router's headless tabs (`expo-router/ui`), so
on phones the tab bar shows only on them. From `sidePanelFrom` (900) wide, a
top bar replaces the tab bar and sits above the root `Stack`, so it shows on
every screen. My rides merges bookings and driven trips in the app; the API
only gains a `when` filter and the seats taken on each stretch.

**Tech Stack:** Expo Router 58 (`Stack.Protected`, `expo-router/ui`), React
Native 0.88, react-native-web 0.21, Hono and Drizzle (API), Jest with RNTL
14, Vitest, Playwright.

**Spec:** [spec 16](../specs/2026-11-15-one-home-and-simpler-flows.md),
layouts approved by Martin on 2026-11-15 (canvas "ShareRide UX proposals").

## Global Constraints

- Six PRs, one per proposal, in the order below, each green in CI before the
  next starts. Each PR updates spec 16's status line, the amended spec's
  note, `CHANGELOG.md` and this plan's ticks.
- No new runtime dependency: `expo-router/ui` ships with `expo-router`.
  No ADR: the navigation stays Expo Router (ADR 0003) and no service or rule
  changes.
- Every text in `en.ts` and `is.ts`; keys as in spec 16, section 8.
- Tokens only (spec 15). Tab and top bar parts get rows in spec 15's
  component table in PR 1.
- Rules S1, S4, M1, R1.6 to R1.8, R3.1 and R3.2 do not change; no screen
  computes a price, seat count or deadline the API does not give.
- First names only. Nothing new collected; fixtures use the test people.
- Native reads the tab bar as `tablist` and `tab` with `selected`; the web
  reads both bars as `navigation` with links and `aria-current="page"`
  (react-native-web ignores `accessibilityState`).
- A main screen (a tab) has no Back button; a screen on top always has one.

## Review Focus

1. A signed-in account with sign-up steps left, opening any tab or address:
   goes to its next step (`nextRoute`), as today. Task 1.1 tests it.
2. An address opened directly, such as `/trips/{id}` on the web: Back
   leads to Find, never to an empty history. Task 1.1 tests it.
3. Text twice the usual size: tab labels stay whole, and the bar grows
   instead of cutting them. Task 1.2 tests it (jest's `fontScale` is 2).
4. A ride under way (got in, not out yet): it stays in Coming up and in Your
   next ride until its last stop passes, matching the API's rule for
   bookings. Task 2.1 and 2.2 test it.
5. A double tap on "Pay {total}", or the payment failing to start after the
   booking was made: one booking only, and "Not paid yet" with Pay. Task 4.2
   tests it.

## PRs

| PR | Spec | What | Tells the build thread |
| -- | ---- | ---- | ---------------------- |
| 1 | 3.1, 3.2 | The menu, signed-out tabs, Find as home | Yes: `menuTabs` is where a Messages tab goes |
| 2 | 3.3, 3.4, 3.2 item 2 | My rides, Your next ride, Profile rows | |
| 3 | 3.5 | Sign-up in three steps with the ride in view | |
| 4 | 3.7 | Trip page, Check and pay, You're booked | Yes: finish screens for the notification prompt |
| 5 | 3.6 | Offer opens the form, drafts, step 2 and 5 | |
| 6 | 3.8 | Results header, chips, place list, Settings, rows | |

Your next ride moves to PR 2, since it reads the same merged list as My
rides.

---

## PR 1: One menu and Find

### Task 1.1: Tabs group and routes

**Files:**

- Create: `apps/mobile/src/app/(tabs)/_layout.tsx`, `apps/mobile/src/navigation/menu.ts`
- Move: `app/index.tsx` to `app/(tabs)/index.tsx`; `app/profile/index.tsx`
  to `app/(tabs)/profile.tsx`; `app/bookings/index.tsx` to
  `app/(tabs)/my-rides.tsx`; `app/drive/index.tsx` to `app/(tabs)/offer.tsx`
  (contents as today, without their Back buttons; PRs 2 and 5 rebuild them)
- Modify: `app/_layout.tsx` (the group is open to everyone; `profile/edit`,
  `drive/*`, `bookings/[id]` and `trips/[id]/book` keep their guards)
- Modify: `auth/next-route.ts`, `drive/offer-ride.ts`,
  `driving/back-to-drive.ts`, and every `"/profile"`, `"/drive"` and
  `"/bookings"` link (grep them)
- Test: `apps/mobile/src/__tests__/menu.test.tsx`; update `welcome`,
  `onboarding`, `sign-in`, `my-bookings`, `driving`, `profile-and-settings`

**Interfaces:**

- Produces: `menuTabs: readonly { name: "index" | "my-rides" | "offer" | "profile"; href: "/" | "/my-rides" | "/offer" | "/profile"; label: MessageKey; icon: IconName }[]`
  in `navigation/menu.ts`, in spec order. A fifth tab is one more entry.
- Produces: `nextRoute(me: Me): "/onboarding/terms" | "/onboarding/profile" | null`
  (null when the account is ready). `offerRide` goes to `/offer`.
- Produces: My rides at `/my-rides?when=past`, as `/bookings?when=past` was.

- [x] **Step 1: Write the failing tests** in `menu.test.tsx`:
  - signed out at `/`: tabs Find, My rides, Offer, Profile in that order,
    Find selected;
  - signed out, My rides shows "Sign in to see your rides" and Sign in opens
    `/sign-in`; Offer shows "Driving somewhere? Share the empty seats in your
    car." and "Sign in to offer a ride" keeps the offer and opens
    `/sign-in`; Profile shows Sign in, the language switch, Meeting points
    and Terms, rules and privacy;
  - a trip opened from Find has Back and no tab list; Back brings the tab
    list back;
  - text typed in From is still there after going to Profile and back;
  - `renderApp("/trips/{id}")`: Back opens Find (Review Focus 2);
  - signed in, terms not accepted, `/my-rides` opens Terms (Review Focus 1);
  - signed in and ready, after sign-in the app shows Find, not My profile;
    with a kept offer, Offer.
- [x] **Step 2:** Run `pnpm --filter @shareride/mobile test menu`; expect failures.
- [x] **Step 3: Implement.** `(tabs)/_layout.tsx` renders `Tabs` with
  `TabSlot` and a `TabList` built from `menuTabs` (the visible bar is Task
  1.2's `TabBar`, passed as `asChild`). Signed-out content comes from one
  `SignInFirst({ title, body?, signInLabel?, onSignIn?, children? })` part
  in `navigation/sign-in-first.tsx`. The group's layout redirects to
  `nextRoute(me)` when it is not null, and once the account is ready takes
  the choice kept through sign-up (`navigation/kept-choice.ts`), whichever
  tab is showing. Visited tabs stay mounted, so they keep their state.
- [x] **Step 4:** Run the app tests, `pnpm check`; expect pass.
- [x] **Step 5:** Commit `feat(mobile): one menu with Find, My rides, Offer and Profile`.

### Task 1.2: Tab bar and top bar

**Files:**

- Create: `apps/mobile/src/navigation/tab-bar.tsx`, `apps/mobile/src/navigation/top-bar.tsx`, `apps/mobile/src/components/logo.tsx`
- Modify: `app/_layout.tsx` (top bar above the `Stack` when wide),
  `theme/tokens.ts` (`sizes.tab`, `sizes.tabPill`, `sizes.logoSmall`), spec 15 (rows `TabBar`, `TopBar`,
  `Logo`)
- Test: `navigation/menu.test.ts`, `__tests__/menu.test.tsx`

**Interfaces:**

- Produces: `TabBar()`: `surface`, 2 `border` top line, safe area at the
  bottom; each tab an icon (`iconSizes.button`) over its name in `caption`,
  at least 48 high, selected in `primary` with a `primarySoft` pill behind
  the icon, others `textMuted`.
- Produces: `TopBar()`: the `Logo` and "ShareRide" (`heading`) on the left,
  the four links in `label`, the selected one `primary` and underlined, and
  `LanguageSwitch` on the right. Links close the screens opened on top
  (`router.dismissAll()`) and then go to `href`, so the stack never grows
  from the bar.
- Produces: `Logo({ size: number })`: the car of `assets/logo/icon.svg` in
  `react-native-svg`, `accessible={false}`.

- [x] **Step 1: Write the failing tests:** at 390 wide, a tab list and no
  top bar; at 1280 wide (`Dimensions.set`), a navigation bar named "Main menu"
  with the logo, four links and the language, on Find and on a trip page,
  and no tab list; on a trip page at 1280, pressing Find shows Find with no
  Back; the selected tab has `primary` text; at `fontScale` 2 every label
  shows in full (`numberOfLines` not set).
- [x] **Step 2:** Run `pnpm --filter @shareride/mobile test menu`; expect failures.
- [x] **Step 3: Implement** as in Interfaces; the tab bar hides itself when
  wide (`useWideScreen`).
- [x] **Step 4:** Run the tests and `pnpm check`; expect pass.
- [x] **Step 5:** Commit `feat(mobile): tab bar on phones, top bar on wide screens`.
  Tasks 1.1 to 1.3 went in as one commit, as the tab group, the bars and
  Find only work together.

### Task 1.3: Find, the home

**Files:**

- Modify: `app/(tabs)/index.tsx`, `search/route-search.tsx` (seats in the
  form), `app/search/index.tsx` (its own seats stepper goes),
  `search/result-card.tsx` (tags and the whole-trip line)
- Modify: `packages/i18n/src/messages/en.ts`, `is.ts` (`nav.*`,
  `home.title`, `results.driverDrives`, new wording for `results.instant`
  and `results.request`, signed-out texts)
- Test: `__tests__/welcome.test.tsx`, `__tests__/search.test.tsx`

**Interfaces:**

- Consumes: `useRouteSearch(onSubmit)`; its `submit()` now takes no seats
  argument and the query carries `seats` (1 to 4).

- [x] **Step 1: Write the failing tests:** Find signed in shows the same
  page as signed out, without Sign in; the logo and "ShareRide" on top;
  "Find a ride" is the primary button; seats 2 in the form open results for
  2 seats; ride cards say "Book instantly" or "Driver approves"; a card for
  the driver's whole route has no "drives" line, and a part of it shows
  "Anna drives BSÍ → Akureyri"; Offer a ride at the bottom is secondary.
- [x] **Step 2:** Run `pnpm --filter @shareride/mobile test welcome search`; expect failures.
- [x] **Step 3: Implement.** The seats stepper moves into `useRouteSearch`,
  so Find and the search form both have it; results take the seats from
  the address, as before.
- [x] **Step 4:** Run the tests, then update the e2e journeys
  (`welcome`, `sign-in`, `booking`, `my-bookings`, `driving`,
  `post-a-trip`) for the new addresses and names; push and read the CI e2e
  job.
- [x] **Step 5:** Commit `feat(mobile): Find is the home for everyone`, open the
  PR with spec 16 and this plan, and tell the build thread about
  `menuTabs`.

## PR 2: My rides and Profile

### Task 2.1: API, my trips by time and seats taken

**Files:**

- Modify: `packages/contracts/src/trips.ts` (`myTripsRoute` query
  `{ when?: "upcoming" | "past" }`, default `upcoming`; `segments[].seatsTaken`)
- Modify: `apps/api/src/modules/trips/drafts.ts` (`myTrips(userId, when)`),
  `routes.ts`
- Test: `apps/api/src/modules/trips/drafts.integration.test.ts`

**Interfaces:**

- Produces: `upcoming` is drafts (newest change first) then published trips
  whose last stop is still to come, soonest first; `past` is published trips
  whose last stop passed, latest first. `seatsTaken` counts seats held
  (`holdsSeats`) on that stretch.

- [x] **Step 1: Write the failing tests:** a trip under way is upcoming; a
  finished trip is past and not upcoming; drafts only with `upcoming`; one
  booking for 2 seats on stretch 2 of 3 gives `seatsTaken` `[0, 2, 0]`; a
  cancelled booking counts 0.
- [x] **Step 2:** Run `pnpm --filter @shareride/api test:integration drafts`; expect failures.
- [x] **Step 3: Implement** with the same `plannedAt` rule as `myBookings`.
- [x] **Step 4:** Run the integration tests and `pnpm check`; expect pass.
- [x] **Step 5:** Commit `feat(api): my trips by upcoming or past, with seats taken`.

### Task 2.2: My rides and Your next ride

**Files:**

- Create: `apps/mobile/src/my-rides/rides.ts` (and its test), `apps/mobile/src/my-rides/ride-row.tsx`
- Modify: `app/(tabs)/my-rides.tsx`, `app/(tabs)/index.tsx` (Your next ride)
- Test: `__tests__/my-rides.test.tsx` (replaces `my-bookings.test.tsx`), `__tests__/welcome.test.tsx`

**Interfaces:**

- Produces: `type Ride = { kind: "booking"; booking: Booking; startsAt: Date; endsAt: Date } | { kind: "trip"; trip: MyTrip; startsAt: Date; endsAt: Date }`.
- Produces: `mergeRides(bookings: Booking[], trips: MyTrip[], when: "upcoming" | "past"): Ride[]`
  (drafts left out; soonest first, or latest first for past).
- Produces: `needsYou(ride: Ride, at: Date): "pay" | "answer" | null`
  (`pay`: `paymentDueAt` still to come; `answer`: `openRequests` above 0).

- [x] **Step 1: Write the failing tests:** `mergeRides` orders a booking at
  09:00 before a trip at 10:00, keeps a ride under way, leaves out drafts;
  My rides shows Needs you first ("Pay by 20:46 to keep your seat" with Pay,
  "Answer by 08:10 tomorrow, or the requests close" with Answer requests),
  then rows marked Passenger or Driving; a trip row says "1 of 3 seats
  booked" and the seats free on each stretch; Past has no Needs you; nothing
  coming up shows Find a ride and Offer a ride; Find shows Your next ride
  with its status and opens it.
- [x] **Step 2:** Run `pnpm --filter @shareride/mobile test rides my-rides welcome`; expect failures.
- [x] **Step 3: Implement.** Both screens load bookings and trips together
  and show one notice with Retry if either fails.
- [x] **Step 4:** Run the tests and `pnpm check`; update `e2e/my-bookings.spec.ts`
  into `my-rides.spec.ts`; expect pass.
- [x] **Step 5:** Commit `feat(mobile): My rides lists bookings and trips together`.

### Task 2.3: Profile rows

**Files:**

- Create: `app/drive/cars/index.tsx` (My cars: the car list from Ready to drive, with Add a car)
- Create: `app/profile/preview.tsx` (See it as others do: the driver part of a
  trip page, filled from `me`)
- Modify: `app/(tabs)/profile.tsx`
- Test: `__tests__/profile-and-settings.test.tsx`

- [x] **Step 1: Write the failing tests:** the first name, languages and
  "Member since"; Edit profile secondary; "See it as others do" link; rows
  My cars, Driving licence ("Confirmed" or "Not confirmed yet"), Meeting
  points, Settings, Terms, rules and privacy, each opening its screen; the
  Settings note under them; See it as others do shows the first name, the
  languages and "Member since" with no phone number.
- [x] **Step 2:** Run `pnpm --filter @shareride/mobile test profile-and-settings`; expect failures.
- [x] **Step 3: Implement** with a `Row` part (`components/row.tsx`):
  left-aligned title in `bodyStrong`, value in `small` `textMuted`, chevron,
  at least 56 high; add it to spec 15.
- [x] **Step 4:** Run the tests and `pnpm check`; expect pass.
- [x] **Step 5:** Commit `feat(mobile): profile with cars, licence and settings rows`.

## PR 3: Sign up without losing your ride

### Task 3.1: The ride card and steps

**Files:**

- Create: `apps/mobile/src/sign-in/kept-ride-card.tsx`
- Modify: `booking/pending-booking.ts`, `drive/pending-offer.ts` (look
  without taking), `app/sign-in/index.tsx`, `app/sign-in/code.tsx`
- Test: `__tests__/sign-in.test.tsx`

**Interfaces:**

- Produces: `peekPendingBooking(at: Date): Promise<PendingBooking | null>`,
  `peekPendingOffer(at: Date): Promise<boolean>`.
- Produces: `KeptRideCard()`: nothing when nothing is kept; "You're
  booking" with the date, times, route, seats, price and driver (from the
  trip details for the kept part); "Next: offer a ride" for an offer.

- [x] **Step 1: Write the failing tests:** step 1 titled "Sign in or create
  an account" with "Step 1 of 3" and the code text; with a kept booking both
  steps show the card and "We bring you back here after signing in."; an
  existing account goes back to the ride after step 2.
- [x] **Step 2:** Run `pnpm --filter @shareride/mobile test sign-in`; expect failures.
- [x] **Step 3: Implement.** The card loads the trip once and hides itself
  if it fails.
- [x] **Step 4:** Run the tests and `pnpm check`; expect pass.
- [x] **Step 5:** Commit `feat(mobile): sign-in keeps the ride in view`.

### Task 3.2: Step 3, about you

**Files:**

- Create: `app/onboarding/about-you.tsx`
- Modify: `auth/next-route.ts` (profile missing: `/onboarding/about-you`;
  only the terms missing: `/onboarding/terms`), `profile/profile-form.tsx`
  (language chips with "More languages"), `app/_layout.tsx`
- Remove: `app/onboarding/profile.tsx`
- Test: `__tests__/onboarding.test.tsx`

- [x] **Step 1: Write the failing tests:** a new account sees "Step 3 of
  3, Last step: about you" with the first name help, the app's language
  ticked, "Add a few words about you (optional)" folded, the two tick boxes
  and the Privacy Policy line; the button reads "Create account and book",
  "… send request", "… offer a ride" or "Create account"; it accepts the
  documents, then saves the profile; a failed save keeps the answers; a
  signed-in person with new terms sees only the terms.
- [x] **Step 2:** Run `pnpm --filter @shareride/mobile test onboarding`; expect failures.
- [x] **Step 3: Implement.** Accepting is skipped on a retry once it
  succeeded.
- [x] **Step 4:** Run the tests, `pnpm check`, update `e2e/sign-in.spec.ts`
  and `e2e/booking.spec.ts`; push and read the e2e job.
- [x] **Step 5:** Commit `feat(mobile): sign up in three steps`.

## PR 4: Book in fewer steps

### Task 4.1: Trip page with your part on top

**Files:**

- Modify: `app/trips/[id]/index.tsx`, `trip-details/trip-parts.tsx`
- Create: `trip-details/stop-choice.tsx`
- Test: `__tests__/trip-details.test.tsx`

- [ ] **Step 1: Write the failing tests:** the order is date and route,
  Your part (tag, Get in, Get out, each with Change, seats "2 free on your
  part" with minus and plus), Who you ride with, map and stops, the
  cancellation line; Change on Get in lists only stops before Get out, and
  choosing one updates the price in the bottom bar.
- [ ] **Step 2:** Run `pnpm --filter @shareride/mobile test trip-details`; expect failures.
- [ ] **Step 3: Implement.** Changing a stop replaces the address
  parameters, as tapping a stop does today.
- [ ] **Step 4:** Run the tests and `pnpm check`; expect pass.
- [ ] **Step 5:** Commit `feat(mobile): your part of the trip comes first`.

### Task 4.2: Check and pay

**Files:**

- Create: `booking/payment.tsx` (the payment part and test sheet, moved out of `app/bookings/[id].tsx`)
- Modify: `app/trips/[id]/book.tsx`, `app/bookings/[id].tsx`
- Test: `__tests__/booking.test.tsx`

**Interfaces:**

- Produces: `usePayment(bookingId: string): { start(): Promise<void>; sheet: Payment | null; notice: string | null }`
  and `<PaymentSheet />`, used by Check and pay and the booking page.

- [ ] **Step 1: Write the failing tests:** the date, the part with times,
  the driver and car, seats times price and total (or "Free"), the three
  ticks and the reliability note; instant: "Pay 5 000 kr." books
  and opens the payment sheet with no second Book; a double tap sends one
  booking; the booking made but the payment failing to start shows "Not
  paid yet. Your seat is held until 20:46." and Pay starts it again with
  the same booking (Review Focus 5); request: "Send request" and "You pay
  when Jón says yes."; free: "Book" confirms without a payment.
- [ ] **Step 2:** Run `pnpm --filter @shareride/mobile test booking`; expect failures.
- [ ] **Step 3: Implement** with the attempt key kept for the screen's life.
- [ ] **Step 4:** Run the tests and `pnpm check`; expect pass.
- [ ] **Step 5:** Commit `feat(mobile): check and pay in one step`.

### Task 4.3: You're booked and request sent

**Files:**

- Create: `app/bookings/[id]/booked.tsx` (move `app/bookings/[id].tsx` to `app/bookings/[id]/index.tsx`)
- Test: `__tests__/booking.test.tsx`, `__tests__/driver-requests.test.tsx`

- [ ] **Step 1: Write the failing tests:** after paying, "You're booked!",
  "Jón picks you up at 05:30 at Hlemmur", What happens next (three lines),
  Where to stand with Open in maps, "See it in My rides" (primary) and
  "Find another ride"; after a request, "Request sent" and "Jón has until
  20:46 to answer".
- [ ] **Step 2:** Run `pnpm --filter @shareride/mobile test booking driver-requests`; expect failures.
- [ ] **Step 3: Implement**; the screen replaces Check and pay, so Back
  goes to the trip.
- [ ] **Step 4:** Run the tests, `pnpm check`, update `e2e/booking.spec.ts`
  and `e2e/driver-requests.spec.ts`; push and read the e2e job.
- [ ] **Step 5:** Commit `feat(mobile): a clear finish after booking`; tell the
  build thread the finish screens' addresses.

## PR 5: Offer a ride

### Task 5.1: Offer opens the form

**Files:**

- Modify: `app/(tabs)/offer.tsx` (signed in: `RouteStep` with a draft
  card on top), `drive/offer-ride.ts`, `driving/back-to-drive.ts`
- Remove: the Ready to drive content (cars moved to My cars in Task 2.3)
- Test: `__tests__/driving.test.tsx`, `__tests__/post-a-trip.test.tsx`

- [ ] **Step 1: Write the failing tests:** Offer shows "Where are you
  driving?" straight away; with a draft, "Continue your draft: Mjódd → N1
  Selfoss" opens it at its first unfinished step; with two, the newest and
  "See all drafts"; after signing up from Offer, the form opens.
- [ ] **Step 2:** Run `pnpm --filter @shareride/mobile test driving post-a-trip`; expect failures.
- [ ] **Step 3: Implement** with `steps.ts` deciding the first unfinished step.
- [ ] **Step 4:** Run the tests and `pnpm check`; expect pass.
- [ ] **Step 5:** Commit `feat(mobile): offer a ride opens the form`.

### Task 5.2: Stop times folded, step 5 asks once

**Files:**

- Modify: `app/drive/trips/[id]/time.tsx`, `app/drive/trips/[id]/review.tsx`
- Test: `__tests__/post-a-trip.test.tsx`

- [ ] **Step 1: Write the failing tests:** step 2 shows "Times at the 3
  stops" folded with each stop's time and Change; Change and a stop time
  error unfold them; step 5 without a car starts with "Two things before
  you publish" (Add a car, Confirm), Publish trip waits and the line under
  it says why; no photo row.
- [ ] **Step 2:** Run `pnpm --filter @shareride/mobile test post-a-trip`; expect failures.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the tests, `pnpm check`, update `e2e/post-a-trip.spec.ts`
  and `e2e/driving.spec.ts`; push and read the e2e job.
- [ ] **Step 5:** Commit `feat(mobile): fold stop times and ask for the car once`.

## PR 6: Small fixes

### Task 6.1: Results header and chips

**Files:**

- Modify: `app/search/results.tsx`
- Test: `__tests__/search.test.tsx`

- [ ] **Step 1: Write the failing tests:** the header is one button named
  with the route, "Any day · 1 seat" and Change; it opens the filled form in
  place and Find a ride shows new results; "Sort: Earliest" is one chip
  opening the two choices; "Book instantly only" is its own chip.
- [ ] **Step 2–4:** Run `pnpm --filter @shareride/mobile test search`, implement, run again; expect pass.
- [ ] **Step 5:** Commit `feat(mobile): change the search from the results`.

### Task 6.2: Place list, Settings and rows

**Files:**

- Modify: `meeting-points/place-dropdown.tsx` (group results),
  `app/settings.tsx`, list rows in My rides and Settings (use `Row`)
- Test: `__tests__/welcome.test.tsx`, `__tests__/profile-and-settings.test.tsx`

**Interfaces:**

- Produces: `groupPlaces(results: PlaceSearchResult[]): { places: PlaceSearchResult[]; meetingPoints: PlaceSearchResult[] }`,
  keeping the API's order inside each group.

- [ ] **Step 1: Write the failing tests:** "akur" lists Akureyri under
  "Towns and areas" before Akureyri Airport under "Meeting points"; the
  sample tag shows once; Settings shows English and Íslenska side by side
  with the current one ticked, then Your account, Legal documents, Sign out
  and Sign out on all devices.
- [ ] **Step 2–4:** Run `pnpm --filter @shareride/mobile test welcome profile-and-settings`, implement, run again; expect pass.
- [ ] **Step 5:** Commit `feat(mobile): towns first, clearer settings`; mark spec
  16 and this plan done.
