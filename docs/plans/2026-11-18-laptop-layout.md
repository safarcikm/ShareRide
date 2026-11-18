# The web app on a laptop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From 900 wide, every main screen of the app uses the width: a page
1144 wide with two columns or a grid, under the top bar. Phones keep every
layout they have.

**Architecture:** Layout only, in `apps/mobile`. `Screen` gains a `width`
of `"page"`; two new parts, `Columns` (a main column and a side column that
stays in view) and `Grid` (cards in as many columns as fit), do the
arranging. Each screen asks `useWideScreen()` and places the parts it
already has: it builds no new data and calls no new route. Parts that can be
pressed learn a look for the pointer.

**Tech Stack:** Expo Router 58, React Native 0.88, react-native-web 0.21,
react-native-svg (our map), Jest with RNTL 14, Playwright.

**Spec:** [spec 18](../specs/2026-11-18-laptop-layout.md). Martin chose
every main screen, as drawn, on 2026-11-18.

## Global Constraints

- Seven PRs after this one, in the order below, each green in CI and merged
  before the next starts. Each updates `CHANGELOG.md`, this plan's ticks and
  the plans index.
- Presentation only: no change under `apps/api`, `packages/db`,
  `packages/contracts` or `packages/domain`; no migration; no new runtime
  dependency; no ADR.
- One breakpoint: wide is `useWideScreen()`, a window at least
  `sidePanelFrom` (900) wide. Under it nothing changes: every phone test and
  phone journey passes untouched.
- Tokens only (spec 15). New tokens: `pageMaxWidth` 1144, `sideColumnWidth`
  400, `gridCardMinWidth` 320, `listPaneWidth` 360, colour `primaryHover`
  (`#285C44` light, `#8FD0AC` dark).
- Every text in `en.ts` and `is.ts`; keys as in spec 18, section 8.
- Reading order is the main column, then the side column: `Columns` renders
  them in that order whichever side the side column sits on.
- Nothing is reachable only under the pointer.
- No page scrolls sideways at 900, 1280 or 1440 wide.
- Four other threads build in parallel (trip day, console, safety, beta
  gate). A screen file another thread has open in a PR is rebased on, not
  rewritten: wrap its parts in columns and keep their logic and names.
- Screen tests set the window with
  `Dimensions.set({ window: { width: 1280, height: 800, scale: 1, fontScale: 1 } })`
  and put it back to the phone's size after each test.

## Review Focus

1. A window dragged across 900 wide while a form is half filled (the search
   on Find, a posting step): what was typed and chosen stays. Tasks 2.1 and
   7.1 test it.
2. A window exactly 900 wide, the narrowest wide screen: two columns still
   fit and the page does not scroll sideways. Task 1.4 tests it in the
   browser for every two-column screen as it lands.
3. Icelandic, where words are longer ("Brottför", "Veldu bæ eða mótsstað"):
   the search row wraps onto a second line instead of cutting a label. Task
   2.1 tests it.
4. A conversation opened on a laptop from a link: the list beside it must
   not mark any other conversation as seen. Task 5.1 tests it.
5. Text at twice the size in a wide window (jest's `fontScale` 2): cards in
   a grid grow taller and never overlap; the side column keeps its width.
   Task 1.2 tests it.

## PRs

| PR | Spec | What | Status |
| -- | ---- | ---- | ------ |
| 0 | all | Spec 18 and this plan | Merged (#150) |
| 1 | 3.2 to 3.4 | Groundwork: tokens, `Screen` page width, `Columns`, `Grid`, the top bar lined up, pointer looks | Merged (#155) |
| 2 | 3.5 | Find: the search in one row, rides in a grid, the side column | Merged (#156) |
| 3 | 3.6 | Search results: the map beside the list, chips that wrap | Built |
| 4 | 3.7, 3.8 | Trip details, Check and pay and a request in two columns | |
| 5 | 3.11 | Messages as two panes | |
| 6 | 3.9, 3.10, 3.12 | A booking, My rides and Profile | |
| 7 | 3.13, 3.14 | Offer a ride and the driver's trip | |

---

## PR 1: Groundwork

### Task 1.1: Tokens

**Files:**

- Modify: `packages/ui/src/tokens.ts`, `packages/ui/src/tokens.test.ts`
- Modify: `docs/specs/2026-11-13-visual-design-system.md` (4.1 row
  `primaryHover`, 4.4 sizes, 4.8 wide screens)

**Interfaces:**

- Produces: `pageMaxWidth = maxContentWidth + spacing.lg + asideMaxWidth`
  (1144), `sideColumnWidth = 400`, `gridCardMinWidth = 320`,
  `listPaneWidth = 360`, and `colors.light.primaryHover = "#285C44"`,
  `colors.dark.primaryHover = "#8FD0AC"`.

- [x] **Step 1: Failing tests** in `tokens.test.ts`: `["onPrimary",
  "primaryHover"]` joins `textPairs`; `pageMaxWidth` is 1144.
- [x] **Step 2:** `pnpm --filter @shareride/ui test`; expect failures.
- [x] **Step 3:** Add the tokens.
- [x] **Step 4:** Run again; expect pass. Commit `feat(ui): tokens for wide pages`.

### Task 1.2: `Screen` page width, `Columns` and `Grid`

**Files:**

- Modify: `apps/mobile/src/components/screen.tsx`
- Create: `apps/mobile/src/components/columns.tsx`,
  `apps/mobile/src/components/grid.tsx`,
  `apps/mobile/src/components/wide-parts.test.tsx`

**Interfaces:**

- Produces: `Screen` prop `width?: "column" | "page"` (default `"column"`).
  With `"page"` on a wide screen the content is at most `pageMaxWidth` wide,
  test ID `page`; on a phone it is the column as today. The bottom bar's
  content stays `maxContentWidth` wide.
- Produces: `useScreenViewHeight(): number | null`, the height the screen
  scrolls in (the value `stickyOnWeb` already uses), for `Columns`.
- Produces: `Columns({ children, side, sideAt = "end", sideWidth = sideColumnWidth })`.
  Wide: a row; `children` in the main column (test ID `columns-main`,
  `flex: 1`, `minWidth: 0`, gap `md`), `side` in a column `sideWidth` wide
  (test ID `columns-side`, gap `md`), sticky on the web as the `aside` is.
  Rendered main first, placed with `flexDirection: "row-reverse"` when
  `sideAt` is `"start"`. Not wide: main, then side, stacked with gap `md`.
- Produces: `Grid({ children, minWidth = gridCardMinWidth })`: measures its
  width (`onLayout`), shows `max(1, floor((width + gap) / (minWidth + gap)))`
  equal columns with gap `md`, one column until measured; each child in a
  cell with test ID `grid-cell`.

- [x] **Step 1: Failing tests** in `wide-parts.test.tsx`:
  - `Screen width="page"` at 1280 wide has `page` with `maxWidth` 1144; at
    390 wide there is no `page`;
  - `Columns` at 1280: `columns-side` has width 400 and comes after
    `columns-main` in the tree for both `sideAt` values; at 390 both show,
    main first, and neither has a fixed width;
  - `Grid` laid out 704 wide puts 3 children in cells 344 wide; laid out 500
    wide in cells 500 wide; with `fontScale` 2 the cells keep their width
    (Review Focus 5).
- [x] **Step 2:** `pnpm --filter @shareride/mobile test wide-parts`; expect failures.
- [x] **Step 3:** Implement the three.
- [x] **Step 4:** Run again and `pnpm --filter @shareride/mobile typecheck`; expect pass.
- [x] **Step 5:** Commit `feat(mobile): page width, columns and grid for wide screens`.

### Task 1.3: Pointer looks

**Files:**

- Create: `apps/mobile/src/theme/hover.ts`, `apps/mobile/src/theme/hover.test.tsx`
- Modify: `components/card.tsx`, `components/row.tsx`, `components/button.tsx`,
  `components/chip.tsx`, `components/icon-button.tsx`,
  `navigation/top-bar.tsx`

**Interfaces:**

- Produces: `useHover(off = false): readonly [boolean, HoverProps]`: whether
  the pointer is over a part, and the `onHoverIn` and `onHoverOut` to give
  its `Pressable`. A part that is `off` (disabled, busy) is never hovered
  and forgets the pointer. Phones never call the two, so nothing changes
  there. (Its own state, not react-native-web's `hovered`, so a test can
  show the look with `fireEvent(part, "hoverIn")`.)
- Produces: `Card` props `onHoverIn?: () => void` and `onFocus?: () => void`,
  passed to its `Pressable` (the results map uses them in PR 3).

Looks under the pointer (spec 18, 3.4): a pressable `Card`'s face and a
`Row` `primarySoft`; `Button` primary face `primaryHover`, secondary face
`primarySoft`, text label underlined; `Chip` not selected `primarySoft`;
`IconButton` (and so `BackButton`) face `primarySoft`; a place in the top
bar `primary`. A disabled or busy part shows none.

- [x] **Step 1: Failing tests** in `hover.test.tsx` for the hook. In
  `button.test.tsx`, `display-parts.test.tsx`, `form-parts.test.tsx` and
  `menu.test.tsx`: after `hoverIn`, the face of a primary and a secondary
  `Button`, a pressable `Card`, a `Row`, a `Chip`, an `IconButton` and a
  place in the top bar carry the colours above; a disabled or busy `Button`
  does not. In `tokens.test.ts`: `text` and `textMuted` on `primarySoft`
  are at least 4.5:1.
- [x] **Step 2:** Run them; expect failures.
- [x] **Step 3:** Implement.
- [x] **Step 4:** Run the app's tests; expect pass.
- [x] **Step 5:** Commit `feat(mobile): parts react to the pointer`.

### Task 1.4: The top bar lined up, and the laptop journey

**Files:**

- Modify: `apps/mobile/src/navigation/top-bar.tsx`,
  `apps/mobile/src/components/screen.tsx` (the scrollbar's room),
  `packages/i18n/src/messages/en.ts`, `is.ts` (`nav.home`)
- Create: `apps/mobile/e2e/laptop.spec.ts`, `apps/mobile/e2e/support/laptop.ts`,
  `apps/mobile/e2e/laptop-scrollbar.spec.ts` (the bar over the page with
  the browser's scrollbars showing, 1000 and 1440 wide)
- Test: `apps/mobile/src/__tests__/menu.test.tsx`

**Interfaces:**

- Produces: the bar's content in a row at most `pageMaxWidth` wide in the
  middle (test ID `top-bar-content`), with `md` padding at each side as the
  page has; the logo and name as one link to `/` named `nav.home`.
- Produces: on the web, a wide `Screen` scrolls with
  `scrollbar-gutter: stable both-edges`, and the bar keeps the same room
  (`evenGutterOnWeb`), so a page stays under the bar's content where the
  scrollbar takes room.
- Produces: in `e2e/support/laptop.ts`, `expectNoSidewaysScroll(page)` (the
  document and the screen's scroll are no wider than the window),
  `widths = [900, 1280, 1440]` and `laptop(width)`, a viewport; the later
  PRs add their screens to `laptop.spec.ts`. (A journey may not import
  from another journey's file, so the helpers have their own.)

- [x] **Step 1: Failing tests:** in `menu.test.tsx`, the bar's content has
  `maxWidth` 1144 and the link "ShareRide, to the front page" opens `/`.
  In `laptop.spec.ts`, at each width: Find, `/meeting-points` and
  `/profile` do not scroll sideways; at 1440 the logo's left edge is at 148
  and the language ends at 1292 (the page's edges); clicking the logo from
  `/profile` opens Find.
- [x] **Step 2:** Run the Jest test; expect failures.
- [x] **Step 3:** Implement. (`look.spec.ts` only checks that the language
  switch is in the bar, so it needs no change.)
- [x] **Step 4:** Jest, then
  `npx playwright test e2e/laptop.spec.ts e2e/look.spec.ts --trace off`; expect pass.
- [x] **Step 5:** Spec 15 rows for `Screen`, `Columns`, `Grid`, `TopBar`
  and the pointer looks; `CHANGELOG.md`. Commit `feat(mobile): the top bar lines up with the page`.

## PR 2: Find

### Task 2.1: The search in one row

**Files:**

- Modify: `apps/mobile/src/search/route-search.tsx`,
  `apps/mobile/src/components/route-ends.tsx`,
  `apps/mobile/src/components/stepper.tsx`
- Test: `apps/mobile/src/__tests__/welcome.test.tsx`

**Interfaces:**

- Produces: `RouteSearch.row: (action: ReactElement) => ReactElement`,
  beside `fields` and `submit`: one `Card` holding a wrapping row (test ID
  `search-row`) of two groups that wrap as wholes. The first, which takes
  the room left: From, the swap button, To. The second: a Date button
  ("Any day" or the short day, with a chevron), the seats stepper and
  `action`. Each part is a caption line over a control 48 high. From and
  To open their place list in their own part of the row, and the Date
  button opens, under itself, the "Any day" chip and the calendar; the
  card grows downwards. `fields` and `row` read the same state, so
  changing between them keeps what was chosen.
- Produces: `RouteEnds` prop `direction?: "column" | "row"`; in `"row"` the
  two ends sit side by side with the swap button between them and no card
  of their own, each a caption over its value.
- Produces: `Stepper` prop `caption?: boolean`: the label as a caption
  line.

- [x] **Step 1: Failing tests** at 1280 wide on Find: From, To, "Date: Any
  day", Seats and "Find a ride" share one card (`search-row`); the place
  search opens in From's part; the calendar opens and closes; choosing
  From, then setting the window to a phone's and back keeps it (Review
  Focus 1); "Find a ride" with nothing chosen shows "Choose where from and
  where to" under the row, and with both chosen searches with the date and
  seats; in Icelandic every label of the row is there (Review Focus 3). On
  a phone the existing tests pass unchanged.
- [x] **Step 2 to 4:** Run, implement, run.
- [x] **Step 5:** Committed with Task 2.2 as one commit.

### Task 2.2: The page

**Files:**

- Modify: `apps/mobile/src/app/(tabs)/index.tsx`,
  `apps/mobile/src/components/card.tsx`,
  `apps/mobile/src/search/result-card.tsx`, `e2e/laptop.spec.ts`,
  `e2e/look.spec.ts`
- Test: `apps/mobile/src/__tests__/welcome.test.tsx`,
  `apps/mobile/src/components/display-parts.test.tsx`

**Interfaces:**

- Produces: `Card` and `ResultCard` prop `fill?: boolean`: the card takes
  the height of its place, so the cards of one row of a `Grid` end level.

- [x] **Step 1: Failing tests** at 1280: the title, the search row, then
  `Columns`: "Leaving soon" with "See all rides" and six rides in a `Grid`
  in `columns-main` (it asks for seven, to know whether there are more);
  "Your next ride" (signed in, one coming up) and the card "Driving
  somewhere?" with "Offer a ride" and "See the meeting points" in
  `columns-side`. With no rides, no `columns-main`, and the side cards in
  a column 480 wide in the middle (`find-middle`). While the rides load,
  the columns with "Leaving soon" and "Loading".
- [x] **Step 2 to 4:** Run, implement with `Screen width="page"`, run.
  `laptop.spec.ts` gains Find in both languages at 900, 1280 and 1440: the
  search stays in its card with no cut text, the calendar opens under the
  date and gives focus back, and the rides stand in two columns of equal
  cards beside the offer. `look.spec.ts` checks that "Find a ride" ends the
  row. Find signed in is covered by jest; the journey signs nobody in.
- [x] **Step 5:** Commit `feat(mobile): Find on a laptop`.

## PR 3: Search results

### Task 3.1: The map beside the list

**Files:**

- Create: `apps/mobile/src/search/results-map.tsx`
- Modify: `apps/mobile/src/app/search/results.tsx`,
  `apps/mobile/src/search/result-card.tsx`,
  `apps/mobile/src/components/card.tsx`, `en.ts`, `is.ts`
  (`results.map`, `results.mapOf`), `e2e/laptop.spec.ts`
- Test: `apps/mobile/src/__tests__/search.test.tsx`

**Interfaces:**

- Produces: `ResultsMap({ results, shown })`: our map fitted to the
  stretches of every trip in `results`, muted, with the stretch of `shown`
  drawn along the roads and its two points chosen; label `results.mapOf`
  with their names. Without `shown`, the whole of Iceland, labelled
  `results.map`.
- Changes: `IcelandMap` remembers each line's way along the roads, so a
  map that changes one line does not find the others again.
- Produces: `ResultCard` props `onShow?: () => void`, called when the
  pointer enters it or it takes keyboard focus, and `marked?: boolean`;
  `Card` prop `marked?: boolean`, which keeps the edge it has under the
  pointer.

- [x] **Step 1: Failing tests** at 1280: with trips found, `aside` holds
  the image "The trip on a map of Iceland: Borgarnes → Blönduós." for the
  first trip, whose card is marked; focusing the second card changes the
  label to its stretch and moves the mark, and the pointer does the same;
  the map's shape stays as it goes from one trip to another; a trip
  filtered away gives the map back to the first; the map is there while
  the trips load, and stays without a trip when nothing is found, a filter
  leaves none (focus stays on the chip pressed) or the search fails; the
  trip shown stays when the order changes; trips from nearby points alone
  are on the map; the chips are in a wrapping row
  (`chips-wrap`), not a sideways scroll; the form to change the search
  keeps the map. On a phone: no map, no mark, and the chips scroll
  (`chips-scroll`) as today.
- [x] **Step 2 to 4:** Run, implement with `Screen aside`, run.
  `laptop.spec.ts` gains search results in both languages at 900, 1280 and
  1440: the map beside the list with the trip's name, and every chip whole
  in the list's column.
- [x] **Step 5:** Commit `feat(mobile): the map beside search results`.

## PR 4: Trip details, Check and pay, a request

### Task 4.1: Trip details

**Files:**

- Modify: `apps/mobile/src/app/trips/[id]/index.tsx`,
  `apps/mobile/src/trip-details/trip-parts.tsx`, `components/screen.tsx`
  (remove `footerBeside`), `packages/ui/src/tokens.ts` (remove
  `sidePanelWidth`), `e2e/laptop.spec.ts`
- Test: `apps/mobile/src/__tests__/trip-details.test.tsx`

- [ ] **Step 1: Failing tests** at 1280: `columns-main` holds "Your part",
  "Who you ride with" (the seat view beside the driver) and Safety;
  `columns-side` holds the price, the seats stepper, the main button and
  its lines, then "Route" with the map and the stops; there is no
  `bottom-bar` and no stepper in "Your part". Changing the seats in the
  side column changes the price there. At 390 every existing test passes.
- [ ] **Step 2 to 4:** Run, implement with `Screen width="page"` and
  `Columns`, run.
- [ ] **Step 5:** Commit `feat(mobile): trip details in two columns`.

### Task 4.2: Check and pay and a request

**Files:**

- Modify: `apps/mobile/src/app/trips/[id]/book.tsx`, `e2e/laptop.spec.ts`
- Test: `apps/mobile/src/__tests__/booking.test.tsx`

- [ ] **Step 1: Failing tests** at 1280: the ride, the total and "Pay
  1,500 ISK" (or "Send request") are in `columns-side`; the message field
  and the tick list in `columns-main`; no `bottom-bar`. A double press on
  Pay still makes one booking.
- [ ] **Step 2 to 5:** Run, implement, run, commit `feat(mobile): Check and pay in two columns`.

## PR 5: Messages

### Task 5.1: Two panes

**Files:**

- Create: `apps/mobile/src/chat/conversation-list.tsx` (the rows, moved out
  of `(tabs)/messages.tsx`), `apps/mobile/src/chat/panes.tsx`
- Modify: `apps/mobile/src/app/(tabs)/messages.tsx`,
  `apps/mobile/src/app/messages/[bookingId].tsx`,
  `apps/mobile/src/chat/composer.tsx`, `en.ts`, `is.ts` (`chat.choose`),
  `e2e/laptop.spec.ts`
- Test: `apps/mobile/src/__tests__/messages-tab.test.tsx`, `chat.test.tsx`

**Interfaces:**

- Produces: `ConversationList({ openId?: string })`: loads and shows my
  conversations as `(tabs)/messages.tsx` does today; the row of `openId` is
  tinted and has `aria-current`; on a wide screen a row replaces the
  address (`router.replace`) when a conversation is already open, and
  pushes otherwise.
- Produces: `Panes({ list, children })`: one card across the page; `list`
  in a pane `listPaneWidth` wide with its own scroll, `children` in the
  other, which holds its own scroll and the composer at its bottom.

- [ ] **Step 1: Failing tests** at 1280: Messages shows the list and
  "Choose a conversation", and asks the API for no conversation's messages
  (Review Focus 4); a row opens `/messages/{id}` with the list still
  showing and that row current; a new message sent there shows in the
  right pane and the list's preview after its next load; Back from a
  conversation opened from a booking returns to the booking. At 390 the
  existing tests pass.
- [ ] **Step 2 to 5:** Run, implement, run, commit `feat(mobile): Messages in two panes`.

## PR 6: A booking, My rides and Profile

### Task 6.1: My rides as a grid

- Modify: `apps/mobile/src/app/(tabs)/my-rides.tsx`; test `my-rides.test.tsx`.
- [ ] At 1280 the rides sit in a `Grid` under a title at the left; the
  order is unchanged. Commit `feat(mobile): My rides as a grid`.

### Task 6.2: Profile

- Modify: `apps/mobile/src/app/(tabs)/profile.tsx`; test
  `profile-and-settings.test.tsx`.
- [ ] At 1280, signed in: the person (photo or initial, name, languages,
  "Edit profile", "See it as others do") in `columns-side` with
  `sideAt="start"`; the two groups of rows in `columns-main`. Signed out:
  one column. Commit `feat(mobile): Profile in two columns`.

### Task 6.3: A booking

- Modify: `apps/mobile/src/app/bookings/[id]/index.tsx` (wrap its parts;
  the trip-day thread's parts keep their logic); test `booking.test.tsx`,
  `trip-day.test.tsx`.
- [ ] At 1280: status, the trip day's parts, where to stand and the driver
  in `columns-main`; the ride, the price and the actions in `columns-side`.
  Commit `feat(mobile): a booking in two columns`.

## PR 7: Offer a ride and the driver's trip

### Task 7.1: The posting steps

**Files:**

- Create: `apps/mobile/src/trips/trip-so-far.tsx`
- Modify: `apps/mobile/src/trips/step-screen.tsx`, `trips/route-step.tsx`,
  the five step screens under `app/drive/trips/[id]/` and `(tabs)/offer.tsx`,
  `en.ts`, `is.ts` (`post.soFar`, `post.soFarLater`), `e2e/laptop.spec.ts`
- Test: `apps/mobile/src/__tests__/post-a-trip.test.tsx`

**Interfaces:**

- Produces: `TripSoFar({ draft, step })`: a card "Your trip so far" with a
  line each for the route, the day and times, the price and the seats: the
  draft's value once its step is done, else "Step N" in `textMuted`.
- Produces: `StepScreen` prop `map?: ReactNode`. Wide: `Screen
  width="page"` with `Columns`; the side column holds `map`, `TripSoFar`
  and `footer`; no bottom bar. Not wide: as today.

- [ ] **Step 1: Failing tests** at 1280: on step 1 the route map is in
  `columns-side`, not under the fields; "Your trip so far" shows the route
  once chosen and "Step 3" for the price; the main button is in
  `columns-side` and there is no `bottom-bar`; stops switched off on step
  1 stay off after the window goes to 390 and back (Review Focus 1).
- [ ] **Step 2 to 5:** Run, implement, run, commit `feat(mobile): posting a trip in two columns`.

### Task 7.2: The driver's trip

- Modify: `apps/mobile/src/app/drive/trips/[id]/index.tsx`; test
  `driver-requests.test.tsx`.
- [ ] At 1280: requests and passengers in `columns-main`; seats on each
  stretch and the actions in `columns-side`. Commit `feat(mobile): the driver's trip in two columns`.

### Task 7.3: Finish

- [ ] Before and after screenshots of every changed screen at 1440 wide to
  the project files; spec 18's status line says built; the plans index row
  says merged.
