# Plan: one ride, one ticket

> **For agentic workers:** work through the pull requests in order, one at a
> time, each merged before the next starts (superpowers:executing-plans).
> Every numbered item is a step; tests come first in each. Read spec 31
> beside this plan: the plan says what is built where and in which order,
> the spec says what it looks like and why.

**Spec:** [spec 31](../specs/2026-11-26-one-ride-one-ticket.md) · **Date:**
2026-11-26 · **Status:** In progress

**Goal:** every screen of the member app follows the six rules of spec 31,
so a ride looks the same everywhere, the title says what is going on, what
needs me comes first and each screen has one main button.

**Architecture:** five new parts in `apps/mobile/src/components` carry the
rules (`RideTicket`, `Road`, `NeedsYouCard`, `ActionRows`, `ScreenHead`);
each feature folder keeps a thin file that turns its own data into a part's
props. What needs me and the busiest stretch are pure functions in
`packages/domain`. The API gains one field, `firstRequest`. The screens are
then rebuilt flow by flow on those parts; no screen gets a second way of
doing something.

**Tech stack:** as today: Expo and React Native Web with expo-router,
`@shareride/i18n`, the tokens of `@shareride/ui`, Jest with `renderApp`,
Playwright journeys. No new dependency, no migration, no new service.

Martin chose "One ride, one ticket" on the thread's card on 2026-11-26:
"I write the plan and rebuild the screens flow by flow as drawn, in about
12 pull requests. Nothing goes to puffinride.is without your go." Each pull
request goes to `main` and so to staging; production waits for him.

## Global constraints

- **No rule changes** (spec 31, section 4): booking, seats, prices,
  deadlines, cancelling and sign-in work as today. No function that is on a
  screen today is on none afterwards, and finding, booking, answering a
  request, messaging and "I'm here" take no more presses than today.
- **R31.1:** at most one filled button on a screen outside a
  `NeedsYouCard`. **R31.2:** a ride in a list or a summary is a
  `RideTicket`. **R31.3:** what cannot be undone is a red row, last in its
  card, and still asks first. **R31.4:** sun yellow only for what needs me
  now.
- **Tokens only:** new sizes go into `packages/ui/src/tokens.ts` and spec
  15's tables in the same pull request. No new colour value: `warningSoft`,
  `warning`, `people.sun`, `error`, `errorSoft`, `background`, `textMuted`.
- **Texts:** every text through i18n, every key in `en.ts` and `is.ts`.
  Existing keys keep their names; only values change. English says "ride"
  for what a driver offers and a passenger books; "trip" stays in "Trip
  day" only. An Icelandic title names a route with the arrow and never puts
  a place after a preposition.
- **Tests first** for every item; a screen test renders the whole app with
  `renderApp`; the web journeys keep passing with the new names.
- **Privacy:** the number plate shows only once the seat is confirmed, a
  phone number never shows, Report and Block stay two presses away at most.
- **Pictures:** each flow's pull request adds its screens as built to
  `docs/specs/images/one-ride-one-ticket/built/` as `.webp` (a phone in
  English and light, a laptop in English and light, a phone in Icelandic
  and dark), taken with the walk of `images/one-ride-one-ticket/src/walk/`,
  for Martin to compare with the drawings.
- **Docs travel with code:** the spec a screen belongs to (3 to 9, 15, 16,
  18) says what changed and points to spec 31; the changelog gets a line.

## Checked against the API (spec 31, section 6)

Everything the screens need is there today except two fields; the second
was found while building PR 5.

| Needed | Where it comes from | State |
| ------ | ------------------- | ----- |
| A seat to pay for | `Booking.status === "accepted"` and `paymentDueAt` | There |
| A ride on its trip day | `Booking.tripDay.phase` and `MyTrip.phase`, `"trip_day"` | There |
| Requests to answer | `MyTrip.openRequests`, `requestsCloseAt` | There |
| Who asks, for how many seats, between which stops | nothing in `GET /v1/me/trips` | **Missing:** `MyTrip.firstRequest`, PR 3 |
| A rating still to give | `Booking.review` (`mine === null` and now before `closesAt`) | There |
| Seats taken on each stretch | `MyTrip.segments[].seatsTaken` | There |
| A request's own deadline | `Booking.requestExpiresAt` | There |
| A conversation's ride, role and car | `Conversation.booking` | There |
| The colour of a driver's circle in the results | nothing in a ride found | **Missing:** `TripSearchResult.driver.colour`, PR 5 |

## Review focus

What the spec implies and a person will meet, most likely first. Each has
its test in the pull request named.

1. **Someone without a name.** A former member's `firstName` is null: a
   ticket's foot, "Dóra asks for 1 seat", a passenger's row and a
   conversation's head say what `firstNameOf` says today, never "null" or
   an empty line (PR 5 ticket and needs-me tests, PR 8, PR 10; the foot of
   `RideTicket` shows what its caller gives it).
2. **A deadline that passes.** A request or a payment whose deadline is
   behind the clock needs nobody; a ride that has completed is not on its
   trip day; two needs at the same minute keep the server's order (PR 3,
   `needs.test.ts`).
3. **Long names on a narrow phone.** "Kirkjubæjarklaustur, N1" at 360
   wide, and text at 200%: the place wraps under its own first line, its
   time stays on that first line, and the price stays inside the ticket (PR
   2 ticket test; PR 5 web journey measures that nothing in a ticket
   reaches past it). At 200% a word longer than a whole line of its place
   is broken inside the word, the only way it stays in the ticket; the
   journey lets that through and no other broken word.
4. **Several things at once.** Two rides need me: Find shows the soonest
   with "and 1 more", My rides lists both under Needs you, and a ride with
   two requests says "2 requests to answer", not a name (PR 5, PR 8).
5. **The odd ride.** A free ride says "Free" where the price stands; a
   ride with no stop between its ends shows only how long it takes, and
   with one says "1 stop"; a cancelled or declined booking shows no road
   and a quiet tag (PR 2, PR 7).

## The parts and their interfaces

Decided here so every flow uses the same names. All in
`apps/mobile/src/components/` unless said.

```ts
// tag.tsx: two more kinds, and an icon before the label.
export type TagKind = "positive" | "warning" | "info" | "womenOnly" | "plain" | "problem";
export function Tag(props: { label: string; kind: TagKind; icon?: LucideIcon }): ReactElement;

// card.tsx: `flush` (no padding, cut by its corners) and `mine` (a moss edge).
// avatar.tsx: `small`, 28, for a ticket's foot.

// ride-ticket.tsx: a flush Card.
export interface TicketEnd {
  readonly time: string; // "18:30"
  readonly place: string;
  /** Under the place, such as "1.3 km from Kringlan". */
  readonly under?: ReactNode;
}
export interface TicketTag { readonly label: string; readonly kind: TagKind; readonly icon?: LucideIcon }
export function RideTicket(props: {
  readonly day: string; // "Fri 27 Nov", or a caption such as "Your part of the ride"
  readonly tags?: readonly TicketTag[];
  readonly from: TicketEnd;
  readonly to: TicketEnd;
  /** Beside the line: "1 h 35 min", "2 h 25 min, 5 stops", "1 seat, 800 ISK". */
  readonly between: string;
  readonly price?: { readonly amount: string; readonly unit: string } | null;
  /** One line under the tear line; without it there is no tear line. */
  readonly foot?: ReactNode;
  /** A ride that is mine: a moss bottom edge. */
  readonly mine?: boolean;
  readonly fill?: boolean;
  readonly corner?: ReactNode;
  readonly marked?: boolean;
  readonly onShow?: () => void;
} & (
  /** One link or button, and then its name is required; without either it is not pressed. */
  | { readonly href: AppPath; readonly accessibilityLabel: string }
  | { readonly onPress: () => void; readonly accessibilityLabel: string }
  | {}
)): ReactElement;
/** The times, the line and the places alone: a request's part in a NeedsYouCard. */
export function Timetable(props: {
  readonly from: TicketEnd;
  readonly to: TicketEnd;
  readonly between: string;
  readonly price?: { readonly amount: string; readonly unit: string } | null;
}): ReactElement;
/** The foot's usual line: a picture and name at the left, something at the right. */
export function TicketFoot(props: { readonly start: ReactNode; readonly end?: ReactNode }): ReactElement;

// road.tsx: a picture with one line for screen readers, "Step 2 of 4: Confirmed".
// `current` counts from 0.
export function Road(props: { readonly steps: readonly string[]; readonly current: number }): ReactElement;

// needs-you-card.tsx: testID "needs-you-card". Either its lines or children.
export function NeedsYouCard(props:
  | {
      readonly icon: LucideIcon;
      readonly title: string;
      readonly detail?: string;
      /** Outlined on the last posting step, where Publish ride is the main button. */
      readonly action?: { readonly label: string; readonly outlined?: boolean } &
        ({ readonly onPress: () => void } | { readonly href: AppPath });
    }
  /** In place of the lines: the whole request on the driver's ride. */
  | { readonly children: ReactNode }
): ReactElement;

// row.tsx: today's Row gains an icon, a red look and three more kinds. A
// row is one kind: the props of another kind are a type error.
export function Row(props: {
  readonly title: string;
  readonly value?: string;
  readonly icon?: LucideIcon;
  /** Cannot be undone: red, no chevron. */
  readonly danger?: boolean;
} & (
  | { readonly onPress: () => void }
  | { readonly href: AppPath }
  | { readonly expanded: boolean; readonly onToggle: () => void; readonly children: ReactNode }
  | { readonly switched: boolean; readonly onSwitch: (on: boolean) => void }
  | { readonly shows: true } // only a value: not a button
)): ReactElement;
// action-rows.tsx: a Card of rows. The lines between them are the gaps, so
// a part that shows nothing leaves no line, and a row's focus ring is drawn
// inside it (theme/ring-inside.ts, `ringInside`), where the card cannot cut it.
export function ActionRows(props: { readonly children: ReactNode }): ReactElement;

// screen-head.tsx
export function ScreenHead(props: {
  readonly title: string;
  /** Small text over the title, such as the day on a ride's details. */
  readonly over?: string;
  /** At most one line under it. */
  readonly line?: string;
  /** Where Back leads when there is nothing to go back to; null for no Back. */
  readonly back?: Href | null;
  /** At most one round icon button at the right. */
  readonly action?: ReactNode;
  /** Before the title: the road of a posting step. */
  readonly road?: ReactNode;
}): ReactElement;

// testing/buttons.ts: R31.1 for a screen test.
/** How many filled buttons the screen shows outside a NeedsYouCard. */
export function filledButtons(): number;
```

`packages/domain`:

```ts
// rides/needs.ts
export type Need =
  | { readonly kind: "answer"; readonly by: Date } // by: the first request's deadline
  | { readonly kind: "pay"; readonly by: Date } // by: the payment deadline
  | { readonly kind: "tripDay"; readonly by: Date }; // by: when I get in or leave
export function bookingNeed(
  booking: {
    readonly status: BookingStatus;
    readonly paymentDueAt: Date | null;
    readonly phase: DayPhase | null;
    readonly boardsAt: Date;
  },
  at: Date,
): Need | null;
/** A ride with requests to answer and on its trip day needs an answer first. */
export function tripNeed(
  trip: {
    readonly openRequests: number;
    readonly requestsCloseAt: Date | null;
    readonly phase: DayPhase | null;
    readonly departsAt: Date;
  },
  at: Date,
): Need | null;
/** Soonest first by `need.by`; equal times keep their order. */
export function soonestFirst<T extends { readonly need: Need }>(items: readonly T[]): T[];

// trips/busiest.ts
/**
 * The fullest run of stretches among `from` to `to`: the first run of
 * stretches next to each other that all hold the most seats. `to` is the
 * position after its last stretch, so stops[from] and stops[to] name it.
 */
export function busiestStretch(
  seatsTaken: readonly number[],
  from?: number,
  to?: number,
): { readonly taken: number; readonly from: number; readonly to: number } | null;
```

`packages/contracts`, on `myTripSchema`:

```ts
/** The request that closes first, for "Dóra asks for 1 seat" (spec 31, section 6); null with none. */
firstRequest: z
  .object({
    firstName: z.string().nullable(),
    seats: z.int().min(1),
    from: localisedTextSchema,
    to: localisedTextSchema,
  })
  .nullable(),
```

## PR 1: this plan

Merged, #259. `docs(plans)`: this plan and its line in the plans index;
spec 31 becomes Approved, with decision 1 answered.

## PR 2: the parts and the tags

Merged, #260. `feat(look)`, spec 31, 3.3. Nothing but the status tags
changes on a screen.

1. **Tokens:** `sizes.roadCar` 60, `sizes.road` 12, `sizes.roadMark` 10,
   `sizes.ticketNotch` 16, `sizes.rowIcon` 36, `sizes.avatarSmall` 28, as
   the drawings have them. Spec 15's size table and component table get
   the five parts.
2. **`Tag`:** `plain` (`textMuted` on `background`) and `problem` (`error`
   on `errorSoft`), and `icon`. Test in `display-parts.test.tsx`: each
   kind's two colours in light and dark. The tokens test gets the two
   pairs at 4.5:1.
3. **Status tags** (decision 10), `booking/status.ts`: declined, expired,
   cancelled and withdrawn are `plain`; "Did not show up" is `problem`;
   "Driver said yes: pay" stays `warning`. Test: `statusTag` for every
   status. The two tags that do not come from `statusTag` follow: a
   cancelled ride I drive in My rides is `plain`, and "No-show" beside a
   passenger on the driver's trip day is `problem` (tests in
   `my-rides.test.tsx` and `trip-day.test.tsx`).
4. **`RideTicket`** with `TicketFoot`. Tests in a new
   `ticket-parts.test.tsx`: the day, both times and places, `between` and
   the price show; no price without one, "Free" where it is given as the
   amount; the tear line and its notches are hidden from screen readers;
   `mine` gives the `primary` edge; with `href` it is one link named by
   `accessibilityLabel`; a `corner` button does not press it; a long place
   keeps its time on the first line. Where room runs out, nothing is cut:
   tags go under the day, the price goes under the timetable at the right,
   the foot's end goes under its start, and a place breaks between words,
   never inside one. The title face has no digits of one width, so the
   times of every ticket stand in a column as wide as the widest time
   ("22:22"), kept by a text nobody sees or hears. `Timetable` is the
   times, the line and the places on their own.
5. **`Road`:** the road behind the car in `primary`, the rest in the
   scene's road grey with its dashed line; passed marks `surface`, those
   to come ringed in `control`; the car at `current`, from 0; its label is
   `road.step` ("Step {step} of {total}: {name}", "Skref {step} af
   {total}: {name}"). Tests: the label for the first, a middle and the
   last step; one car; the names of the steps hidden from screen readers.
6. **`NeedsYouCard`:** `warningSoft` face, `people.sun` edge and icon
   square, title in `text`, detail in `warning`. Tests: title, detail and
   one button; `outlined` makes it a secondary button; children take the
   place of the lines; contrast of `warning` on `warningSoft` and of `text`
   on `warningSoft` is 4.5:1 in both themes (tokens test).
7. **`Row` and `ActionRows`:** the icon in a soft square (`background`,
   and `errorSoft` for a red row), the five kinds. Tests in
   `display-parts.test.tsx`: a red row has no chevron and reads as a
   button; an unfolding row says whether it is open (`expanded`) and shows
   its children only then; a switch row is a switch; a `shows` row is not
   a button; a row takes the props of one kind only; the lines of
   `ActionRows` are its gaps, whatever its children are. Every use of
   `Row` today keeps passing unchanged.
8. **`ScreenHead`:** Back, the title at the left as the screen's heading,
   `over`, `line`, `action`, `road`. Tests: the title is the heading;
   without `back` there is no Back; the line under it is one text.
9. **`filledButtons`** in `testing/buttons.ts`: `Button` marks a primary
   button `testID="filled-button"`. Test: a screen with one main button and
   a `NeedsYouCard` with a button answers one.
10. **By eye:** a screen that shows the parts, kept beside the spec's
    other sources (`images/one-ride-one-ticket/src/built/`) and never a
    route of the app, pictured on a phone and a laptop in both themes into
    `built/parts-*.webp` and compared with the drawing of the parts.

## PR 3: what needs me

Merged, #261. `feat(rides)`, spec 31, 3.3 item 3 and section 6.

1. **Domain:** `rides/needs.ts` as above, exported from the package.
   Tests: each kind; a deadline at or behind `at` is no need; a completed
   or upcoming phase is no trip day need; a ride with a request and on its
   trip day needs an answer; `soonestFirst` across kinds, stable for equal
   times.
2. **Domain:** `trips/busiest.ts`. Tests: one stretch; a tie picks the
   first run; a run of equal neighbours is one run; within `from` and
   `to`; no stretches is null.
3. **Contract and API:** `firstRequest` on `MyTrip`; in
   `modules/trips/drafts.ts` the request with the earliest `expiresAt`
   among those still open, with its passenger's first name and its two
   stops' names; of two that close together, the one sent first. It comes
   from the same statement as `openRequests` and `requestsCloseAt`, so the
   three never disagree. Integration test, on the three together: none,
   one, and two requests (the one that closes first, and the one sent
   first at the same minute); an answered or expired request is not it; a
   missing name is null.
4. **Fake API and fixtures:** `testing/bookings.ts` and `testing/trips.ts`
   send `firstRequest`.
5. **App:** `my-rides/rides.ts` loses `needsYou` for `needOf(ride, at):
   Need | null`, which calls the domain. My rides and Find keep behaving
   as today (their tests pass unchanged, a ride on its trip day now also
   stands under Needs you). Until PR 5 gives it a card, such a ride's row
   says "Trip day" (`tripDay.title`, a text of today) and has no button of
   its own.
6. **Docs:** spec 16, 3.3 points to spec 31; API reference; changelog.

## PR 4: one name each

Merged, #262. `feat(texts)`, spec 31, 3.4. Values only; no key is renamed.

1. **A test first** in `packages/i18n` (`one-name.test.ts`): no English
   value says "trip" or "trips" as a word except in "Trip day", none is a
   button named "Search", and none posts a ride or a trip. Left out are
   the console's own texts (`admin.`, by prefix) and, by key, three on the
   marketing pages and About where "a trip you are making anyway" is the
   drive itself (`seo.findDescription`, `carpool.taxiAnswer`,
   `about.intro`); the other texts there follow the rule. The legal
   documents are not text keys and keep their words. Emails and text messages follow the rule
   after all: nearly all their words are the app's notices, so leaving one
   subject line out would only make them disagree.
2. **English:** "Offer a ride", "Publish ride", "Find a ride" (also the
   search button, which said "Search"), "Edit the ride", "Cancel the
   ride", "Post it again", "Post the way back", "My rides", "Check your
   ride". The drawings say "Share trip details" on a booking; the rule of
   3.4 wins. It reads "Share the ride's details", as "Share ride" is the
   product's old name, which a test keeps out of the texts (ADR 0039).
   "Why prices have a ceiling" says "a drive you're making anyway", since
   nobody makes a ride. Where "ride" alone would read as a passenger's
   seat, the text says whose it is: "You're the driver of this ride",
   "You haven't offered a ride yet", "You're already driving another ride
   at that time", "Kept 11 of 12 rides offered and seats booked". "Search
   again" on a booking that ended is "Find another ride".
3. **Icelandic:** "far" in "Finna far" and "Bjóða far", "ferð" for the ride
   itself; only what is inconsistent today changes: the search button
   ("Leita") says "Finna far", and the button that starts a ride on the
   driver's list ("Setja inn ferð") and "You can offer rides up to 60 days
   ahead" say "bjóða far".
4. **Tests and journeys** follow the new words.
5. **Docs:** glossary (ride and trip), changelog.

## PR 5: Find, search and results

`feat(search)`, spec 31, 3.5, 3.6, 3.16 item 1, and All rides, a place and
a meeting point (3.19).

1. **`search/result-ticket.tsx`** takes the place of `result-card.tsx`: the
   same data as a `RideTicket` (the booking mode as the tag beside the
   day, Share in the corner, the driver, rating or "New driver" and the
   seats left in the foot). Its tests are today's result card tests, on
   the ticket.
2. **`my-rides/my-ride-ticket.tsx`** takes the place of `ride-row.tsx`:
   "You drive" or "Passenger", the driver and the status tag for a
   booking, "1 of 3 seats taken" and what it needs for a ride I drive, a
   moss edge. A driver's ticket shows the two ends with ", 5 stops" and no
   price.
3. **`my-rides/needs-me-card.tsx`:** the soonest need as a `NeedsYouCard`
   ("Dóra asks for 1 seat", "2 requests to answer", "Bára said yes: pay to
   keep your seat", "Leaves in 40 minutes" or "Leaves at 18:30" from an
   hour before), with "and 2 more" opening My rides.
4. **Find, signed in:** "Hi Bára" at the left under the scene; the need,
   else my next ride; the search card; "Your next ride" when the need is
   about another ride; "Leaving soon". Signed out as today, with tickets.
   Tests: each kind of need; a next ride and no need; neither; a need and
   another next ride; one filled button outside the card.
5. **Find, wide:** the title and its line at the left of the scene, the car
   at the right; side column: the need or my next ride, or "How it works"
   in three lines with Offer a ride when signed out; then the map.
6. **`/search`:** the front page's search card under the title "Find a
   ride"; `search/index.tsx` keeps no form of its own.
7. **Results:** one row with the sorting, one Filters chip that unfolds
   today's filters and says how many are on, and the number of rides; day
   headings; the end card with `PuffinByPin`, "That's every ride found"
   and All rides.
8. **All rides, a place, a meeting point:** rides as tickets.
9. **Web journeys:** `search.spec.ts`, `welcome.spec.ts`, `my-rides.spec.ts`
   and `laptop.spec.ts` with the new shapes; `look.spec.ts` measures that
   nothing in a ticket reaches past it at 360 wide with a long place name,
   and that no line of the place ends inside a word.
10. **Docs and pictures:** specs 4, 16 and 18; `built/find-*`,
    `built/results-*`.

As built, what differs from the list above (spec 31 says the same where a
person sees it, in 3.5, 3.6, 3.10 and 3.16):

- A ride found gains its driver's `colour` in the API (the table above),
  as the foot of its ticket shows the driver's circle.
- `RideTicket` gains a `note` (the driver's whole ride, where the ticket
  is a part of it) and a `testID`; `Chip` gains an `icon` and a `name`.
- `my-rides/ride-row.tsx` and the texts only it used are gone
  (`myRides.answerBy`, `myRides.answer`, `myRides.freeEverywhere`,
  `myRides.freeOnStretch`, `myBookings.driverAndCar`, `search.submit`).
  My rides shows `MyRideTicket` from this pull request on; the rest of
  3.10 stays with PR 8.
- Sizes: `sceneLine` 132 (was 96), `sceneCarWide` 170 (was 116) and
  `scenePuffinSmall` 60, new.
- The journeys greet by name ("Hi Anna") where they looked for "Find a
  ride" after signing in.
- A place and a meeting point list no rides today, so item 8 changed All
  rides only.
- `lib/use-clock.ts`, new: `useClock()` gives a screen that counts the
  present moment, read again every half minute while the screen is in
  view and in front, and when it or the app comes back. Find and My rides
  use it; the booked seat and the trip day (PR 7) and the driver's ride
  (PR 8) take it for their titles and deadlines.
- `ResultTicket`'s `showDay` is `dayInName`: the ticket always shows its
  day, and the prop only puts it in the name where no heading says it.
- `sizes.wordsBeside` 144, new: the narrowest a line's words get before
  the button or link beside them goes under them (the end card, the offer
  in "How it works").
- The Filters chip has its icon and, like the sorting chip, a chevron: it
  unfolds what is under the row.
- From the code review, left where they belong: PR 7 takes `leavesText`
  out of `my-rides/need-texts.ts` for the title that counts down; PR 8
  adds `MyRideTicket` to `look.spec.ts`'s phone 360 wide; the rest is in
  PR 12's list.

## PR 6: a ride's details and booking a seat

`feat(booking)`, spec 31, 3.7, and Booking a seat and "You're booked"
(3.19).

1. **Head:** `ScreenHead` with the day over "Selfoss to Vík" and Share.
2. **Your part of the ride** as a ticket with Change at the right of each
   end, as drawn (a link in the end's `under` would stand under the place:
   the ticket of this screen gives each end its own line, with `Timetable`
   as its model), and the seats stepper in the foot; **the driver** card with the car and the
   preferences; **Where you sit**; **The whole route** with the map and
   the stops, mine marked; rows for free cancellation, Weather and roads
   and Report this ride. The bar keeps the price and Book.
3. **Booking a seat:** my part as a ticket at the top.
4. **"You're booked":** the ride as a ticket; centred, with its puffins.
5. Tests: the order of the parts; the rows open what the links open today;
   the stepper in the foot changes the bar's price; one filled button.
   Journeys: `trip-details.spec.ts`, `booking.spec.ts`.
6. **Docs and pictures:** specs 4 and 5; `built/ride-*`, `built/book-*`.

As built, what differs from the list above (spec 31 says the same where a
person sees it, in 3.7, 3.16 and 3.19):

- `RideTicket` gains three things: an end's `action` (Change, at the right
  of the place), `unfolded` (what a Change opens, inside the ticket and
  above the tear line) and `headed` (the caption is a heading where it
  names a part of its screen). The ticket of this screen is
  `trip-details/part-ticket.tsx`; `stop-choice.tsx` is gone, and so is
  `Halves`, which only this screen used.
- New parts of the screen: `trip-details/driver-card.tsx`,
  `trip-details/where-you-sit.tsx` (`SeatView` loses its legend, and the
  texts and the corner size only the legend used) and
  `safety/weather-roads-row.tsx`, which shows when the Safety links did. `preferenceNeeds` in `trip-parts.tsx` gives the preferences to the
  card and to a booking alike.
- The driver's card has no number of rides and no "what is checked": a
  ride's details do not carry them, and the spec adds no data.
- On a phone the paying line is a row that unfolds its sentence; a laptop
  keeps the sentence under the button. Pay in person has its own row.
- `Row` puts a value under its title where the two have no room on one
  line, on every screen (spec 15, 5.2). `sizes.carBeside` 176 and
  `carBesideLeast` 120, new.
- Room for long names, on every screen that has them: `ScreenHead` puts
  its button over a title whose longest word has no room beside it, and a
  ticket's end puts its `action` under its place.
- The ticket folds its stops when the part changes from elsewhere, and
  then no Change takes focus; Escape folds them on the web. A cancelled
  ride has no booking tag and nothing about cancelling a booking.
- With more than one seat the bar says what each costs ("2 × 2,900 ISK"),
  short, so the button keeps its place beside it on a narrow phone.
- Booking a seat's ticket shows the sum under the total for more than one
  seat only; the keys `booking.driver`, `booking.driverAndCar` and
  `booking.total` are gone with the lines they wrote, as are
  `trip.yourPart`, `trip.whoYouRideWith`, `trip.route`, `trip.wholeTrip`
  and `results.partOf`.
- "You're booked" shows `MyRideTicket`; `rideOfBooking` in
  `my-rides/rides.ts` makes its ride from a booking.
- Journeys changed: `trip-details.spec.ts` (Change on the ticket, where
  focus goes, Escape, then a stop of the route), `booking.spec.ts`,
  `reporting.spec.ts`, `laptop.spec.ts` and `look.spec.ts` (a ride's page
  between places with long names, 360 wide, with the text as set and
  twice as large). Pictures: `built/ride-*`, `built/book-*` and
  `built/booked-*`.
- Left for PR 12's list, from the code review: the driver's card has no
  heading, and in "Where you sit" the picture comes before the heading it
  belongs to; on Booking a seat nothing says "driver" beside the driver's
  name for a screen reader; a cancelled ride's page still has the seats
  stepper and "Where you sit".

## PR 7: a booked seat and the trip day

`feat(booking)`, spec 31, 3.8, 3.9, 3.16 item 2, and cancelling a booking,
the reports, rating and blocking (3.19).

1. **`booking/title.ts`:** `bookingTitle(t, locale, booking, at): { title,
   line }`, one for each state of today's `Status`: "Request sent", "Bára
   said yes: pay to keep your seat", "Your seat is confirmed", "Leaves in
   10 minutes", "Leaves at 18:30", the trip day's states, "How was your
   ride?", "Cancelled", declined, expired, withdrawn. Tests: every status,
   in both languages.
2. **The road:** Asked, Confirmed, Trip day, Done; an instant booking
   starts at Confirmed; none for a cancelled or declined booking.
3. **The screen:** head, reports and changes to the ride, road, ticket
   with "1 seat" and the price in its foot, the driver with Message,
   where to stand, the paying notice, rows with Cancel booking red and
   last. Wide: title, road, where to stand and the driver in the main
   column; the ticket and the rows in the side column.
4. **Trip day:** where to stand first, then the driver with the number
   plate as a tag; "I'm here" in the bar at the bottom, and at the top of
   the side column on a laptop; "The driver didn't come" takes its place
   when offered.
5. **The screens around it:** `ScreenHead`, the ride as a ticket where
   one shows, the main button in the bar and red when it cannot be undone.
   A red main button carries `testID="filled-button"` as a primary one
   does, so `filledButtons` counts it.
6. Tests: the title for each state on the screen; the road's step; the
   rows' order; one filled button. A new journey in `trip-day.spec.ts`
   reads the trip day's first screen on a phone and finds "I'm here"
   inside it.
7. **Docs and pictures:** specs 5, 6, 8 and 9; `built/booking-*`,
   `built/trip-day-*`.

## PR 8: the driver's ride and My rides

`feat(drive)`, spec 31, 3.10, 3.12, 3.16 items 3 and 4, and Edit trip,
cancelling a ride, sharing and messaging all passengers (3.19).

1. **The driver's ride:** head "Your ride to Vík" with what it needs; the
   ticket with the price for the whole way and the car; each request as a
   `NeedsYouCard` with the passenger, the time left, the part as a
   timetable, the message, "If you accept, 2 of 3 seats are taken from
   Mjódd to Selfoss" (`busiestStretch` over the part, with this request),
   Decline and Accept side by side, "Report Dóra"; passengers as unfolding
   rows with a round Message button, the rating under a row once the ride
   is done, "Message all passengers" last (a passenger's row holds a
   picture, a second line, a tag and a button beside what unfolds it,
   which is more than `Row`: it is a part of its own,
   `drive/passenger-row.tsx`, inside `ActionRows`); Seats in one line with "Each
   stretch" unfolding today's bars; rows with Cancel the ride red and
   last. Wide: as 3.16 item 3, with "Drive it again".
2. **The driver's trip day:** its list of stops stays; "I'm here" in the
   bar.
3. **My rides:** the title with Offer a ride as a small outlined button;
   tickets; the yellow tag in the foot of a ride that needs me (a
   passenger who has yet to pay needs nothing from the driver: on the
   driver's ride "Waiting for payment" is `info`, and `statusTag` learns
   who looks); under Past
   "Rate the driver" or "Rate your passenger" where a rating can still be
   given, opening the rating.
4. **My trips goes:** `/drive/trips` redirects to My rides; Back from a
   posting step and deleting a draft lead to Offer.
5. **Edit trip:** its parts as rows with what is set now; each part's
   screen keeps its fields.
6. Tests: a request card's parts and that Accept and Decline do what they
   do today; a passenger's row unfolds to See profile, Cancel booking and
   Report; the seats line names the busiest run; the redirect; the rating
   tags; one filled button outside the cards. Journeys:
   `driver-requests.spec.ts`, `my-rides.spec.ts`, `change-trip.spec.ts`,
   `cancel-trip.spec.ts`, `laptop.spec.ts` (the side column whole at 1280
   by 720).
7. **Docs and pictures:** specs 5, 6, 16 and 18; `built/driver-ride-*`,
   `built/my-rides-*`.

## PR 9: offering a ride

`feat(drive)`, spec 31, 3.11, and "Your ride is published" (3.19).

1. **`StepScreen`:** `ScreenHead` with the `Road` of five stops (Route,
   Time, Seats, Price, Check) in place of `StepProgress`, which goes.
2. **Step 2:** the time wheel for a day other than today opens at 08:00
   (`trips/clock-input.ts`). **Step 4:** the price for the whole way in
   kronur is the headline, the level in per cent its control.
3. **Check and publish:** the ticket as passengers will see it; one card
   of rows with Change (Route, Time, Price, Seats and booking, Car,
   Preferences and note: each a small caption over what is set, with
   Change at the right, as drawn, which is not `Row`'s shape: a part of
   its own, `drive/check-row.tsx`, inside `ActionRows`); what is missing as one `NeedsYouCard` with an
   outlined button for the next one; Delete draft red and last; Publish
   ride in the bar.
4. **Drafts on Offer:** rows in one card over step 1, the newest first,
   more than three under "Show all drafts".
5. **"Your ride is published":** the ride as a ticket; the share panel
   stays.
6. Tests: the road's label on each step; 08:00 for tomorrow and the next
   quarter for today; the rows open their steps; the card names what is
   left; every draft is listed; one filled button. Journeys:
   `post-a-trip.spec.ts`, `post-again.spec.ts`.
7. **Docs and pictures:** specs 3 and 16; `built/offer-*`.

## PR 10: Messages

`feat(chat)`, spec 31, 3.13.

1. **A conversation's top:** Back, the picture, the name with "Driver,
   White Toyota Yaris" or "Passenger", a menu button holding Report and
   Block; under it the ride as one line that opens the booking or the
   driver's ride.
2. **The field:** one line that grows, with a round send button; the quick
   answers stay as chips; the safety line stays first.
3. **The list:** each row shows the ride's day and route under the name.
4. Tests: Report and Block are reached in two presses; the ride line
   opens the right place for a driver and a passenger; sending still
   works. Journey: `chat.spec.ts`.
5. **Docs and pictures:** spec 7; `built/chat-*`.

## PR 11: Profile and settings

`feat(profile)`, spec 31, 3.14, 3.16 item 5, and a person's profile, Edit
profile, the pages under Settings, cars, licence, photo, Notices, feedback
and deleting the account (3.19).

1. **One page:** the person's card, then Driving, Account, Safety and
   privacy and Help as `ActionRows` with what is set now, and Sign out.
   "Sign out on all devices" moves to the end of Ways to sign in.
2. **New pages:** `/settings/language` and `/settings/notifications`;
   `/settings` redirects to Profile. The phone number is a `shows` row
   with its help under the group. "Shake to send feedback" is a switch row
   in the phone apps.
3. **A person's profile:** the person's card as on Profile; Report and
   Block as rows, red and last.
4. **Heads** at the left on the pages named above.
5. Tests: every row opens what it opens today; each of today's Settings
   functions is reached from Profile; the redirect; the language page
   changes the language. Journeys: `notification-settings.spec.ts`,
   `profile-photo.spec.ts`, `blocking.spec.ts`.
6. **Docs and pictures:** specs 1, 9, 11 and 16; `built/profile-*`.

## PR 12: the last pass

`feat(look)`, spec 31, 3.17 and section 9.

1. **R31.1 everywhere:** one screen test walks every signed-in address and
   counts the filled buttons.
2. **Titles:** every screen where you do something has `ScreenHead`; the
   centred ones are the ones 3.17 names.
3. **Laptop, dark, Icelandic:** each rebuilt screen looked at in the three
   pictures and against its drawing; what differs is fixed or named.
4. **Accessibility:** focus order follows the reading order on each
   rebuilt screen; the road and the tear line are skipped. With text at
   200% on a phone 360 wide, the labels of the tab bar are wider than their
   tabs (the page scrolls 4 px sideways) and Find's name line (the logo,
   the name, Beta and the language) is 85 px wider than the screen, so the
   language switch is reached by scrolling sideways. Both were there
   before, and were found by PR 5's `look.spec.ts`, which measures the
   sideways scroll with the text as set only: the labels fit their tabs,
   the name line wraps, and that journey measures it at 200% too.
5. **Sign-in** (3.15): if spec 29's screen has landed by then, the ride
   someone was about to book shows over the form as a ticket; if not, it
   is named as left for that spec's thread.
6. **Small things PR 5's code review named:** after "Show all rides"
   focus goes to the first ride; a chip is 40 high on the web, under the
   44 of a touch target; "New driver" is an amber tag, which rule 6 keeps
   for what needs someone; the reading order of the yellow card beside
   the rides on a laptop; All rides' centred title; Find on a phone moves
   down a ticket's height when my rides arrive after the rides leaving
   soon (room kept for them, or both shown together).
7. **Small things PR 6's code review named:** a heading for the driver's
   card, and the heading before the picture in "Where you sit"; on
   Booking a seat, "driver" beside the driver's name for a screen reader;
   a cancelled ride's page without the seats stepper and "Where you sit".
8. **Docs:** spec 31 becomes Built, with what differs from the drawings;
   spec 15 has the parts; the roadmap and the changelog.

## After merging

Production needs a release, on Martin's go. His steps then: walk a
booking as a passenger and a ride as a driver on his phone, and read the
Icelandic texts of section 8, which are a non-native's.
