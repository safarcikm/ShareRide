# Spec 33: A few small animations on the website and in the apps

**Owner:** Martin · **Date:** 2026-11-27 · **Status:** Accepted
(2026-11-28): Martin asked for animations and about the front page's
banner, chose how the banner moves (section 12, "Drive in, then hop") and
accepted the spec and ADR 0052 with the banner's release; the moments
after the App Store release are working choices he can still change

Amends: [spec 15, 4.6](2026-11-13-visual-design-system.md#46-motion)
(motion: two drawings may move on their own, once and briefly, and touch
taps come in) and [spec 15, section 10](2026-11-13-visual-design-system.md#10-out-of-scope)
(haptics are no longer out of scope). Keeps
[spec 16, 3.9](2026-11-15-one-home-and-simpler-flows.md) (pull to refresh)
and [spec 31](2026-11-26-one-ride-one-ticket.md) (the road) as they are,
adding motion to the road only. [ADR 0052](../decisions/0052-animations-css-on-the-web-reanimated-on-phones.md)
records how: CSS on the website, Reanimated and `expo-haptics` in the phone
apps.

## 1. Problem and goal

Martin, 2026-11-27: "Just an idea should we have some animations on the
apps and web and if so when should we build them", and on hearing a few
suggestions: "yes what about the main banner".

Today nothing in PuffinRide moves except press feedback (a part moves down
by its edge) and the pull-to-refresh mark, which follows the finger. Spec
15 chose that on purpose: "Nothing moves on its own: no looping
animations." The seat "pop" that spec 15 asked for was never built. The
puffins and their yellow car give the look its character, but they stand
still, even at the moment a seat is booked.

**Goal:** a handful of small moments that move, each for a reason, in the
look we have. Nothing that slows a search, nothing on a price, and nothing
that moves for someone who asked their phone or computer for less motion.

One idea decides the whole list: **the more often someone sees a thing,
the less it moves.** What people see many times a day (tabs, lists,
typing, scrolling) does not move. What they see now and then (a menu
opening, a step forward) moves briefly, to show where it came from. Rare
moments (the first look at the front page, a booked seat) may show a little
joy.

## 2. User stories

- As a visitor opening puffinride.is, I see the puffins' car arrive, so the
  site feels friendly; I can start typing my search at once.
- As a passenger who just booked a seat, I see the puffins celebrate and,
  on a phone, feel a short tap, so I know it worked.
- As a driver offering a ride, I see the car roll on to the next step, so I
  know where I am.
- As someone who turned on Reduce motion, nothing slides or bounces for
  me, and nothing is missing.
- As someone on an old phone, animations never hold me up: I can tap and
  type while they play.

## 3. Behaviour

### 3.1 What moves

| # | Where | What moves | How long | Why |
| - | ----- | ---------- | -------- | --- |
| A1 | The front page's banner (3.2) | The car drives in and stops; the puffins hop (Martin chose this, section 12) | About 1.9 s, once a visit | First look, joy |
| A2 | Seat booked (3.3) | The car drives in with its speed lines, dips as it stops, the puffins hop; on a phone, a success tap | About 1.9 s | It worked |
| A3 | Request sent (3.3) | The puffin in its frame rises into place; on a phone, a light tap | 300 ms | It was sent |
| A4 | The road while offering a ride (3.4) | The car rolls from the last step to the new one; the moss line grows with it | 400 ms | Where you are |
| A5 | Choosing seats (3.5) | The seat just added pops (spec 15, 4.6); on a phone, a tick | 150 ms | It counted |
| A6 | Menus, place lists, the calendar, the Share panel, questions that ask "Are you sure?" (3.6) | Open: fade in and move 8 points out of what opened it. Close: fade out | 180 ms in, 120 ms out | Where it came from |
| A7 | Moving between screens (3.7) | Phones: the system's own slide, as today. Website: nothing, as today | As the system | Where you went |
| A8 | Presses (3.8) | As today, instant. On a phone, a tap for a few presses that finish something | Instant | It worked |

Everything else stays still (3.10).

### 3.2 The front page's banner

The Iceland scene at the top of Find, with the yellow car and its two
puffins (spec 15, 5.3, decision 15). The words, the search and the rides
around it are there and usable from the first frame; only the drawing
moves. The scene changes with the seasons and festive days, and their
moments play with the arrival: [spec 36](2026-11-28-seasonal-banner.md).

**"Drive in, then hop"**, which Martin chose (A in section 12):

1. **0 to 1.1 s:** the car drives in from the left and slows to a stop in
   its place, its body bobbing twice on the road.
2. **1.1 to 1.5 s:** as it stops, its nose dips a little and it settles,
   as a car does when it brakes.
3. **1.4 to 1.9 s:** the puffin in the moss scarf hops in its seat, then
   the driver in the crowberry hat. Then everything is still.

- **On a phone** the car comes in from beyond the screen's left edge to the
  middle, on the road.
- **On a laptop** the car stands on the hills to the right of the title,
  in the room the title keeps free for it. It comes out of that room's left
  edge: it starts its own length and a little more (about 190 points) to
  the left of its place, where the room hides it, and rolls in, fading in
  over the first part of the way. The room's left edge is soft, and the car
  never passes under the words.
- **Once a visit:** on the website, the first time Find shows after the
  page loads; in the apps, the first time Find shows after the app starts.
  Not when coming back to Find from another screen, not on pull to refresh
  and not when the logo refreshes Find.
- **Dark mode:** the same, in the night scene.
- **Reduce motion on:** the car is simply in its place (3.9).

The other ways Martin looked at are in section 12. The
[moving preview](https://claude.ai/artifact/HMFn994Ev1s7TBfiw8FZKv)
([its source](images/small-animations/preview.html)) plays all four on a
phone and the recommended one on a laptop, in light and dark, and shows
what Reduce motion does.

### 3.3 A booked seat, and a request sent

- **Seat booked** (the booked screen, after booking at once or after
  paying): the car, 200 wide with its speed lines as today, drives in from
  the left to the middle, dips as it stops, and its puffins hop, as on the
  front page; about 1.9 s. On a phone, a success tap comes with the screen,
  at the moment the booking is known to have worked. The title "You're
  booked!" and the steps under it are there from the first frame; the car
  never holds them back.
- **Request sent:** the puffin in its frame (`YourSeat`) rises 8 points into
  place as it fades in, in 300 ms. On a phone, one light tap.
- **Ride published:** no new drawing; on a phone, a success tap with the
  screen.

### 3.4 The road while offering a ride

On the steps of offering a ride (Route, Time, Seats, Price, Check; spec 31,
3.2), when the next step opens with "Next", the car starts at the mark of
the step before and rolls to the new one in 400 ms, the moss line behind it
growing with it. Going back rolls it back. On the booking page the road
stands still: it shows where a booking is, and nothing there changed by
the person's own press.

### 3.5 Choosing seats

Spec 15 (4.6) asked for this and it was never built: when the seat count
goes up, the seat just added in the seat view pops (from 0.9 to full size,
150 ms). Going down, the seat simply empties. On a phone, each step of the
count gives a selection tick (3.8).

### 3.6 Things that open

Menus, the list of places under From and To, the calendar, the "Share this
ride" panel and "Are you sure?" questions open with a fade and an 8-point
move out of the part that opened them (a list under its field comes down
from it; a question in the middle of the screen rises), in 180 ms, and
close with a fade in 120 ms. Nothing waits for them: a tap on a place in
the list works while it is still fading in.

### 3.7 Moving between screens

- **Phones:** the system's own screen changes, as today: on an iPhone the
  new screen slides in from the right, on Android as the phone does it.
  The menu's tabs change at once and never slide (they are side by side,
  not one inside another). With reduce motion on, screens fade instead of
  sliding.
- **Website:** pages change at once, as websites do. No slide, no fade.

### 3.8 Touch taps on phones (haptics)

A short tap felt in the hand, only in the iPhone and Android apps, always
with something seen at the same moment, at most one per press, and never
on scrolling, screen changes or animations the person did not cause.

| When | Tap |
| ---- | --- |
| Seat booked, a seat confirmed by paying, a request accepted (the driver), a ride published | Success |
| A request sent; pull to refresh passing the point where it will refresh | Light |
| The seats or price count stepping up or down; a switch turned on or off | Tick |
| A press that fails with an error message (booking, publishing, a wrong code) | Error, with the message |

The phone's own settings decide: with system haptics off on an iPhone, or
touch feedback off on Android, there are no taps. The website has none.

### 3.9 Reduce motion

PuffinRide follows the system setting; there is no switch of its own.

- **Website:** the browser's `prefers-reduced-motion` (Reduce motion on a
  Mac or iPhone, "Animation effects" off in Windows, "Remove animations" on
  Android).
- **Apps:** Reduce Motion on an iPhone, "Remove animations" on Android.

With it on, the cars and puffins are simply in their places, the road's car
stands on its new step, the seat does not pop, things that open only fade
(120 ms, no rise), and phone screens fade instead of sliding. Taps stay:
they are not motion, and the phone's own settings turn them off.

### 3.10 What stays still

| Not animated | Why |
| ------------ | --- |
| Switching tabs | Seen dozens of times a day; tabs are side by side |
| Ride cards coming into a list, one after another | Seen on every search; it slows the reading of times and prices |
| Prices, times, seat counts and names | Never on money or facts (as spec 15 keeps puffins off them) |
| Loading placeholders that shimmer | Nothing of ours loops (R33.3). The system's own spinner, while a button or screen waits for the server, stays as it is |
| A car or road that keeps moving | Nothing loops; see option D in section 12 |
| Scrolling effects (parallax) | Can make people feel sick, and fights the page |
| Confetti, sounds, a moving logo or opening screen, animated emails | Noise; emails must work everywhere |
| The map | Still, as today |

### 3.11 When

1. **The website's banner first**, once Martin chooses how it moves: one
   pull request, CSS only, nothing for the phones (they keep the car
   standing still until 3). It goes live on puffinride.is with the next
   release, on Martin's go as always. **Recommended**, because the website
   has its own releases and the change touches no phone build.
2. **The first App Store release** of the phone apps (spec 32) goes ahead
   as it is, with nothing of this spec, so its builds and checks are not
   redone.
3. **After that release:** the motion kit and the rest of the list, A1 to
   A8, on the website and the phones together, as app version 1.1 in both
   stores. Reanimated and `expo-haptics` are native parts of the app, so
   they need a new store build; an over-the-air update cannot add them.

## 4. Rules

| ID | Rule |
| -- | ---- |
| R33.1 | Nothing that moves holds anything up: words, prices and buttons are there and work from the first frame. |
| R33.2 | Only position, size and see-through (transform and opacity) animate, so nothing on the page shifts. |
| R33.3 | No drawing or part of ours loops, and nothing moves on its own for more than 5 seconds (WCAG 2.2, 2.2.2). The system's spinner while waiting is not ours. |
| R33.4 | With reduce motion on, nothing moves; things only fade (3.9). |
| R33.5 | An animation plays once for its cause; coming back to a screen does not play it again. |
| R33.6 | A touch tap comes only on a phone, with something seen at the same moment, at most one per press. |
| R33.7 | Durations and curves come from the motion tokens (section 6), never typed into a screen. |
| R33.8 | Nothing about a price, a time, a name, a photo or a payment moves. |

## 5. Screens

The [moving preview](https://claude.ai/artifact/HMFn994Ev1s7TBfiw8FZKv)
(its source is [images/small-animations/preview.html](images/small-animations/preview.html),
a page for the Artifact viewer) shows:

- the front page's banner on a phone in the four ways of section 12, with
  "Play again", and the recommended way on a laptop;
- a booked seat and a request sent;
- the road rolling on with "Next" and "Back";
- seats popping, and a menu opening and closing;
- a switch that shows everything as it is with Reduce motion on.

It draws the same car, puffins and scene as the app, from the same shapes
and colours, in the reader's light or dark mode.

## 6. Implementation

- **Motion tokens** in `packages/ui/src/tokens.ts`, `motion`: durations
  (`quick` 120, `pop` 150, `open` 180, `appear` 300, `step` 400, `drive`
  1100, `celebrate` 1900 ms) and curves (`out` cubic-bezier(0.23, 1, 0.32,
  1) for things arriving, `inOut` cubic-bezier(0.77, 0, 0.175, 1) for
  things moving on the screen, `brake` cubic-bezier(0.33, 1, 0.68, 1) for
  the car slowing to a stop, and for a hop `rise` cubic-bezier(0.25, 0.6,
  0.4, 1) up, then `fall` cubic-bezier(0.5, 0, 0.75, 0) down as things
  fall). Never `ease-in` on its own: it starts slowly, just when people
  look; `fall` only ever follows `rise`. The arrival's timings and how far
  its parts move (two bumps of 1.6 and 1.3 points, a dip of 2.6 degrees, a
  hop of 5 points) are tokens too (`motion.arrival`). The preview uses
  exactly these.
- **Website** (ADR 0052): CSS keyframes in one style sheet added at start,
  as the focus ring already is (`theme/focus-ring.web.ts`), with the
  reduce-motion media query inside it; the parts that move carry a data
  attribute. The browser runs these off the main thread, they start with
  the first frame, and the website downloads nothing new.
- **Phones** (ADR 0052): Reanimated 4 with `react-native-worklets`, and
  `expo-haptics`, added with `npx expo install` in the 1.1 build.
  Reanimated reads reduce motion itself (`ReduceMotion.System`).
- **One small motion kit**, `apps/mobile/src/motion/`: a few parts
  (for example `DriveIn`, `Hop`, `Appear`, `Pop`, `RollTo`) and a `tap`
  helper, each with a `.web.tsx` twin, so screens use the same parts
  everywhere and the website never loads Reanimated. The car's body,
  puffins and speed lines become their own groups in `PuffinsInCar` so the
  kit can move them; the drawing itself does not change, and the ads and
  link pictures that copy it stay as they are.
- **Screen changes** keep the native stack's own animation; under reduce
  motion the stack's `animation` is `fade`.
- **Once a visit** is a flag kept in memory, not in storage. On the
  website the arrival is over when the driver's hop, which moves last,
  ends or stops (`animationend` or `animationcancel`), not after a timer:
  so a late first frame or a tab opened behind another never cuts it
  short, and leaving Find meanwhile ends it. With reduce motion on it is
  over at once.

## 7. Privacy and safety

No personal data: nothing is stored, sent or counted. Taps need no
permission on either phone. Animations follow the reduce motion setting,
which helps people with vestibular disorders and migraines; nothing
flashes (WCAG 2.3.1).

## 8. Texts

No new or changed words. The drawings stay hidden from screen readers, as
today.

## 9. Testing

- **Unit (Jest):** each motion part renders its end state at once with
  reduce motion on; the banner plays once a visit and not on return to
  Find; `tap` does nothing on the web; the haptics module is mocked and
  each case in 3.8 calls it once.
- **Website journeys (Playwright):** run with reduced motion, so pictures
  stay steady; one journey with motion on waits for the car and checks it
  ends exactly where it stands today; one checks that typing into From
  works while the car is still driving.
- **Page speed:** Lighthouse on the front page shows no layout shift from
  the banner (CLS 0) and the same first paint as before.
- **Phones:** the emulator and simulator journeys (spec 32, 3.7) still
  pass. By hand, on the slowest Android phone at hand and an iPhone, in a
  release build: the banner, a booked seat, the road, a menu, each tap,
  and all of it again with Reduce motion on.

## 10. Out of scope, later

- Sound.
- Animations made in other tools (Lottie, After Effects).
- A moving opening screen or app icon.
- Gestures that drag sheets or swipe rows (no such parts yet).
- A puffin flying past on the front page, unless Martin picks option C in
  section 12.

## 11. Martin's steps

1. ~~Choose how the banner moves~~ (done: "Drive in, then hop",
   2026-11-27).
2. Say when the website's banner may go live with a release (3.11, step 1).
3. After the 1.1 build: try it on a phone, with Reduce Motion on and off.

## 12. Decision for Martin

How the front page's banner moves. **Martin chose "Drive in, then hop"** on
a decision card, 2026-11-27, after the
[moving preview](https://claude.ai/artifact/HMFn994Ev1s7TBfiw8FZKv). The
options were:

| Option | What happens |
| ------ | ------------ |
| **A. Drive in, then hop** (recommended) | The car drives in and stops with a little dip, then both puffins hop. About 1.9 s, once a visit, then still. Lively but short, and it ends before anyone has typed a place. |
| B. Drive in only | The car drives in and stops with the dip; the puffins stay still. About 1.5 s. The quietest. |
| C. Drive in, and a fly-by | As A, and a third puffin flies past behind the car, wings beating, from left to right. About 4 s. The most joy, but a new drawing, and the longest moment, which draws the eye across the page while people start their search. |
| D. Keep driving | The car stays in the middle and bobs while the road's line slides past, all the time, with a pause button (WCAG 2.2.2 asks for one). Breaks spec 15's "nothing loops", pulls the eye from the search and uses battery. |

## 13. Decisions

| # | Question | Answer |
| - | -------- | ------ |
| 1 | Animations at all? | Yes, a few (Martin, 2026-11-27) |
| 2 | How does the banner move? | "Drive in, then hop" (Martin, 2026-11-27, section 12) |
| 3 | When? | Website banner first; the rest after the first App Store release, as 1.1 (my call, 3.11) |
| 4 | Which moments move? | A1 to A8 (my call, 3.1) |
| 5 | Touch taps? | Yes, on phones, for the moments in 3.8 only (my call) |
| 6 | An in-app switch for motion? | No: the system's reduce motion setting (my call, 3.9) |
| 7 | How is it built? | CSS on the website, Reanimated and `expo-haptics` on phones (my call, ADR 0052) |
