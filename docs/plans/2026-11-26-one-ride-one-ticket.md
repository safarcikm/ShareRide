# Plan: one ride, one ticket

> **For agentic workers:** work through the pull requests in order, one at a
> time, each merged before the next starts (superpowers:executing-plans).
> Every numbered item is a step; tests come first in each. Read spec 31
> beside this plan: the plan says what is built where and in which order,
> the spec says what it looks like and why.

**Spec:** [spec 31](../specs/2026-11-26-one-ride-one-ticket.md) · **Date:**
2026-11-26 · **Status:** Built (2026-11-27; #257 to #278 and the closing
pull request), and on puffinride.is since that day

**Goal:** every screen of the member app follows the six rules of spec 31,
so a ride looks the same everywhere, the title says what is going on, what
needs me comes first and each screen has one main button.

**Architecture:** five new parts in `apps/mobile/src/components` carry the
rules (`RideTicket`, `Road`, `NeedsYouCard`, `ActionRows`, `ScreenHead`);
each feature folder keeps a thin file that turns its own data into a part's
props. What needs me and the busiest stretch are pure functions in
`packages/domain`. The API gains three fields of a ride I drive (the table
below). The screens are then rebuilt flow by flow on those parts; no screen
gets a second way of doing something.

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

Everything the screens need is there today except three fields; the second
was found while building PR 5 and the third while building PR 8c.

| Needed | Where it comes from | State |
| ------ | ------------------- | ----- |
| A seat to pay for | `Booking.status === "accepted"` and `paymentDueAt` | There |
| A ride on its trip day | `Booking.tripDay.phase` and `MyTrip.phase`, `"trip_day"` | There |
| Requests to answer | `MyTrip.openRequests`, `requestsCloseAt` | There |
| Who asks, for how many seats, between which stops | nothing in `GET /v1/me/trips` | **Missing:** `MyTrip.firstRequest`, PR 3 |
| A rating still to give, on a seat | `Booking.review` (`mine === null` and now before `closesAt`) | There |
| Passengers still to rate, on a ride I drove | nothing in `GET /v1/me/trips` | **Missing:** `MyTrip.toRate`, PR 8c |
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
the reports, rating and blocking (3.19). Built as two pull requests: **7a**,
the booked seat's own page and its trip day (items 1 to 4, 6 and 7), and
**7b**, the screens around it (item 5), so each can be looked at whole.

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
5. **The screens around it (7b):** `ScreenHead`, the ride as a ticket
   where one shows, the main button in the bar and red when it cannot be
   undone. A red main button carries `testID="filled-button"` as a primary
   one does, so `filledButtons` counts it. The screens: cancelling a
   booking, "The driver didn't come", answering a report, rating, blocking
   and reporting. The question about withdrawing a request, which 7a put
   in the bar, gets the red button here.
6. Tests: the title for each state on the screen; the road's step; the
   rows' order; one filled button. A new journey in `trip-day.spec.ts`
   reads the trip day's first screen on a phone and finds "I'm here"
   inside it.
7. **Docs and pictures:** specs 5, 6, 8 and 9; `built/booking-*`,
   `built/trip-day-*`.

As built in 7a, what differs from the list above (spec 31 says the same
where a person sees it, in 3.8, 3.9 and 3.16):

- `bookingTitle` also gives `over`, the day, for a driver who opens a
  passenger's booking: their title is the part ("Borgarnes to Blönduós")
  with the status as its line. `bookingRoad(t, booking)` gives the steps
  and where the booking stands, or null; `reviewOpen` says whether the
  passenger can review now. The title of a seat to pay for comes from
  the texts "What needs me" already has (`needs.saidYes`,
  `needs.payToKeep`), and the trip day's from `leavesText`.
- New parts: `booking/booking-ticket.tsx` (a `RideTicket` that is not
  pressed), `booking/withdraw.tsx` (`useWithdraw` and `WithdrawQuestion`,
  which the page keeps so the question stays open across the breakpoint).
  `WhereToStand` is drawn again, with the small map; "You're booked" shows
  it too.
- `DriverCard` gains `action` (Message, in the chevron's place), `plate`
  (the tag beside the car), `standing` (off for someone who has left) and
  `fill`. `DriverAndCar` in `trip-parts.tsx` is gone: nothing uses it.
- `ScreenHead` gains `outcome`: the title and its line take focus when
  they are the outcome of an action, as the status line did. For a
  booking that ended the line is why (`endedText` in `booking/texts.ts`),
  in the place of the notice that said so, and `more` holds what else a
  cancellation says (`endedLines`), so a screen reader hears "You
  cancelled this booking: Plans changed" and the refund with "Cancelled"
  (the journeys `cancel-booking.spec.ts` and `my-rides.spec.ts` check
  that focus holds them).
- From the code review, mended here: the question about withdrawing is
  only open on a request (it stayed in the bar, over Pay, when the driver
  answered meanwhile); a payment that did not go through says so over
  Pay, not at the top of the page; a seat still confirmed once its ride
  is over, which it is while a report that the driver didn't come is
  open, has that as its title and no road, in the place of "Anna picks
  you up at 10:00"; and focus goes back to the Withdraw row, and to what
  "I'm here" told, once, not each time the window crosses the breakpoint.
  Left for the last pass (PR 12): a ticket that is not pressed reads its
  two ends to a screen reader as times and places, with nothing that
  says which is where I get in; "Find another ride" is "Leita aftur" in
  Icelandic; and an Icelandic reader should look at the status words now
  that they are titles ("Afbókuð", "Útrunnin", "Dregin til baka").
- The page has one tree for a phone and a wide screen, as before, and
  what must survive the breakpoint lives in the page: the payment, the
  question about withdrawing, and that "I'm here" was said (`ImHere`
  takes `said` from a screen that moves it).
- No paying card: the deadline is the title's line and Pay is the bar's
  button. `ReviewSection` takes `offer`, off on this page, where the bar
  has "Rate the driver" and the title's line says until when.
- "The driver didn't come" is a link in the bar on the trip day, under
  "I'm here" while that can be pressed, and a row once the ride is over.
- The driver's view reads "Gunna pays you … when they get in." for a
  ride paid in person: the text was there since ADR 0038, in a branch of
  the old status that a driver never reached.
- The notifications prompt's buttons are outlined on every screen that
  shows it, so a screen's filled button is its main one.
- Texts: `road.asked`, `road.confirmed`, `road.tripDay`, `road.done`,
  `booking.seatHeldUntil`, `booking.seatHeldUntilTomorrow`,
  `booking.todayFrom` and `booking.timeFrom`, new; `booking.requestSent`,
  `booking.requestSentTomorrow`, `booking.payBy`, `booking.payByTomorrow`
  and `booking.payNow`, gone with the lines they wrote. One new size,
  `mapBeside` 104.
- Journeys changed: `trip-day.spec.ts` (the first screen holds the
  title, where to stand and "I'm here" with no scrolling, on a phone and
  on a laptop), `laptop.spec.ts` (Pay over the ticket in the side column,
  the rows in their order, the side column whole at 1280 by 720),
  `booking.spec.ts`, `driver-requests.spec.ts`, `reviews.spec.ts`,
  `trip-day-reports.spec.ts`, `chat.spec.ts` and `blocking.spec.ts`
  (Message, "Rate the driver", "The driver didn't come" and "Open in
  maps" are links). Pictures: `built/booking-*` and `built/trip-day-*`.

As built in 7b (spec 31 says the same where a person sees it, in 3.19,
R31.3 and decision 17):

- `Button` gains the variant `danger`: `error` fill, `onError` label, the
  primary button's 4 edge in the new colour `errorEdge`, and `errorHover`
  under the pointer (`onError` on it is 8.1:1 in light and 11.7:1 in dark,
  which `tokens.test.ts` keeps). It carries `testID="filled-button"`, so
  `filledButtons` counts it as the screen's one.
- **Which main buttons are red** (decision 17): "Cancel booking",
  "Withdraw request" (the question 7a put in the booking's bar) and
  "Block {name}". "Tell PuffinRide", "Mark as no-show", "Send answer",
  "Send review" and "Send report" stay moss. PR 8 looks at the no-show
  screen again with the driver's ride, and takes cancelling a ride.
- `ActionNotice` in `components/notice.tsx`: why the main button did
  nothing, over that button in the bar, with focus when it appears and
  when it says something new. A form keeps what it says with `useSaid`,
  which counts the presses, so the same words after another press take
  focus again. The six screens and the question about withdrawing use it;
  the notice at the end of their column is gone. Reporting has one notice
  for nothing chosen, a description that is too long (it said so only at
  the field) and what the server refused.
- `BookingHead` in `trip-day/report-screen.tsx` (`ScreenHead` over the
  `BookingTicket`) is the top of "The driver didn't come", "Mark as
  no-show" and answering a report; cancelling a booking builds the same
  from its own title. `BookingLine`, the small line with the day and the
  places, is gone, and `bookingWords` gives the day and the part to the
  rating's head (`over` and `line`), which has no ticket.
- Cancelling: the red main button over the outlined "Keep my booking"
  (`fill`), both in the bar.
- After the outcome the way back is the main button in the bar on the
  three screens that stay open: blocking ("Back to the conversation" or
  "Back to the profile"), reporting ("Back") and rating ("Back to the
  booking" or "Back to the ride"). Blocking's and reporting's outcome is
  `ScreenHead`'s title with `outcome`, with no Back in the head.
  `BlockPerson` takes `back` as an address for its head. A rating whose
  booking changed meanwhile shows `Changed`, with its outlined button and
  no bar, on sending as on opening.
- Blocked with rides still shared: each is a `BookingTicket` with its
  outlined button under it. Reporting: the community rules are a `Row` in
  `ActionRows`, and "Block {name} too" a red row, each with an icon.
- From the code review, mended here: the report's silent main button
  with a long description; the same words after a second press; rating's
  two screens for a booking that changed; comments that gave the old rule
  for red; tests that pin the moss of the five buttons that tell
  PuffinRide, the order of the rating's head, and "Keep my booking"
  waiting while the booking is cancelled. Left for the last pass (PR 12):
  see its item 9.
- No text key is new or gone. Two colours are new: `errorEdge` and
  `errorHover`.
- Tests: the head, the ticket and the one filled button in the bar on
  each screen; the red of the three; why nothing happened inside the bar;
  the outcome's focus and the way back as the main button. Journeys:
  `cancel-booking.spec.ts`, `reporting.spec.ts` and `blocking.spec.ts`
  read the bar, its alert and what has focus; `look.spec.ts` opens the
  screen that cancels a seat with long names on a phone 360 wide, with
  the text as set and twice as large, and measures the head, the ticket
  and the bar's two buttons (`ticketFit` in `support/layout.ts` now finds
  the screen of a part that is in the bar). Pictures: `built/cancel-*`,
  `built/driver-absent-*`, `built/rate-*`, `built/block-*` and
  `built/report-*`.

## PR 8: the driver's ride and My rides

`feat(drive)`, spec 31, 3.10, 3.12, 3.16 items 3 and 4, and Edit trip,
cancelling a ride, sharing and messaging all passengers (3.19). Built as
three pull requests, so each can be looked at whole: **8a**, the driver's
ride page and its trip day (items 1 and 2); **8b**, the screens that page
opens: Edit trip, cancelling a ride and the heads of sharing and
messaging all passengers (item 5); and **8c**, My rides and My trips
(items 3 and 4), which is the one that changes what the API gives.

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
   screen keeps its fields. **Cancelling a ride** takes what 7b gave
   cancelling a booking: the head, the ride as its ticket, the red main
   button over "Keep the ride" in the bar, and why nothing was cancelled
   over it. The no-show screen's main button, moss since 7b, is looked at
   again here beside the row that opens it (decision 17).
6. Tests: a request card's parts and that Accept and Decline do what they
   do today; a passenger's row unfolds to See profile, Cancel booking and
   Report; the seats line names the busiest run; the redirect; the rating
   tags; one filled button outside the cards. Journeys:
   `driver-requests.spec.ts`, `my-rides.spec.ts`, `change-trip.spec.ts`,
   `cancel-trip.spec.ts`, `laptop.spec.ts` (the side column whole at 1280
   by 720).
7. **Docs and pictures:** specs 5, 6, 16 and 18; `built/driver-ride-*`,
   `built/my-rides-*`.

As built in 8a (spec 31 says the same where a person sees it, in 3.9,
3.12 and 3.16, item 3):

- **The page** (`app/drive/trips/[id]/index.tsx`) is one tree for a phone
  and a wide screen, as a booked seat's: `ScreenHead` with `driverTitle`
  (`driver-trip/title.ts`: the title and the one line under it), then
  `Columns`. What must survive the breakpoint lives in the page: whether
  each stretch shows, where "I'm here" was said and whether focus went to
  what that told, what sharing the details did, and a draft being made
  (`usePostAgain` in `driver-trip/post-again.tsx` gives the two rows and
  their notice).
- **New parts**, all in `driver-trip/`: `ride-ticket.tsx`
  (`DriverRideTicket`, a `RideTicket` that is not pressed, with sharing
  as its `corner`), `request-card.tsx` (a whole request inside
  `NeedsYouCard`, which takes `children` for it), `passenger-row.tsx`
  (`PassengerRow` and `inRideOrder`; the plan named `drive/`, and the
  folder the page's parts already had is `driver-trip/`), `seats-card.tsx`
  (`SeatsCard`, over `Stretches` in `parts.tsx`). `people/profile-link.tsx`
  (`ProfileLink`) is the person's line as a link, for the driver's card of
  a ride's details and for who asks here.
- **Shared parts changed:** `Row` takes `accessibilityLabel`, for a row
  whose title needs a name to be understood out of its place ("See
  profile: Dóra"). `Tag` takes `onTint`, for a tag on a card in its own
  tint: "No reviews yet" on a request stands on white. `statusTag` learns
  who looks: "Waiting for payment" is `info` for the driver. One new
  size, `sizes.seat` (28), the square of a seat in the seats card.
- **The trip day** (`trip-day/driver.tsx`): `driverImHereStops` gives the
  stops the bar names, `DriverImHere` is the bar (the first open stop
  filled, the others outlined, what was said in a button's place with
  focus), and `DriverTripDay` keeps the stops, with `testID="said-here"`
  where the passengers were told. `ImHere` takes `label`, `opens` and
  `outlined`.
- **Rows:** safety's "Share the ride's details" and "Weather and roads"
  are rows of the ride's rows, and the Safety card is gone from this
  page. On a wide screen "Share this ride" is left out of the side
  column's rows, which keeps that column whole at 1280 by 720.
- **Someone leaving PuffinRide** (no `profileId`) shows no rating, no "No
  reviews yet", no reliability figure and no link, on a request and on a
  passenger's row.
- **Texts:** new `driverTrip.title`, `driverTrip.needsAnswer`,
  `driverTrip.wholeWay`, `driverTrip.confirmedCount`, `driverTrip.seats`,
  `driverTrip.seatsTaken`, `driverTrip.atBusiest`,
  `driverTrip.eachStretch`, `driverTrip.driveAgain`,
  `request.ifAcceptedBusiest`, `request.quoted` and `tripDay.opensAtStop`;
  gone with what they headed or named: `driverTrip.requests`,
  `driverTrip.stretches`, `request.ifAccepted` and `report.short`.
- **Gone, as nothing uses them:** the Safety card (`safety/trip-safety.tsx`;
  its links live with `WeatherAndRoadsRow`), `StandingLines` in
  `people/standing.tsx`, and `PassengersByPart` and `PostAgain`, which the
  page's new parts replace.
- **Tests:** the head's line for each state; the ticket; a request's
  parts, its answers and someone leaving; a passenger's row and what it
  unfolds to, with Cancel booking last; the seats line and each stretch;
  the rows and their order on a phone and a wide screen; the bar's
  buttons, what it says before and after, and focus. Helpers:
  `testing/driver-trip.ts` (`passengerRow`, `unfoldPassenger`) and
  `e2e/support/driver-ride.ts` (`passengerRow`). Journeys changed:
  `driver-requests.spec.ts`, `cancel-booking.spec.ts`,
  `cancel-trip.spec.ts`, `change-trip.spec.ts`, `chat.spec.ts`,
  `blocking.spec.ts`, `post-again.spec.ts`, `trip-day.spec.ts`,
  `trip-day-reports.spec.ts` and `laptop.spec.ts` (the side column whole
  at 1280 by 720, its rows in order, sharing from the ticket's corner);
  `look.spec.ts` opens the page with long names on a phone 360 wide, with
  the text as set and twice as large. Pictures: `built/driver-ride-*` and
  `built/driver-trip-day-*`.
- **From the code review** (nothing critical), mended in the same PR: a
  finished ride's passenger nobody reviewed in time had an empty band
  under their row (`showsReviews` beside `ReviewSection` says whether
  there is anything to frame); once "I'm here" was said the bar no longer
  said when the next stop opens (`driverImHereStops` keeps it under what
  was told); a passenger's row had no tint while pressed, and its padding
  did not unfold it; "Cancel booking" under a passenger was a button that
  opens a screen, now a link; "1 of 1 seats" in what accepting holds, now
  counted on the car's seats in both languages; while one of "Post it
  again" and "Post the way back" makes its draft the other neither looked
  nor read as waiting (`Row` takes `disabled` for a row that does
  something); the page asked for the cars on each 30-second refresh of
  the trip day (they load when the page comes into view); a ride without
  a time had an empty line under its title; "Share the ride's details"
  goes when the ride leaves, which the spec had as the last stop's time;
  `PartStop` and `ImHere`'s `accessibilityLabel` were left with no user.
  Tests added for those, for someone whose account is gone on a row and
  on a request, and for what "I'm here" told and a draft being made when
  the window crosses the breakpoint. `laptop.spec.ts` now walks the trip
  day too: the side column is whole in a window 800 high and 51 too high
  for one 720 high, where "I'm here" is still whole and first. That and
  three smaller things are on PR 12's list.

As built in 8b (spec 31 says the same where a person sees it, in 3.19):

- **Edit trip** (`app/drive/trips/[id]/edit/index.tsx`) is `ActionRows`
  of `Row`s with their `value`: Time, Stops (a row that only `shows`, its
  value the stops' lines from `timeLines`, one under the other), "Add a
  stop", "Remove a stop" (with a stop between the ends), Price, Seats,
  Car, How people book (`Zap` or `UserCheck`, as the tickets have it) and
  Preferences and note (the labels of `preferenceNeeds`, as a passenger
  reads them, in one line; then the note). `SummarySection` stays for the
  last step of posting and loses `more`, which only Edit trip used (it
  went with PR 9, where that step became rows too).
- **The head of every screen that changes a trip** is `TripHead` in
  `driver-trip/changes.tsx`: `ScreenHead` with the trip's day, time and
  route `over` the title. It takes the place of `BackButton` over
  `TripHeading` on Edit trip, the five screens of `ChangePartScreen`, the
  time, its check, adding and removing a stop, and `NotChangeable`.
- **Why nothing was saved** is `ActionNotice` over the main button, in
  the footer, on `ChangePartScreen`, the time, its check, and adding and
  removing a stop.
- **Cancelling a ride** (`app/drive/trips/[id]/cancel.tsx`): `ScreenHead`,
  `DriverRideTicket` with no corner (the cars are loaded for it; the
  screen stands without them), and in the footer `ActionNotice`, the red
  main button and "Keep the ride" outlined, both waiting while it is
  cancelled (`useSaid`).
- **Sharing** shows `DriverRideTicket` under `ScreenHead`; `TripSummary`
  stays for "Your ride is published" until PR 9 (where it went). **Messaging all
  passengers** gives its help as the head's `line`.
- **The no-show screen's main button stays moss** (decision 17; why is in
  spec 31, 3.19).
- **Texts:** none new and none gone: the links' texts ("Change the time")
  are still the titles of the parts' screens, and "Change the time" the
  button on a check that was refused.
- **Tests:** Edit trip's rows by what a screen reader hears, in order,
  with no filled button; a part's head and its notice in the bar;
  cancelling a ride's head, ticket, red main button over "Keep the ride",
  the notice in the bar and both buttons waiting; the heads of sharing
  (with the ticket) and of messaging all passengers. Journeys changed:
  `change-trip.spec.ts` (the rows by their names; at 360 wide nine rows,
  and no words past the card). Pictures: `built/edit-ride-*`,
  `built/cancel-ride-phone-light` and `built/share-ride-phone-light`.
- **From the code review** (nothing critical), mended in the same PR: a
  second press of "Save the change" with nothing changed, or of "Check
  the change" with no stop chosen, said nothing new, as the notice held
  plain words (`useSaid` in `ChangePartScreen` and where a stop is
  chosen); "This is what the ride has now" stayed after something was
  changed (the notice goes once what it is about is mended, and comes
  back only with a press); a note with contact details or too long made
  "Save the change" do nothing without a word (`ChangePartScreen` takes
  what the field says as `blocked`, from `noteProblem`, and says it over
  the button). Tests added for those; the refusals of the time's check,
  of adding and of removing a stop are now looked for in the bar; that
  cancelling and sharing stand without the cars; that a cancelled ride
  has no rows (the test looked for a link that no longer exists); and
  that each stop has a line of its own (a match takes line ends as
  spaces). The preferences' one line is `inOneLine` in
  `packages/i18n`, with a test in both languages; `stopsText`, which
  nothing used, is gone. Spec 28's picture of sharing on a laptop is
  taken again. Four smaller things are on PR 12's list.

As built in 8c (spec 31 says the same where a person sees it, in 3.10 and
3.11, item 6; section 6 for the data):

- **The API** (`trips/drafts.ts`): a ride in `GET /v1/me/trips` and
  `GET /v1/me/trips/{id}` gains `toRate`, `{ bookingIds, closesAt }` or
  null (`myTripSchema`): the ride's completed bookings whose 14 days run
  (`reviewsOpenSince` in `packages/domain`, beside `reviewClosesAt`),
  that the driver has not reviewed, with no report waiting and whose
  passenger has not left, in the order they were made. Read with the
  ride in `present()`. Integration tests in
  `reviews.integration.test.ts`.
- **My rides** (`app/(tabs)/my-rides.tsx`): `ScreenHead` with "Offer a
  ride" as its `action`, an outlined `Button` that takes an `icon` (new,
  before the label); the empty state keeps "Find a ride" alone.
  `ratingOf` (`my-rides/rides.ts`) gives the rating a ride still waits
  for, from `canRate` (`reviews/held-back.ts`) for a seat and from
  `toRate` for a ride I drove; `MyRideTicket` shows it as the yellow tag
  with a star where a need's tag stands. `canRate` is now the one rule
  for the tag, a booked seat's title and main button, and the button
  under a review (`reviewOpen` is gone). Coming up and Past stay chips:
  the drawing shows a control of two halves, which spec 31 does not ask
  for (PR 12's list).
- **Every ticket opens its ride** (item 3, changed after the code
  review): the first build opened the rating itself from a ticket with
  one rating to give, with a way back to My rides. That kept a finished
  ride's own page out of reach from My rides for up to 14 days (its
  messages, a report to make or answer, "Post it again"), so the ticket
  opens the booking or the ride, which already asks for the rating (3.8,
  3.12), and the rating's way back is as it was.
- **My trips goes** (item 4): `app/drive/trips/index.tsx` is a
  `Redirect` to `/my-rides`. `StepScreen`'s Back falls back to Offer;
  deleting a draft closes the steps down to Offer (`leaveSteps` with
  nothing to open); "See my rides" after publishing, and on sharing a
  ride that cannot be found, open My rides. `ShareTripCorner` goes with
  the cards that had it.
- **Drafts on Offer** (PR 9's item 4, built here, as "See all drafts"
  led to the page that goes): `trips/draft-rows.tsx` (`DraftRows`), one
  `ActionRows` of `Row`s under the heading "Drafts", each a link to the
  step where the draft was left, with "No time yet" under a route that
  has no time; three at first, the others under "Show all drafts", the
  card's last row, after which the first of them takes focus
  (`TakesFocus`, only from the press). `dayAtTime` in `trips/texts.ts`
  writes "Sunday 15 November at 09:00" for the rows, and for Edit the
  ride and `TripHead`, which each wrote it out.
- **Texts:** new, "Rate your passengers" and "No time yet";
  changed, "See all drafts" to "Show all drafts"; gone with My trips,
  `trip.myTrips`, `trip.post`, `trip.mine.published`, `trip.mine.empty`,
  `trip.mine.draftLine` and `trip.mine.requests`.
- **Tests:** the title's button on both lists and where it leads; the
  rating tags under Past, in order, and that each opens its ride, which
  asks for the rating; `/drive/trips` leading to My rides; the drafts'
  rows by what a screen reader hears, in order, three at most until
  "Show all drafts", where focus goes then and that only the press moves
  it; where Back, deleting a draft and "See my rides" lead. In the API,
  `toRate` on one ride and in the list of past rides. Journeys changed: `driver-requests.spec.ts` (the old
  address, then the ride from its ticket), `post-a-trip.spec.ts` (ends
  on My rides), `reviews.spec.ts` (each finds the ride under Past and
  rates from its page),
  `laptop.spec.ts` ("Offer a ride" on the title's line). Pictures:
  `built/my-rides-*` and `built/offer-drafts-phone-light`; spec 28's
  picture of a card in My trips goes.

## PR 9: offering a ride

`feat(drive)`, spec 31, 3.11, and "Your ride is published" (3.19).

1. **`StepScreen`:** `ScreenHead` with the `Road` of five stops (Route,
   Time, Seats, Price, Check) in place of `StepProgress`, which stays for
   signing up (`sign-in/sign-up-progress.tsx`, spec 29's screens).
2. **Step 2:** the time wheel for a day other than today opens at 08:00
   (`trips/clock-input.ts`). **Step 4:** the price for the whole way in
   kronur is the headline, the level in per cent its control.
3. **Check and publish:** the ticket as passengers will see it; one card
   of rows with Change (Route, Time, Price, Seats and booking, Car,
   Preferences and note: each a small caption over what is set, with
   Change at the right, as drawn, which is not `Row`'s shape: a part of
   its own, `trips/check-row.tsx`, inside `ActionRows`); what is missing as one `NeedsYouCard` with an
   outlined button for the next one; Delete draft red and last; Publish
   ride in the bar.
4. **Drafts on Offer:** rows in one card over step 1, the newest first,
   more than three under "Show all drafts". Built with My rides (PR 8c),
   as the page of drafts went with My trips; what is left here is their
   place once the step has its road and its title at the left.
5. **"Your ride is published":** the ride as a ticket; the share panel
   stays.
6. Tests: the road's label on each step; 08:00 for tomorrow and the
   first time one can leave at for today; the rows open their steps; the
   card names what is left; every draft is listed; one filled button.
   Journeys: `post-a-trip.spec.ts`, `post-again.spec.ts`.
7. **Docs and pictures:** specs 3 and 16; `built/offer-*`.

As built (spec 31 says the same where a person sees it, in 3.11 and
3.19):

- **`StepScreen`** (`trips/step-screen.tsx`): `ScreenHead` with `road`,
  the `Road` of `road.route`, `road.time`, `road.seats`, `road.price` and
  `road.check`, and a new `line` under the title, which the last step
  uses. The title is at the left on a phone too. On Offer `back` is
  null. `StepProgress` stays, for signing up.
- **Step 2** (`trips/clock-input.ts`): `firstDeparture(day, now)` is
  08:00 for a day other than today and `earliestDeparture(now)` for
  today or no day; `time.tsx` opens the wheel there.
- **Step 4** has only the new head: the kronur were its headline
  already. `trip.review.priceLine`, the price beside a step on a laptop
  (`priceSoFar`) and on Edit the ride, says kronur first now:
  "{price} the whole way · {level}".
- **Check and publish** (`app/drive/trips/[id]/review.tsx`):
  `PreviewTicket` (`trips/preview-ticket.tsx`), a `RideTicket` that is
  not pressed, with the foot of the results' ticket, `DriverFoot`,
  taken out of `search/result-ticket.tsx` for it; the driver's rating
  and colour come from their own public profile
  (`GET /v1/people/{profileId}`), and until that is read the foot says
  neither a rating nor "New driver". The step reads that profile, with
  the ride and what is still needed, when it opens and when the driver
  comes back to it, so the ticket does not blink after each change. Then
  one `ActionRows` of six `CheckRow`s (`trips/check-row.tsx`), links made
  by `fromReviewParams`. The Route and Time rows' words are
  `routeChecked` and `timeChecked` (`trips/check-texts.ts`): what is
  shown, and `spoken` for the link's name where that differs, as an
  arrow does (Icelandic shows one between the two ends,
  `trip.review.ends`, where a name after "til" would stand in the wrong
  case) and as the two lines of a ride that ends on a later day do. A
  draft with no times (`hasPreview`) has no ticket and no line about one.
  Opened by its address, the step's Back leads to the price; it led to
  the seats, the step before it until the seats moved before the price.
  `StillMissing` is one `NeedsYouCard` with an
  outlined button for the next of photo, car and licence; its title is
  `trip.review.missing` ("One thing before you publish"), as someone who
  has driven before can be asked too; it stands under the rows. Delete
  draft is a `danger` `Row` in an `ActionRows` of its own, replaced in
  place by a card that asks, with focus (`TakesFocus`), and focus goes
  back to the row when the draft is kept; the two `TakesFocus` have a
  key each, as one in the other's place is the same one to React and
  would not take focus again. `ActionNotice` says over
  Publish why it did nothing. `SummarySection`, `TickList` and
  `TripSummary` are gone with their last uses.
- **The picker of a meeting point** (`trips/point-picker.tsx`, PR 12's
  item 11): `ScreenHead` with `onBack` (new: Back closes what is not a
  screen, through `BackButton`'s `onPress`), the title at the left, and
  on Edit the ride's "Add a stop" the ride `over` it (`tripOver`, taken
  out of `TripHead`). Android's back closes it too (`BackHandler`, while
  its screen is the one in view), as it closes the list of places.
- **"Your ride is published"** (`published.tsx`): the centred title
  takes focus; `MyRideTicket` of `rideOfTrip` (`my-rides/rides.ts`);
  "See my rides" is the `main` button in the footer. A draft's address
  redirects to the step where it was left (`resumeStep`), and that of a
  ride that is not published or has left (`isChangeable`) to its page,
  so the share panel needs no check of its own (R28.4). The ride is
  read on focus (`useDraftOnFocus`), as the ticket leads to where it is
  changed and cancelled. No puffin: the screen had none.
- **Texts:** new, `road.route`, `road.time`, `road.seats`, `road.price`,
  `road.check`, `trip.review.line`, `trip.review.ends`,
  `trip.review.routeWithStops`,
  `trip.review.time`, `trip.review.priceWhole`, and the lines of the
  card, `trip.review.done.*` and `trip.review.left.*`; changed,
  `trip.review.priceLine` and `trip.problem.driver_not_ready` ("Do what
  is left on this page before you publish."); gone, `trip.review.note`,
  `trip.review.edit`, `trip.review.editLabel`, the tick list's
  (`trip.review.yourPhoto`, `photoDetail`, `yourCar`, `carDetail`,
  `licenceDetail`, `common.notDone`) and `trip.review.times` ("Date and
  times"): the row of "Your ride so far" is "Time" too, one name
  (3.4).
- **Tests:** in `post-a-trip.test.tsx` the road's label on each step,
  the preview ticket's words, the six rows by what a screen reader
  hears, the Time row for a ride that ends on a later day, the card for
  three, two and one thing with only the next one's button, its place
  between the rows and Delete draft, the red row asking first and "Keep
  it" with where focus goes, the published screen's ticket, which opens
  the ride, its title taking focus, the ride read again on coming back
  (a new time; cancelled, its page), the address of that screen for a
  draft and for a ride that is cancelled, has left or is done, Back and
  Android's back closing the picker, the driver on the preview (the
  name, "New driver", a rating, a hidden photo, a profile that cannot
  be read), a free ride, a draft with no times, and Back from the last
  step opened by its address;
  `check-texts.test.ts` for the Route and Time rows in both languages;
  `clock-input.test.ts` for `firstDeparture`; `edit-trip.test.tsx` for
  the ride over "Add a stop"; `navigation-parts.test.tsx` for `onBack`;
  `share-a-ride.test.tsx` for a ride that has left.
  The test app answers the driver's own public profile by default
  (`ownProfile` in `testing/app.tsx`); anyone else's is for the test to
  answer, as before. Journeys changed:
  `post-a-trip.spec.ts` in both languages (the road, the ticket, a row,
  the card as it counts down, the published ticket), `laptop.spec.ts`
  (the last step's main column; the columns are measured at the top of
  the step, as choosing a time scrolls it and the side column stays in
  view), `change-trip.spec.ts` (the price line). Pictures:
  `built/offer-*`, also looked at 360 and 320 wide in Icelandic.

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

As built (spec 31 says the same where a person sees it, in 3.13):

- **The top** (`chat/conversation-head.tsx`, `ConversationHead`): a
  `BackButton` that is `quiet` (new: no fill or edge, its chevron in the
  text's colour), the `Avatar`, the name as the screen's heading (the
  heading of a `part`, an h2, beside the list on a laptop), the line
  under it (`chat.driver`, `chat.driverWithCar` with `carText`, or
  `chat.passenger`) and a quiet `IconButton` named `chat.more` that says
  whether it is `expanded` (new: `aria-expanded`). Its row has its parts
  at the top (spec 31, 3.18), with Back and More each in a place as high
  as the picture (`avatarSize`), so the three are level. The menu is an
  `ActionRows` of two `Row`s
  that unfolds in place under that row. It is no layer over the screen:
  the app has none, and on Android a part takes no presses outside its
  parent's bounds. Each row closes the menu and opens its screen
  (`/report?kind=user`, `/bookings/[id]/block`), which reads the booking.
  `RideLine` is a link (`linkProps`) to `/bookings/[id]`, or to
  `/drive/trips/[id]` for the driver; it shows `formatShortDay` and
  the time, joined by `chat.rideWhen` as each language does, and
  `search.route`, and is named with `dayAtTime` and
  `trip.stretchSpoken`. Its words can shrink (`minWidth: 0`), so a name
  wider than the line breaks.
- **Where the top stands:** `Screen` has `header`, a bar over what
  scrolls (`screen-top-bar`: `surface`, a `border` line under it, and
  the safe area over it in its colour), and `overFooter`, between what
  scrolls and the bar, on `background` (`over-bar`). `Pane`
  (`chat/panes.tsx`) has `overFooter` too. The screen
  (`app/messages/[bookingId].tsx`) gives the top as `header` while the
  height the conversation has, less the top's, is at least
  `roomUnderTop` (400, a size in `packages/ui/src/tokens.ts`), and
  otherwise as the first thing in what scrolls, in a `Card`. That height
  is the `onLayout` of a `View` around the screen
  (`conversation-frame`): a phone's screen, or the pane on a laptop,
  which is shorter than the window by the app's bar and the card's
  edges. It is not the window's: React Native Web reads that from
  `visualViewport`, which a phone browser's keyboard makes shorter while
  it is up. `ConversationHead` says how tall it is through `onRest`,
  and only while its menu is closed, so opening the menu moves nothing.
  Neither takes 0 for a measure: on the web a screen under another, as
  under Report or the booking, is not drawn and says it is 0 high.
  Whether the menu is open is held by the screen (`menu`, `onMenu`), as
  a top that moves is drawn anew and would close it. In the card the top
  is 32 narrower than in the bar and so never shorter, and the two
  places cannot hand it back and forth. Until the conversation shows,
  and when it could not be read, the bar has Back alone.
- **At its end:** `useStickToEnd` followed what the scroll holds and
  where it was scrolled to. It now gives an `onLayout` too: when the
  scroll's own height changes, as when the field under it grows by a
  line, and it was at its end, it goes to its end again. Until then the
  last message slid under the bar as an answer was written. `Screen`
  calls it from its own `onLayout`; `Pane` takes it as it is. And the
  reader now leaves the end by going up, and only so. Any scroll short
  of the end counted as leaving it, and React Native Web says a scroll's
  sizes as they are when the scroll is heard (and once more 100 ms
  after the last one), which can be after what the scroll holds grew and
  before `onContentSizeChange` says so: the growth was then not
  followed. The look journey showed it, with the last line 73 under the
  quick messages once the top had moved into a conversation with text
  twice as large.
- **The field** (`chat/composer.tsx`): `MessageField` is a `TextInput`
  of several lines with `chat.placeholder` as its placeholder and its
  name, at least `inputHeight` (52) high and at most five lines with
  its padding and outline (`fieldMaxHeight`, 148), with corners of half
  its one-line height. On the
  web `useGrowingField` (`chat/growing-field.web.ts`) sets its height
  from `scrollHeight` after each change of the text or the window's
  width: React Native Web's `onContentSizeChange` reads `scrollHeight`
  too, which never gets smaller while the height is set, so the field
  would grow and not shrink. A phone's field does both by itself
  (`growing-field.ts` does nothing). `rows: 1` goes to the web only: on
  Android it would hold the field at one line. Send is an `IconButton`
  that is `filled` (new: the main button as a round one, `inputHeight`
  across, with the `buttonPrimary` edge, counted by `filledButtons()`)
  and can be `busy`. `QuickMessages` are the chips, and `Composer` the
  two, one over the other, for "Message all passengers". `onSend` says
  whether what was written can be cleared.
- **The safety line** (`chat/safety-line.tsx`): `ShieldCheck` and
  `chat.safetyTip` or `chat.safetyTipInPerson`, in `small` `textMuted`.
- **The list:** `ScreenHead` with `back={null}` on a phone, in place of
  the centred `Title`.
- **Texts:** new, `chat.more`, `chat.driver`, `chat.driverWithCar`,
  `chat.passenger` and `chat.rideWhen`. None is gone: `chat.message`
  still names Message on a booked seat.
- **Tests:** `chat.test.tsx` (the top in the bar with Back, the name
  and who they are; the menu's two rows, their colours and order, and
  that it closes; Report and Block in two presses each; Report alone
  once blocked; "Passenger", and "Driver" with no car; the ride's line
  for a passenger and for a driver; the safety line first and muted; the
  field's placeholder with no label, and Send as the one filled button,
  in the bar; the chips over the bar; a top too tall for the room it
  has scrolling with the conversation, and back, on a phone and in a
  laptop's pane shorter than its window; the menu not counted, and kept
  open when the top moves; no measure taken from a hidden screen; the
  conversation at its end again when the bar under it grows, and not
  when I read further up; at its end still when a scroll is told after
  the conversation grew, with only going up leaving it; the ride's day
  and time in Icelandic; the
  top's row and the ride's words; the same top in a laptop's pane; the
  field and Send of "Message all passengers"; the list's title at the
  left). `navigation-parts.test.tsx` for the quiet
  `BackButton`, the `filled`, `busy` and `expanded` `IconButton`, and
  `Screen`'s two new places. `blocking.test.tsx` and
  `reporting.test.tsx` press More first. Journeys: `chat.spec.ts` (the
  top in view after a message went, the ride's link, the menu, the
  field's height with one line, three lines and after sending, the
  driver's top in Icelandic), `blocking.spec.ts` (More first), and
  `look.spec.ts` (a conversation 360 wide with long names, as set and
  twice as large, and still at its end after the field grew;
  `twiceAsLarge` enlarges what is drawn after it too, as a top that
  moves is drawn anew). `confirmedBooking` takes the hour the
  ride leaves at, for a picture. Pictures: `built/chat-*` and
  `built/messages-phone-light`.

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

It is two pull requests. **11a** has items 1 and 2: Profile, the two new
pages, the redirect and "Sign out on all devices". **11b** has items 3
and 4: a person's profile, its preview and Edit profile with the person's
card, Report and Block as rows, and the heads at the left.

As built, PR 11a (spec 31 says the same where a person sees it, in 3.14):

- **Profile** (`app/(tabs)/profile.tsx`): `MyProfile` is a `ScreenHead`
  with `back={null}`, the person's card, and the groups, each a local
  `Group` (a `Heading`, an `ActionRows`, and at most one small line
  `under` it). It reads four things each time it comes into view
  (`useLoadedOnFocus`): my own public profile (`publicProfileRoute`, for
  the rating and what is checked), `driverReadinessRoute`,
  `listVehiclesRoute` and `listSignInMethodsRoute`. A row whose value is
  not read yet, or could not be, shows its title alone and still opens
  its page; one that cannot be read again keeps what it said
  (`useLoadedOnFocus` takes an `ok` for that, new). On a wide screen it is a `Screen` of `width="page"` with
  `Columns` (`sideAt="start"`, the card as `side`). Legal documents is a
  row that unfolds (`expanded`, `onToggle`) three `TextLink`s; Sign out
  is a `Row` with `onPress`, `disabled` while it signs out. `SignedOut`
  is as it was.
- **The person's card** (`people/person-card.tsx`, `PersonCard`):
  `firstName`, `colour`, `photo`, small `lines`, a `standing`
  (`PersonStanding`: the rating and the two checks) that is left out
  while undefined and keeps a line's room, hidden, while it is
  `"reading"`, one `action` at the right that wraps under the name
  (`sizes.wordsBeside` is the least the name keeps), and `children` under
  them. `RatingLine` can be `inline`, where it does not take the row's
  width, so the tags stand beside it. `PhotoControls` can `align` at the
  `start`, where its first button's words start at the card's edge. 11b
  uses the card for a person's profile.
- **The new pages:** `app/settings/language.tsx` (two `RadioCard`s, each
  with its `lang`, new, for a screen reader; it sets the language at
  once, saves it with `updateMeRoute`, one choice at a time so quick
  ones end on the last, and keeps the last one's `CallFailure` to say in
  the language just chosen) and `app/settings/notifications.tsx`
  (`NotificationSwitches`, now an `ActionRows` of two `Row`s that are
  switches, the line of what is always on in `small` under it, and the
  way to the beta news as a link row of a second `ActionRows`; a row
  says why it could not be saved through `onFailed`, and the notice
  stands under the card, once when both say the same). `app/settings.tsx`
  is a `Redirect` to `/profile`. Back from Beta news opened by itself
  leads to Notifications.
- **Closed while an account waits to be deleted:** the pages that close
  then are a list, `notWhileDeleting` in `navigation/member-screens.ts`,
  which the root layout reads. The two new pages are in it, and with them
  Blocked people, My reports and the privacy request, which were open to
  such an account until now. A test reads `app/settings/` and fails for a
  page that is not listed.
- **The email about a changed sign-in email** opens `/profile`, no longer
  `/settings`, which only leads on.
- **"Sign out on all devices"** (`sign-in/sign-out-everywhere.tsx`,
  `SignOutEverywhere`): a secondary button, its help and its notice, at
  the end of `app/settings/sign-in-methods.tsx`, also when the list
  could not be read.
- **"Shake to send feedback"** (`beta/shake.tsx`): `ShakeRow`, a `Row`
  that is a switch with its help `stacked` under its name, in place of
  `ShakeSwitch`; nothing on the web.
- **Back** on Email, Sign-in methods, Privacy and your data, Blocked
  people, My reports and My feedback falls back to `/profile`, and on
  Beta news to `/settings/notifications`; the page that adds an email from its link leads to
  Profile (`verifyEmail.toProfile`).
- **Texts:** new, `profile.editShort`, `profile.driving`,
  `profile.account`, `profile.safety`, `profile.help` and
  `verifyEmail.toProfile`. Gone: `settings.title`, `settings.open`,
  `settings.yourAccount`, `settings.addEmail`, `settings.changeEmail`,
  `profile.inSettings`, `verifyEmail.toSettings`, `safety.title` and
  `feedback.heading`. Eleven that named Settings say where on Profile
  (spec 31, section 8), three of them in emails
  (`announcement.turnOff`, `email.verifyBody`,
  `email.signInChangeBody`) and one in the console
  (`admin.emails.noAddress`). The legal texts are not touched.
- **For the tests:** `renderApp` answers `/v1/me/vehicles` and
  `/v1/me/sign-in-methods` by itself, and my own public profile when it
  is given a `me` (`answerOwnProfile`, which `signInByEmail` uses too).
- **Tests:** `profile-and-settings.test.tsx` (the title and the card;
  the rating and the checks as others see them; each group's rows with
  what is set now, in order; each row opening its page; the phone number
  that only shows; the documents unfolding; Sign out, also when
  PuffinRide cannot be reached; no main button on the page; the card in
  the side column on a laptop; the language's page, its two radios, a
  failed save, trying again and quick choices; the notifications' page,
  its rows, a failed and a quick change, and two that fail alike;
  `/settings` leading to Profile, signed in and out; the rows and the
  card keeping what they said when they cannot be read again, and the
  room of the rating's line; "Sign out on all devices" when the ways to
  sign in cannot be read). `delete-account.test.tsx` opens five pages of
  Profile for an account that waits, and `member-screens.test.ts` reads
  the folder. The tests of the pages Profile opens go through its rows.
  Journeys: `notification-settings.spec.ts`, `email.spec.ts`,
  `sign-in.spec.ts` ("Sign out on all devices" from Sign-in methods, and
  a sign-out from Profile that fails once and says why),
  `blocking.spec.ts`,
  `reporting.spec.ts`, `feedback.spec.ts`, the three of Privacy and your
  data, `provider-sign-in.spec.ts`, the laptop's Profile, and
  `look.spec.ts` (Profile 360 wide in Icelandic with a long name and a
  long email, as set and twice as large: the card, Edit, the picture at
  the name, the photo's button at the card's edge, and each group whole
  with nothing cut; `ticketFit` takes which of several parts, `nth`). It
  found a long email reaching past its row: a `Row`'s title and value
  are now at most as wide as the row (`maxWidth: "100%"`). Pictures:
  `built/profile-*`, `built/language-phone-light`,
  `built/notifications-phone-light` and
  `built/sign-in-methods-phone-light`.

As built, PR 11b (spec 31 says the same where a person sees it, in 3.19):

- **A person's profile** (`people/profile-view.tsx`, `ProfileView`): the
  `PersonCard` with the profile as its `standing` and "about" as its
  child; an `ActionRows` with `ReliabilityRow`, a `Row` that unfolds
  (`expanded`, `onToggle`) the three counts; `ProfileReviews`, untouched;
  and, for `others`, `Safety`, an `ActionRows` of three link rows (the
  rules, Report, and Block with `danger`, last). `nameAs` is gone: the
  name is the card's, never a heading. The page
  (`app/people/[profileId]/index.tsx`) has a `ScreenHead` with the new
  text `people.title`, outside `ProfileView`, so it stands while the
  profile is read and when it is not found.
- **The preview** (`app/profile/preview.tsx`): a `ScreenHead` with
  `preview.intro` as its `line`, then `ProfileView` of my own profile.
- **Edit profile** (`app/profile/edit.tsx`): a `ScreenHead`, a
  `PersonCard` with `PhotoControls` (`align="start"`) as its child, then
  `ProfileForm`. What the card says of me is `myCardOf(me, t, locale)`
  (`profile/my-card.ts`, new), which Profile and the photo's page use
  too.
- **Heads:** `ScreenHead` in place of `BackButton` and `Title`, with the
  help that was a `Body` under them (centred on most) as its `line`, on
  `drive/cars/index.tsx`, `drive/cars/new.tsx`,
  `drive/cars/[id].tsx`, `drive/licence.tsx`, `drive/photo.tsx`,
  `notices.tsx`, `feedback.tsx`, `settings/beta-news.tsx`,
  `settings/blocked.tsx`, `settings/email.tsx`, `settings/feedback.tsx`,
  `settings/password.tsx`, `settings/reports.tsx`,
  `settings/sign-in-methods.tsx`, the four of `settings/privacy/` and
  `account/deletion.tsx`. The cars' pages and the password's have no
  help, and deleting keeps what it explains as a `Body` under the head.
  A `Body` that says a list is empty is `align="start"`, and so is the
  help of `SignOutEverywhere`.
- **More than the head:** `settings/privacy/index.tsx` is an `ActionRows`
  of four link rows with icons, "Delete my account" with `danger` and
  last. `settings/privacy/delete.tsx` has its button as
  `variant="danger"`, and `ConfirmWithCode` takes a `danger` for the one
  that confirms; `Deleted` is a `ScreenHead` with an `outcome` (`of:
  "deleted"`) and "Close" as the `main` button in the `Screen`'s
  `footer`. `Thanks` on `feedback.tsx` and on `settings/privacy/ask.tsx`
  are a `ScreenHead` whose title is the thanks, with an `outcome` (`of:
  "sent"`), and one `main` button in the `footer`; "My feedback" is a
  `Row`. `RemoveCar` on `drive/cars/[id].tsx` is a `danger` `Row` in its
  own `ActionRows`; its question and, after "Keep it", the row are each
  in a `TakesFocus`, keyed apart. `drive/photo.tsx` has the `PersonCard`
  in place of an `Avatar`. `PhotoControls` lost its `align`: all three
  places have it at the start. A notice's title (`safety/notices.tsx`)
  and a piece of news's (`settings/beta-news.tsx`) take `sectionLevel`.
- **No new page,** so nothing new in `notWhileDeleting`. No change in
  the API, no migration, no new dependency.
- **Texts:** new, `people.title` ("Profile", "Prófíll"), and
  `feedback.thanksHelp`, the second half of `feedback.thanks`, which is
  now the title.
- **For the tests:** `findPersonCard(firstName)` in `testing/people.ts`
  waits for the person's card that holds a name, as the name is no
  heading any more.
- **Tests:** `public-profile.test.tsx` (the head with Back, also while
  it is read and when the person is not found; the name not a heading;
  the card's lines and its standing; the reliability figure as a row
  that unfolds; the preview's head and one title),
  `profile-safety.test.tsx` (the three rows as links of the last card,
  Block red and last; none on my own profile or the preview),
  `profile-and-settings.test.tsx` (Edit profile's head and card),
  `profile-photo.test.tsx` (a photo added and removed in Edit profile's
  card, with what is being written kept), `page-heads.test.tsx`, new
  (eighteen pages: the title in the head and not centred, the help as
  the head's line, what an empty list says, no centred text outside a
  button, at most one filled button, and Back leading up; and the
  photo's page with the person's card over its one main button),
  `driving.test.tsx` ("Remove car" a red row, last; focus on its
  question and back on the row; the head when the car is gone),
  `feedback.test.tsx` and `ask-about-my-data.test.tsx` (the thanks as
  the title with focus, the one main button in the bar, "My feedback" a
  row), `delete-account.test.tsx` (Privacy's rows with deleting red and
  last, the red buttons, the outcome as the head with focus and "Close"
  in the bar, the waiting page's head) and `privacy.test.tsx`. Journeys:
  `ask-about-my-data.spec.ts`, `delete-account.spec.ts` and
  `download-my-data.spec.ts` press Privacy's rows as links;
  `reviews.spec.ts` waits for the title "Profile" and the name in the
  card; `feedback.spec.ts` and `ask-about-my-data.spec.ts` find the
  thanks as the heading that has focus and the button in the bar;
  `driving.spec.ts` asks to remove a car and keeps it, following focus;
  `suspension.spec.ts` finds one first-level heading on Notices;
  `look.spec.ts` has a person's profile 360
  wide in Icelandic with a long name, as set and twice as large (the
  head, the card and the two cards of rows whole, Block last, the counts
  unfolded whole), on a person the journey makes up
  (`e2e/support/person.ts`, which answers the two reads of a profile in
  the browser). Pictures: `built/person-*`,
  `built/edit-profile-phone-light`, `built/privacy-phone-light`,
  `built/delete-account-phone-light`, `built/edit-car-phone-light`, and
  `built/sign-in-methods-phone-light` again.

## PR 12: the last pass

`feat(look)`, spec 31, 3.17 and section 9.

It is three parts. **12a** has items 1 and 2, with what they need
of items 6 and 15: one main button, in the bar, and the title at the
left, on every page (as built, below). **12b** has item 4 and what the
other items say about focus, screen readers, large text and short
windows, in two pull requests: the first has the second press (item 9)
and large text (items 4, 8 and 13; as built, below), the second focus,
screen readers and short windows (as built, below). **12c** has the
rest, in two pull requests: the first the small things of items 6 to 15
that are mended at the end (as built, below), the second items 3 and 5
and item 16, where spec 31 becomes Built and says what is left.

1. **R31.1 everywhere:** one screen test walks every signed-in address and
   counts the filled buttons. (Done, PR 12a.)
2. **Titles:** every screen where you do something has `ScreenHead`; the
   centred ones are the ones 3.17 names. (Done, PR 12a.)
3. **Laptop, dark, Icelandic:** each rebuilt screen looked at in the three
   pictures and against its drawing; what differs is fixed or named.
   (Done, PR 12c, its second pull request: one thing mended, the rest
   named in spec 31, 3.22.)
4. **Accessibility:** focus order follows the reading order on each
   rebuilt screen; the road and the tear line are skipped. With text at
   200% on a phone 360 wide, the labels of the tab bar are wider than their
   tabs (the page scrolls 4 px sideways) and Find's name line (the logo,
   the name, Beta and the language) is 85 px wider than the screen, so the
   language switch is reached by scrolling sideways. Both were there
   before, and were found by PR 5's `look.spec.ts`, which measures the
   sideways scroll with the text as set only: the labels fit their tabs,
   the name line wraps, and that journey measures it at 200% too. (The
   large text: done, PR 12b. Focus order: done in its second pull
   request where it went against the eye, on Profile's two columns and in
   "Where you sit"; Find's yellow card is left, item 6.)
5. **Sign-in** (3.15): if spec 29's screen has landed by then, the ride
   someone was about to book shows over the form as a ticket; if not, it
   is named as left for that spec's thread. (It had not: left for that
   thread, spec 31, 3.15 and 3.22.)
6. **Small things PR 5's code review named:** after "Show all rides"
   focus goes to the first ride (no longer applies: it opens the All
   rides page, whose title takes focus); a chip is 40 high on the web,
   under the 44 of a touch target (done, PR 12b: 44 on the web); "New
   driver" is an amber tag, which rule 6 keeps
   for what needs someone (done, PR 12c: a plain tag); the reading order
   of the yellow card beside the rides on a laptop (kept, PR 12c: it
   stands at their right and is read after them, as the eye meets it);
   All rides' centred title (done, PR 12a); Find
   on a phone moves
   down a ticket's height when my rides arrive after the rides leaving
   soon (room kept for them, or both shown together).
7. **Small things PR 6's code review named:** a heading for the driver's
   card, and the heading before the picture in "Where you sit"; on
   Booking a seat, "driver" beside the driver's name for a screen reader
   (these three: done, PR 12b);
   a cancelled ride's page without the seats stepper and "Where you sit"
   (done, PR 12c).
8. **Small things PR 7a's code review named:** a ticket that is not
   pressed says which end is where I get in and where I get out, for a
   screen reader (done, PR 12b); "Find another ride" in Icelandic ("Leita aftur" today,
   and spec 5's table says "Search again"; done, PR 12c: "Finna aðra
   ferð", as after "You're booked"); an Icelandic reader looks at
   the status words as titles ("Afbókuð", "Útrunnin", "Dregin til baka",
   "Mætti ekki"), and at "bílstjóri" beside "ökumaður"; with text at 200%
   on a phone 360 wide the road's four labels run into each other
   (`look.spec.ts` measures the booked seat's head, ticket, driver and
   where to stand there, not the road; the road: done, PR 12b).
9. **Small things PR 7b's code review named:** after an outcome the way
   back is the main button where the button just pressed was (blocking,
   reporting, rating, and "Find another ride" after withdrawing, from
   7a), so a second press meant for that one leaves the screen before
   the outcome is read: the bar ignores a press for a moment after its
   main button changes (done, PR 12b, for every main button and the
   other buttons of a bar). On a short window (a phone on its side, or a
   laptop zoomed until the window is 320 by 256) the bar takes much of
   the height, about 88 with one button and 148 with two, more with a
   notice: under a height to be chosen the bar joins the end of the page
   (done, PR 12b: under 480).
   After blocking, "You still have a booking together" stays the title's
   line once that booking is cancelled (done, PR 12c: the line counts
   what is still held). `BookingHead`, `bookingWords`,
   `backTo` and `leave` serve bookings, reviews and blocking from
   `trip-day/report-screen.tsx`: `@/booking/` is their home.
10. **Small things PR 8a's code review named:** on the driver's trip
    day, until the ride leaves, a laptop's side column is 51 higher than a
    window 1280 by 720 shows ("I'm here" over the ticket, the seats and
    four rows), so its last row is reached by scrolling the column: a
    row fewer there, or the seats under the passengers. Crossing the
    breakpoint folds "Weather and roads" again and drops why "I'm here"
    could not be said, as those live in their parts and not in the page.
    `onTripDay` is asked of `trip-day/driver.tsx` and
    `trip-day/passenger.tsx`, which hold components, by the two `title.ts`
    files: a home of its own without them. A cancelled ride's page has no
    pull to refresh, as before.
11. **Small things PR 8b's code review named:** (choosing the meeting
    point of a new stop kept the picker's own top, a Cancel cross and a
    centred title with no ride over it: done with posting's heads, PR
    9;) `cancel-trip.spec.ts` does not read the bar's notice
    or where focus goes, as `cancel-booking.spec.ts` does (done, PR
    12b), and
    `look.spec.ts` opens none of Edit the ride's screens with long names
    or large text; "day at time" has one helper since 8c (`dayAtTime`),
    which `driver-trip/title.ts`, `trip-so-far.tsx` and the post's text
    do not use yet; an `ActionNotice` given plain words
    does not say them again on another press, which is easy to get
    wrong: `useSaid` everywhere, or a rule for it (done, PR 12b: a
    rule, which the seven places with plain words keep).
12. **Left from My rides (PR 8c):** Coming up and Past are two chips,
    where the drawing has one control of two halves (kept, PR 12c: spec
    31, 3.22); the address
    `/drive/trips/new`, a first step outside Offer, which nothing in the
    app opens since My trips went; after "Show all drafts" focus goes to
    a view around the first draft that came, not to its link, so Enter
    does nothing until Tab (`TakesFocus`, the app's way everywhere: one
    fix for all; done, PR 12b); a draft whose stops were all retired reads " → "
    (done, PR 12c: "No route yet", and it opens at its route), and
    the Route row of its last step " to " (PR 9's `routeChecked`; left:
    that step is now reached by its address only).
13. **Left from offering a ride (PR 9):** on the last step, why
    deleting a draft failed is said over Publish, in the bar, away from
    the card that asked; the ride's ticket there is not pressed and
    does not say for a screen reader which end is which (item 8; done,
    PR 12b: "From" and "To"); the
    road has five names on a posting step, closer together than a
    booking's four, to measure with text at 200% (item 8; done, PR 12b);
    on a laptop
    the last step's side column holds Publish alone. From PR 9's code
    review: on step 1 the browser's Back leaves the step with the picker
    of a meeting point open (Android's back closes it), and the picker
    moves no focus when it opens or closes (the focus: done, PR 12b); a
    posting step opened by its
    address for a ride that is already published shows the step; at
    23:35 the wheel for today opens at 00:05, which has passed
    (`earliestDeparture` goes round midnight); `sign-in-methods.tsx` has
    two `TakesFocus` in one place with no key, as Delete draft had,
    which may not move focus either (to check, with spec 29's thread);
    `DriverFoot` serves the results and the preview from
    `search/result-ticket.tsx`, and has no home of its own. Icelandic,
    for a native reader: Check and publish as a whole; "stopp" on a
    ticket beside "viðkomustaður" in the rows; "Yfirfara" on the road, a
    verb among four nouns, which echoes the title "Yfirfara og birta";
    and what is read out with a name or a day after "til"
    (`trip.stretchSpoken`, `myBookings.times`), which is heard and not
    seen.
14. **Left from Messages (PR 10):** with text twice as large on a phone
    360 wide the field shows "Write a" of "Write a message" until
    something is written, as a placeholder of two lines has one; the
    field's five lines are counted in the text as set, so text twice as
    large scrolls inside it from the third line; the menu of the top
    closes by its button, not by Escape or a press beside it (done, PR
    12b, with Android's back), and its
    rows are a white card on the white bar, which an edge or a tint
    would set apart (done, PR 12c: the card stands on the page's
    colour); when the top moves between its bar and the
    conversation, as the window turns, the keyboard's focus in it is
    lost, and a top too tall is drawn in the bar for one frame before
    it is measured; on a window under 400 high the two bars still take
    about 150 (item 9; kept, PR 12b: a conversation's field stays under
    its messages at any height). To try on phones, in the apps (closed
    on Martin's word of 2026-11-27; spec 31, 3.22, says what he was
    asked and what stays unseen): the keyboard
    (Android makes the screen shorter, which may move the top into the
    conversation while writing; on an iPhone the messages keep about
    100 over it); the strip under a conversation that is loading or
    could not be read, which a `Screen` with a `header` colours as the
    bar; and whether VoiceOver says "Write a message" twice for the
    empty field, as its name and as the words in it. In the code:
    `IconButton`'s `quiet`, `filled` and `strong` as one `kind`, and a
    unit test for the web's growing field, which only the journeys
    try. Icelandic, for a native reader: "Bílstjóri · Hvítur Toyota
    Yaris", "Meira" and "Lau. 28. nóv. kl. 17:30".
15. **Left from Profile (PR 11a):** the legal texts say "Settings", the
    Terms twice and the Privacy Policy four times, in each language: a
    new version of either is Martin's to decide, and until then they
    name a place the app no longer has (done after the plan, on Martin's
    word of 2026-11-27: the Terms' version 3 and the Privacy Policy's
    version 4). On a phone "Member since November 2026" takes two lines
    beside Edit. Sign-in methods, spec
    29's page, has "Change email" in the middle and its other buttons at
    the left. Icelandic, for a native reader: "í Prófílnum, undir …" in
    the eleven texts that named Settings, "Breyta" on the card, and the
    groups' names. Found by PR 11a's review and left: on a laptop the
    keyboard reaches the groups before the person's card, which stands
    at the left (`Columns` with `sideAt="start"`; done, PR 12b); a tap
    on a
    notification about beta news or about feedback opens no page, as
    `notifications/paths.ts` names neither `/settings/beta-news` nor
    `/settings/feedback` (done, PR 12c); the photo's controls lose what they said when
    the window turns wide or narrow; a row that only shows, as the phone
    number, is read as two texts by a phone's screen reader (done, PR
    12b); the two
    languages are each a stop for Tab, with no arrow keys between them;
    and `notices`, `report`, the two `block` pages and `carpool-iceland`
    are in none of the root layout's lists, so the first four are open to
    an account that waits to be deleted (done after the plan, A59:
    `report` and the two `block` pages close, `notices` stays open, and
    a test asks of every page which list it is in). **Left from PR 11b:** the page
    an email's link opens (`verify-email.tsx`) keeps three centred
    titles; My cars lists its cars in a card of names, with no pictures
    and no `ActionRows`; Blocked people keeps an outlined "Unblock" on
    each line; "Save" on Edit profile and on the forms of a car, the
    licence, the email and the password is at the end of the form, not
    in the bar; the page an account that waits to be deleted lands on
    (`account/deletion.tsx`) keeps its two buttons in the column; the
    button that confirms removing a car is outlined, as a filled red one
    would be the page's second filled button beside "Save"; and outside
    its card "Sign out on all devices" is centred over help that starts
    at the left. Found by PR 11b's review and left: main buttons in the
    column and not in the bar ("Delete my account", which has no `main`;
    "Add a car" while there is none; "Add email" on
    `settings/privacy/ask.tsx` and `settings/password.tsx`; "Done" after
    a saved password; the photo page's `main` button, which
    `PhotoControls` renders, with "Take a photo" and "Remove photo"
    under it in the phone apps); `ConfirmWithCode` is a column of three
    buttons, on deleting, a new file, the email and the password; two
    filled buttons can show on `settings/privacy/download.tsx` ("Download
    the file" while "Make my file" is confirmed) and on Notices (each
    `Appeal` opens by itself); what must be settled before deleting
    (`settings/privacy/delete.tsx`) is a plain `Card` of rows with no
    pictures; on a person's profile the name looks like a heading and is
    plain text, so a screen reader's list of headings has "Profile" and
    "Reviews" only (done, PR 12b: a heading); "My feedback" after the thanks is a button that
    navigates; no journey presses the rules, Report or Block on a
    profile; the two small lines of the person's card are built alike
    in `profile/my-card.ts` and `people/profile-view.tsx`. Icelandic,
    for a native reader: "Prófíll" as the title of a person's profile.
    **Of these, PR 12a did** the main buttons in the bar, the code's
    form, the two filled buttons, My cars' rows, the page an account
    that waits lands on and the page an email's link opens. **It kept**
    Blocked people's outlined "Unblock" and the outlined button that
    confirms removing a car, and says why (spec 31, 3.19). The rest is
    still left.
16. **Docs:** spec 31 becomes Built, with what differs from the drawings;
    spec 15 has the parts; the roadmap and the changelog. (Done, PR 12c,
    its second pull request.)

As built, PR 12a (spec 31 says the same where a person sees it, in 3.17,
3.19 and R31.1):

- **The walk** (`__tests__/every-page.test.tsx`, new): 86 pages and
  states a signed-in member opens, each with the answers it reads. One
  test holds the list against the files under `src/app`: a page is
  walked, or named in `notWalked` with why (the layouts, sign-in and
  onboarding, which are spec 29's, the public pages, and pages that only
  lead on). For each page: at most one filled button outside a
  `NeedsYouCard`, tall and in the bar, or where the page says (`button`:
  the search card, under the puffin); the title not centred and in the
  `ScreenHead`, or centred where 3.17 says (`centred`); and no centred
  text under a title at the left but what a pressed thing says, the
  words beside a puffin, and the four kinds `centredToo` names, each on
  the pages it names (`on`). Each page says what its main button is
  (`main`, or null for none), so a page whose button is lost fails; two
  states of one address with the same title and button each name words
  only they show (`shows`). It looks at `textAlign`, not at a block
  centred by its box.
- **`InBar`** (`components/screen.tsx`): a part of the page puts what it
  holds in the `Screen`'s bottom bar. The screen keeps a slot
  (`BarSlotContext`) that only the bar (`BottomBar`) listens to, so a
  part that puts its button there again each time it is drawn draws
  nothing else again. The screen's own `footer` comes first. With no
  `Screen` around it, what it holds stays in place. What is in the bar
  is drawn by the screen, so it reads no context a part between the two
  provides. The bar listens from its layout effect on and looks again
  there, so a screen's first frame has its bar; `useSyncExternalStore`
  would listen only after that frame (no test can see a frame).
- **In the bar with `InBar`:** `ProfileForm` with the new `inBar` (Edit
  profile; onboarding's form is as it was), `CarForm`,
  `ConfirmWithCode` with the new `inBar`, `PhotoControls` when
  `prominent`, `AppealForm`
  (`safety/notices.tsx`), and the buttons of `settings/email.tsx`,
  `settings/password.tsx`, `settings/privacy/delete.tsx` and
  `settings/privacy/download.tsx`. **With the screen's `footer`:**
  `drive/licence.tsx`, `drive/cars/index.tsx` (while there is no car),
  `account/deletion.tsx`, `meeting-points/[id]/problem.tsx`,
  `verify-email.tsx`, and the states of `settings/password.tsx` and
  `settings/privacy/ask.tsx` that ask for an email first. Where a press
  can be refused, an `ActionNotice` over the button says why (not on
  "Delete my account", My cars, `/verify-email` and the two states that
  ask for an email first, whose buttons only lead on). `ProfileForm` in
  the bar, `CarForm`, `AppealForm` and the problem form say what the
  form itself refuses there too: the first two from the field's error and
  a count of presses, the other two with `useSaid`, as Report does.
- **`ConfirmWithCode`:** with `inBar`, the confirm `Button` is `main` in
  `InBar`, busy until the first code has an answer; an `ActionRows` holds
  "Send a new code" (after the wait, `busy` while sending, `disabled`
  while confirming) and "Cancel". Email, the password, the file and
  deleting pass `inBar`. Sign-in methods and the passkey's set-up
  (`sign-in/passkey-set-up.tsx`, on two onboarding pages too) do not, and
  keep the three buttons under the code: spec 29's pages.
- **`Row`** takes `busy` with `onPress`: a spinner (`row-busy`) where the
  chevron was, `aria-busy`, and no press. A row that opens a page takes
  `href`: My cars' rows. `Button` with `href` for "Add a car", "Add an
  email" and "Add my email".
- **Email** (`settings/email.tsx`) keeps which press failed (`error.of`),
  as `PhotoControls` does: the bar's `ActionNotice` for "Send the link",
  a `Notice` by the row for "Send the link again".
- **One appeal at a time:** `app/notices.tsx` keeps which notice's appeal
  is open (`appealing`); `Appeal` shows `AppealForm`, new, and keeps what
  is written while the form is closed.
- **`PhotoControls`** keeps which press failed (`error.of`): the main
  button's is the bar's `ActionNotice`, a row's a `Notice` by the rows.
- **Heads:** `ScreenHead` on `rides/index.tsx`, `places/[id].tsx`,
  `meeting-points/index.tsx`, `meeting-points/[id]/index.tsx` and its
  `problem.tsx`, and on `verify-email.tsx` and the saved password with an
  `outcome`. A place and a meeting point keep a lone `BackButton` until
  their name is read. `Body` is `align="start"` on those pages, and on
  Find on a phone for a signed-in member's "Driving somewhere?".
- **A meeting point's rows:** `meeting-points/[id]/index.tsx` ends with
  an `ActionRows` of two `Row`s with `onPress`, "Open in maps" and
  "Something wrong here?", in place of an outlined and a text button.
- **For the tests:** `inBar()` and `inPage()` in `testing/buttons.ts`.
- **No new page,** so nothing new in `notWhileDeleting`. No new text, no
  change in the API, no migration, no new dependency.
- **Tests:** the walk; `posting-parts.test.tsx` (`InBar`: shown in the
  bar as the part has it now, taken out with the part, one in place of
  another, two parts in their order, once under `StrictMode`, after the
  footer, in place with no screen); `display-parts.test.tsx` (a busy
  row); `sign-in-methods.test.tsx` and `passkey.test.tsx` (the code's
  form whole in the page, with no bar);
  `driving.test.tsx`, `profile-and-settings.test.tsx`, `email.test.tsx`
  (with the link's page), `password.test.tsx`, `privacy.test.tsx`,
  `delete-account.test.tsx`, `profile-photo.test.tsx`, `notices.test.tsx`
  and `meeting-point-problems.test.tsx` (the button in the bar, why it
  did nothing over it and not in the page, the rows, the outcomes as
  titles with focus); `meeting-points.test.tsx` (a meeting point's two
  rows). Journeys: `driving.spec.ts`,
  `delete-account.spec.ts`, `download-my-data.spec.ts`, `email.spec.ts`,
  `password.spec.ts`, `meeting-points.spec.ts` and `suspension.spec.ts`
  find the button in the bar, in the window without scrolling, and the
  outcome with focus; `support/photo.ts` presses the photo page's button
  in its bar. Pictures: `built/cars-phone-light`,
  `built/download-code-phone-light`, `built/meeting-points-phone-light`,
  `built/meeting-point-phone-light` and `-dark`,
  `built/meeting-point-problem-phone-light`, `built/rides-phone-light`,
  and `built/edit-profile-phone-light`,
  `built/delete-account-phone-light` and `built/edit-car-phone-light`
  again.
- **Left for 12b,** from item 9: the bar does not yet ignore a press for
  a moment after its main button changes. On these pages the outcome's
  button ("Done", "Back", "Close") stands where the button just pressed
  stood, as after a report.

As built, PR 12b, the first of its two (spec 31, 3.20, says the same
where a person sees it):

- **`PressGuard`** (`components/press-guard.tsx`, new), around the app
  in `app/_layout.tsx`: `pressed` when a main `Button` takes a press
  (holds for 500 ms, and waits for what comes of it), `opened` when the
  address changes (`useNewPageHolds(usePathname())`: holds again while a
  press waits), `changed` when a main button comes or its words change
  (`useMainButton(main, words, busy)` in `Button`: holds again, and the
  press waits no more). A page change does not end the wait, so the
  button of a page that shows it late is held from when it comes. A press
  waits 10 s at most (the time it was taken is kept, not a flag), so one
  that brought no main button, as "Find a ride" does, holds nothing
  later. Words that change while the button is `busy` are told when it is
  busy no more: "Book" turns to "Pay …" while it books, and the payment's
  own button comes after. With no guard around it a button holds nothing;
  a guard inside another leaves the holding to the outer one.
- **`HeldWithMain`** (same file), around what `BottomBar` shows
  (`components/screen.tsx`): a `Button` in it is held while the guard
  holds, main or not. Only a main button's press starts a hold. Booked's
  bar has "See in My rides" over "Find another ride", and the second
  stands where "Send request" stood.
- **`Button`:** while held, `onPress` does nothing (a link's press is
  `preventDefault`ed), the look is unchanged (hover is forgotten only
  when the button is inactive), and `aria-disabled` is true. `disabled`
  is passed only when the button is inactive, as an explicit `false`
  says "not disabled" over `aria-disabled` on a phone. On the web the
  library's `Pressable` writes `aria-disabled` from `disabled` alone,
  over the one given, and its older `accessibilityDisabled` makes a
  `<button>` `disabled` as well, which takes it out of the keyboard's
  order. So `useSaidOnWeb` sets `aria-disabled` on the element in a
  layout effect while the button is held and active, and takes it off
  after; an inactive button's is the library's own. Playwright waits for
  a button that says so before it clicks, which the journeys need:
  without it `publish` in `support/trips.ts` clicked "Publish ride"
  inside the wait.
- **For the tests:** `renderApp` renders the app in a `PressGuard` that
  holds for no time, as flow tests press faster than anyone;
  `holdsPresses: true` leaves the app's own guard on.
- **The menu's bar** (`navigation/tab-bar.tsx`): `flexWrap` on the bar; a
  tab starts at its top (`justifyContent: "flex-start"`), so icons are
  level, and on the web has `minWidth: "min-content"`. Its `paddingTop`
  is what centring gave a tab with a name of one line, so such a tab
  stands where it stood. The bar tells its height as laid out
  (`useTabBarHeight`, a small store fed by `onLayout`), which
  `analytics/consent-bar.tsx` stands over; `tabBarHeight` counts it until
  then, and again once the bar is gone. A height of 0 is not kept: the
  web tells it of a bar under another screen (`display: none`).
- **`Road`** (`components/road.tsx`): `useRoomForNames` keeps what
  `onLayout` says of the names' row, one line of a name (a text of one
  line, not seen) and each name. No room when a name is higher than a
  line or the names with their gaps are wider than the row by more than
  1 and half a point for each name (the web tells whole widths, and
  Safari and Firefox round each alone, so names that fill the row can
  count wider); nothing is decided before all are measured, nor from a
  size of 0, which the web tells of a screen under another. Then the
  names stay to be measured,
  over the picture, not seen and cut at its edges, and `road-now` shows
  `road.step`'s words. The names' row has `columnGap: spacing.sm`, which
  keeps each name centred on its mark.
- **Find's name line** (`app/(tabs)/index.tsx`): `flexWrap` on the line
  and on the name with Beta; the language in a view with `marginLeft:
  "auto"`.
- **`RouteList`:** `flexWrap` on a stop's row, with `alignContent:
  "center"` so a row of one line stays in the middle of its height (on
  the web a wrapping row starts its lines at the top); the name has
  `flexBasis: "60%"` and `minWidth: 0`.
- **No new page, no new text,** no change in the API, no migration, no
  new dependency.
- **Tests:** `press-guard.test.tsx` (16: the half second, the button a
  press brought in its place after a slow answer, other words on the
  same button, words that changed by themselves, a page a press opened,
  a page slow to show its button, a page no press opened, a link, the
  other buttons of a bar, ten seconds and no longer, words changed while
  busy, the buttons of a page, the look, the look under the pointer, no
  guard, a guard inside another); `booked-seat.test.tsx` ("Find another
  ride" after withdrawing) and `booking.test.tsx` (a double press on
  "Send request" sends nothing; "Find another ride" just after "Request
  sent" leads nowhere), with the app's own guard;
  `ticket-parts.test.tsx` (the road: names kept, one line when a name
  has two lines or they are too wide together, names back with room,
  nothing before all is measured, nothing from sizes of 0, widths
  rounded one by one); `menu.test.tsx` (tabs start at their top, a
  one-line tab where it stood); `cookies.test.tsx` (the question over
  the bar as laid out, a height of 0 not kept, counted again once the
  bar is gone).
  Journeys: `look.spec.ts` measures the sideways scroll with the text
  twice as large too, on Find, a ride (where a stop's one-line name is
  level with its dot), a booked seat (with its road), the driver's ride,
  Profile and a person's profile, and has three new ones for the menu in
  each language with Find's name line, and the road of a posting step;
  `booking.spec.ts` has a double click on "Book": one step back is the
  ride again, nothing is asked of the server, and a waiting button says
  so without being `disabled` and keeps its focus. `support/layout.ts`
  has `twiceAsLarge`, `textsToSee` and `menuFit` (with the menu's rows:
  one with the text as set). Pictures
  (`pictures.spec.ts`, "text twice as large on a phone 360 wide"):
  `built/large-text-find-phone-light`, `built/large-text-offer-phone-light`
  and `built/large-text-stops-phone-light`, new; and
  `built/find-phone-dark`, `built/my-rides-phone-dark` and
  `built/profile-phone-dark` again, for the Icelandic menu's icons.
- **Left** for its second pull request: focus order, screen readers,
  short windows; and to hear on a phone and in NVDA what a screen reader
  says of the button just pressed while it waits. Seen and left: a tab
  bar of two rows takes about a quarter of a phone 740 high with the
  text twice as large; every `Button` reads the guard and is drawn again
  twice for each main press; a first tap's pressed look ends when the
  finger lifts.

As built, PR 12b, the second of its two (spec 31, 3.20, says the same
where a person sees it):

- **A short window:** `shortWindowUnder` 480 (`packages/ui`), and
  `useShortWindow()` in `components/screen.tsx`. Under it `Screen`
  renders its `BottomBar` `joined`: inside the scroll, after the page's
  column and before `SiteFooter`, with no band and no edge, and not under
  the scroll. It is the same `BottomBar`, with `HeldWithMain` and the
  `InBar` slot, so a page's buttons do not know where they stand. A
  `Screen` with `stickToEnd`, the conversation, keeps its bar. The tab
  bar is not a `Screen`'s and stays.
- **The window's height** for this is the one the page is laid out in
  (`useLaidOutHeight`, `components/window-height.ts`, new): on the web
  `document.documentElement.clientHeight`, read again on the window's
  `resize`. `useWindowDimensions` tells what is seen there
  (`visualViewport`), which a phone's keyboard makes shorter: by it the
  bar moved into the page each time a field took the keyboard.
- **The bar's move is quiet.** The two places are two `BottomBar`s, so
  what the bar holds is put again when it moves, and a `TakesFocus` in
  it, as a notice has, would take focus again. Once a screen's bar has
  changed place, each `BottomBar` sets `PutAgainContext` (a ref, in
  `takes-focus.tsx`) while it is first put, and a `TakesFocus` that
  appears then takes none; the ref is false once the bar is in place, so
  what a notice says after takes focus as anywhere. A browser inside
  another app can make the window itself shorter for the keyboard: there
  the bar joins the page, and this keeps the keyboard in its field.
- **`TakesFocus`** (`components/takes-focus.tsx`): on the web, where
  its content holds one stop for the keyboard and that stop's text is
  all the content's text, focus goes to that stop, and to the content
  as a whole otherwise or if the stop takes none. That mends "Show all
  drafts" with no change on Offer, and every other place a lone row or
  button is wrapped. Sign-in's pages wrap a lone button in five places
  (four in `settings/sign-in-methods.tsx`, one in
  `sign-in/passkey-devices.tsx`: each the button that opened a question
  which has closed): there the keyboard is now on the button and not on a
  view around it. Nothing else of those pages is touched.
- **Messages' menu** (`chat/conversation-head.tsx`,
  `app/messages/[bookingId].tsx`): the page holds `useTopMenu()` (open,
  `set`, `inTop`, `beside`) and gives it to `ConversationHead`. Escape
  on the head and Android's back (`BackHandler`, only while the page is
  the one in front: `navigation.isFocused()`) call `closeToButton`,
  which closes and focuses "More" (`IconButton` takes a `ref` now). On
  the web a `pointerdown` listener on the document, in the capture
  phase, closes for a press outside the head, as the press begins. In
  the phone apps the
  head's `onTouchStart` says `inTop` and the page's frame says `beside`,
  which closes unless the touch began in the head: a touch bubbles from
  the head to the frame, so the frame hears both. A row of the menu
  that opens a page closes it first.
- **The picker of a meeting point** (`trips/point-picker.tsx`,
  `trips/route-step.tsx`, `app/drive/trips/[id]/edit/stop.tsx`):
  `PointPicker` has `takesFocus`, which its `ScreenHead` gets as an
  outcome's focus. The route step passes it always, as the picker takes
  the step's place there, and wraps "Add a meeting point" in a
  `TakesFocus` that is on once the picker has closed. Add a stop passes
  it only after "Choose another meeting point".
- **`Columns`** (`components/columns.tsx`): with `sideAt="start"` the
  side column is first in the tree, where `row-reverse` drew it at the
  left before. The two have keys, so the main column is the same part on
  either side and at any width. Profile is the one page with it.
- **`components/spoken.tsx`** (new): `Heard` is a text of the words on
  the web, 1 by 1 and cut to nothing, out of the layout, and nothing in
  the phone apps; `spokenAs(name, text)` is an `accessibilityLabel`
  "name: text" in the phone apps and nothing on the web, where a label
  would need a role. The first build named a `role="group"` around each
  end; its review found that VoiceOver and TalkBack do not say a group's
  name on coming into it, and the web on a phone is where the beta is.
  `Timetable` takes `ends` (`from`, `to`) unless it is pressed, and
  `TicketFoot` `startIs`. Given by `app/trips/[id]/book.tsx`,
  `booking/booking-ticket.tsx` and `trip-details/part-ticket.tsx` ("Get
  in", "Get out"), and by `trips/preview-ticket.tsx` and
  `driver-trip/ride-ticket.tsx` ("From", "To").
- **Headings:** the name in `trip-details/driver-card.tsx` (with the
  label "Driver: Anna") and in `people/person-card.tsx`, both of the
  second level. Where the driver's line is a `ProfileLink`, its label
  starts with "Driver": the link's name takes the place of what it
  holds for a phone's screen reader, heading and all. PR 11a's tests said the person's name was no heading,
  on its review's word that it should be one; they say the opposite now.
- **`WhereYouSit`:** the words are first in the tree; the card is
  `row-reverse` with `wrap-reverse` and `justifyContent: "flex-end"`, so
  the car is still at the left, and over the words where they wrap.
  The web reads by the tree; VoiceOver and TalkBack in an app go by
  where things stand, so there the car is still met first.
- **`Row`:** one that `shows` is `accessible` with the label "title,
  value" in the phone apps. Not on the web, which passes `accessible`
  on to nothing and counts no name of a view without a role.
- **`Chip`** and `TakesFocus` are shared, so two things change on pages
  of sign-in and sign-up this work otherwise leaves alone: the language
  chips of "About you" are 44 high on the web, and the five buttons
  named above take the keyboard themselves.
- **`Chip`:** `minHeight` is `minTouchTarget` on the web and `chipHeight`
  elsewhere, with its `hitSlop`.
- **One new text,** `trip.driver` ("Driver", "Bílstjóri"). No new page,
  no change in the API, no migration, no new dependency.
- **Tests:** `posting-parts.test.tsx` (a short window: the bar in the
  page, kept under it from 480, moved as the window turns and back with
  what the page holds, a conversation's kept; a notice in the bar takes
  no focus as the bar moves either way, and takes it when it says
  something after); `wide-parts.test.tsx` and
  `profile-and-settings.test.tsx` (the side column first at the left);
  `chat.test.tsx` (a touch beside the top and one in it; Android's back
  closes the menu, stays, and puts a screen reader on "More"; back on a
  page over the conversation leaves that page); `post-a-trip.test.tsx`
  and `edit-trip.test.tsx` (the picker's focus as it opens, on Back,
  after a point, and not as Add a stop opens, each with the view the
  focus went to, `testing/focus.ts`, new); `ticket-parts.test.tsx`
  and `display-parts.test.tsx` (the ends' words; a row in one piece);
  `booking.test.tsx`, `trip-details.test.tsx` and
  `public-profile.test.tsx` (the labels, the headings, the reading
  order of "Where you sit").
  Journeys: `keyboard.spec.ts` (new: the draft's link after "Show all
  drafts" and Enter; the picker's title, Back, the button, Enter);
  `chat.spec.ts` (Escape, a press beside the menu, a row and the way
  back; the field on a window 740 by 360); `look.spec.ts` ("a short
  window": at 740 by 360 and 320 by 256 the bar is in the page and its
  button is reached by scrolling, whole in the window's width and over
  the website's footer; what is seen told as 300 high, as under a
  keyboard, leaves the bar where it is; "chips":
  44 high; the person's name as a heading); `cancel-trip.spec.ts` (the
  bar's notice and its focus); `trip-details.spec.ts` (the driver's
  heading; "Where you sit" before its picture and at its right);
  `booking.spec.ts` (the words before each end and before the driver's
  name, not seen, in both languages; signed in, the link to the driver's
  profile and the heading in it);
  `laptop.spec.ts` (Profile's card before its rows). Pictures
  (`pictures.spec.ts`): `built/short-window-ride-phone-light` and
  `built/short-window-ride-end-phone-light` ("a short window, a phone on
  its side", new), and `built/large-text-where-you-sit-phone-light`.
  The pictures with chips are not taken again here: a chip's row is 4
  higher on the web, and 12c takes every picture.
- **Left:** arrow keys between the choices of a group where one is
  chosen; Messages' placeholder and five lines with large text (item
  14); the browser's Back with the picker open (item 13); Find's yellow
  card beside the rides, read after them (item 6); with text twice as
  large on a phone 360 wide, the words of "Where you sit" in a narrow
  column beside the car (the row wraps by widths that do not grow with
  the text); Messages' menu closes as a press beside it begins, so a
  thing in the conversation that moved with the top would lose its
  press (none is pressed there today), and in an app on a tablet a touch
  on the conversations beside the open one leaves it open; "Where you
  sit" before its picture in the phone apps, which go by place; focus
  on a bar's button is lost when the bar changes place, as when a phone
  is turned. To hear on a phone and in NVDA: a main button just pressed
  while it waits, and what this pull request gives a screen reader.
- **Found on the way, for 12c:** an address the app does not have, as
  `/trips`, shows the router's own page: black, "Unmatched Route", with
  a link to a list of every address. The app has no `+not-found` page:
  one in its look, with the title at the left and "Find a ride" (done,
  PR 12c).

As built, PR 12c, the first of its two (spec 31, 3.21, says the same
where a person sees it):

- **`app/+not-found.tsx`** (new): the router shows it for an address
  with no file. A `Screen` with the website's footer, `NoIndex`, a
  `ScreenHead` with `notFound.title` and `notFound.line`, `PuffinByPin`,
  and `welcome.findRide` as a main `Button` with `href="/"` in the bar.
  The button `replaces`: `linkProps(href, "replace")` puts Find where
  the page was, on the web and in the phone apps. It is in none of the
  root layout's lists, so it is open signed in or out; someone whose
  account is half set up is led on from Find, as from any link there.
- **The router's own list of addresses is off:** `app.json` gives the
  `expo-router` plugin `"sitemap": false`, so `/_sitemap` is an address
  the app does not have.
- **"New driver"** is a `plain` `Tag` in `search/result-ticket.tsx`
  (`DriverFoot`, which the preview's ticket uses too) and
  `trip-details/driver-card.tsx`. `request.noReviews` stays `warning`
  on the request's tint.
- **A cancelled ride** (`app/trips/[id]/index.tsx`): no `Stepper`, so
  the phone's ticket has no foot and no tear line, and the laptop's
  panel no stepper and no line about free seats (`panel.hint` can be
  null); no `WhereYouSit`; and `BookingBar` shows no price (`priced`),
  in the bar or in the panel, with its line starting at the left.
- **`BlockPerson`** (`safety/block-person.tsx`) keeps each shared
  booking as it is now: `Together` tells it (`onChange`) what a
  withdrawal, a decline or coming back from cancelling made of it, and
  holds no copy. The title's line counts those that `holdsSeats`.
- **Messages' menu** (`chat/conversation-head.tsx`): the `ActionRows`
  stand in a view `top-menu`, in `background` with the card's corners
  and `spacing.sm` around.
- **A draft with fewer than two stops:** `routeText` says
  `trip.draftNoRoute`, `resumeStep` gives `route`, and `RouteStep`
  starts with no end when the draft has one stop, whose time is not
  shown as the ride's (`savedRoute` needs two stops).
- **`notificationScreens`** (`packages/contracts/src/notifications.ts`,
  new): the six pages a notification may open that are not about one
  record. `apps/api`'s `notifications/texts.ts` names its paths from it,
  and the app's `notifications/paths.ts` opens what is in it. Before,
  the app's own list lacked `/settings/feedback`, `/settings/beta-news`
  and `/settings/privacy`. What the API sends is unchanged.
- **Three new texts:** `notFound.title`, `notFound.line`,
  `trip.draftNoRoute`; and `booking.searchAgain` is "Finna aðra ferð"
  in Icelandic, as `booking.findAnother` is. No change in what the API
  answers or sends, no migration, no new dependency, no new colour or
  size.
- **Tests:** `not-found.test.tsx` (new: the page, its puffin, its
  button to Find, which leaves nothing to go back to, an address deep in
  the app, Icelandic, an account half set up); `link-props.test.ts` (a
  link that takes its screen's place); `every-page.test.tsx` walks
  it; `result-ticket.test.tsx` and `trip-details.test.tsx` (the tag's
  colour; a cancelled ride on a phone and in a laptop's side column);
  `blocking.test.tsx` (two bookings, then one, then none, with focus
  moved once); `chat.test.tsx` (the menu's ground, and its rows' own);
  `post-a-trip.test.tsx` (a draft with no stop, which has no time
  either, and with one; no time beside a one-stop draft's route on a
  laptop); `paths.test.ts` (every page of the shared list opens, and
  each is a file under `app/`). Journeys: `not-found.spec.ts` (new, in
  each language: three addresses, `/_sitemap` among them, nothing of
  the router's pages, not for search engines, the bar's link to Find);
  `cancel-trip.spec.ts` (a visitor on the cancelled ride's page, with
  no price). Pictures: `built/not-found-phone-light` (new) and
  `built/chat-menu-phone-light` again.
- **Code review** (one reviewer, before the pull request): ready with
  fixes, none serious. Mended, tests first: `/_sitemap` still showed
  the router's list; a cancelled ride kept its price; "Find a ride"
  pushed, so back from Find showed the page again in the phone apps; a
  one-stop draft showed "09:00 → 09:00" beside its route on a laptop;
  nothing tied the app's list of notification pages to the API's.
- **Left:** the Route row of "Check and publish" for a draft with fewer
  than two stops; an unknown address answers 200, not 404 (spec 31,
  3.21); whether Notices, Report and the two block pages should close
  for an account that waits to be deleted (item 15), which is a
  question of spec 9 and spec 11 and not of the look: Q31 in
  [open questions](../strategy/open-questions.md), answered after the
  plan as A59 (Martin, 2026-11-27): Report and the two block pages
  close, Notices stays open; and "What's wrong here?" for a meeting
  point, a fifth such page found when it was built, closes too.

As built, PR 12c, the second of its two (spec 31, 3.22, says the same
where a person sees it):

- **Against the drawings** (item 3). Each of the proposal's thirteen
  drawings (`proposal/img/new-*.webp`) was laid beside the picture of
  the screen as built, and the 84 pictures of `e2e/pictures.spec.ts`
  were taken again from the finished build, on a phone and on a laptop:
  62 came out different, and each was looked at and replaced; 22 came
  out the same to the pixel. The four `parts-*` pictures are not that
  run's.
- **One thing mended:** `menuTabOf` (`navigation/menu.ts`) gives My
  rides for a ride I drive and the screens it opens
  (`/drive/trips/<id>`, and under it `edit`, `cancel`, `message` and
  `share`), so a laptop's top bar keeps My rides chosen there, as drawn.
  It gave Offer for every address under `/drive`. The steps of posting
  (`stepNames` of `trips/steps.ts`, and `published`),
  `/drive/trips/new`, My cars and the licence stay Offer's. Tests, seen
  to fail first: `navigation/menu.test.ts` (every screen under a ride I
  drive, as `member-screens.ts` lists them, under one place or the
  other, so a new screen must be put under one; and every step of
  `stepNames`), `__tests__/menu.test.tsx` (the top bar on a ride I
  drive) and a line of `laptop.spec.ts` (the menu's link has
  `aria-current` on the driver's ride).
- **Named, not changed:** what differs from a drawing for a reason an
  earlier section gives (spec 31, 3.22, by screen), and what is left.
- **Sign-in** (item 5): spec 29's screen had not landed, so the ride
  over the form keeps its small card; left for that spec's thread.
- **Docs** (item 16): spec 31 is Built and says what differs and what
  is left (3.22); spec 15 had the parts since PR 2; the roadmap, the
  changelog and the lists of specs and plans.
- No change in what the API answers or sends, no migration, no new
  dependency, no new text.
- **Code review** (one reviewer, before the pull request): ready with
  fixes, none in what the code does. Mended: the menu's steps of posting
  were a second list beside `stepNames`, and the test named the same
  six, so a step added later would have shown My rides with no test
  failing; this plan's own status; three lines of 3.22 that said more
  than the code does (Find's footer is the website's, signed in or not;
  the line about paying the driver follows the booking, not the switch;
  "Sign-in methods" is the name its page has since spec 19); three
  differences more, seen in passing (3.22); and what is left for spec
  29's thread and for Martin's phone, which 3.22 now names. Left, and
  said in 3.22: a draft opened at the address of a ride I drive shows
  the ride's page, which is that page's to mend.

## After merging

Released to production on Martin's go of 2026-11-27 ("let's just go live
when ready"): #257 to #278, at 12:07 UTC that day, live at 12:10. No
migration and no new setting went with it. The closing pull request
(PR 12c, its second) came after, and goes out with the next release.

Martin's steps: walk a booking as a passenger and a ride as a driver on
his phone, and read the Icelandic texts of section 8, which are a
non-native's. A listen on a phone with a screen reader and typing in a
conversation are closed on his word of 2026-11-27 ("listen is alright,
mark resolved"; spec 31, 3.22, says what he was asked and what stays
unheard), and Q31 is answered as recommended that day (A59). The legal
texts, which named "Settings", have a new version each, written on his
word of 2026-11-27: the Terms' version 3 and the Privacy Policy's
version 4 name the pages in Profile. They are on
puffinride.is with the release after; then Martin sends an announcement
in the console that says so, as the Terms promise for a smaller change
(16.1; [runbook](../operations/production.md#change-a-legal-text)).
