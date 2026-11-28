# Plan: A few small animations

Spec: [spec 33](../specs/2026-11-27-small-animations.md); how it is built:
[ADR 0052](../decisions/0052-animations-css-on-the-web-reanimated-on-phones.md).
Two stages (spec 33, 3.11): the website's banner now, the rest after the
phone apps' first App Store release. Each pull request with its tests
first.

## PR 1: the front page's car arrives on the website (`feat(motion)`)

In the same pull request as spec 33 and ADR 0052 (#292). Phones do not
change: every mark below gives them nothing until PR 2.

- [x] **Motion tokens.** `packages/ui/src/tokens.ts`: `motion` with the
  durations and curves of spec 33, section 6, and the arrival's timings
  (drive 1100, settle 1500, hops at 1400 and 1540 for 300 ms each, done by
  1900). Test first: `tokens.test.ts` (the arrival is over by
  `celebrate`, under 5 s, R33.3; no curve starts slowly).
- [x] **The style sheet.** `apps/mobile/src/theme/motion-css.ts`:
  `motionCss()` with the keyframes (arrive, arrive with a fade, settle,
  hop), the car's room on a laptop (clipped, a soft left edge) and the
  reduce motion media query that stops them all.
  `theme/motion-sheet.web.ts` adds it once, as `installFocusRing` does;
  `motion-sheet.ts` does nothing on phones. Test first:
  `motion-css.test.ts`.
- [x] **Marks and the arrival.** `apps/mobile/src/theme/motion.ts`:
  `motionMark(part)` (on the website a `data-motion` attribute; phones
  nothing), `arrivalProps(from)` and `useArrival()`: true the first time
  Find shows after the page loads, until the arrival is over; never on
  phones yet. The page says when it is over (`whenArrived` in
  `motion-sheet.web.ts`): when the driver's hop ends or stops, or at once
  with reduce motion on. Test first: `motion.test.tsx`,
  `motion-sheet.web.test.ts`.
- [x] **The car.** `PuffinsInCar`: its body and each puffin in a group of
  their own, marked; `arriveFrom` puts the arrival on its root. The drawing
  does not change. Test: `puffin-scenes.test.tsx`.
- [x] **Find.** Phone: the car comes from beyond the left edge,
  `-(window width + car) / 2 - spacing.sm`. Laptop: the car in a room of
  its own, the column the title keeps free (`carFromEdge + car +
  spacing.lg`), rolling in from that room's left edge. Test first:
  `welcome.test.tsx` (on the website, the marks on the first showing and
  not after; the room; nothing on phones).
- [x] **Journeys.** `playwright.config.ts`: `reducedMotion: "reduce"` for
  every journey, so pictures stay steady. `e2e/banner.spec.ts` with motion
  on: the car starts left of its place and ends in it, then nothing moves;
  From takes typing while the car drives; on a laptop the car's room
  starts right of the title's words; an arrival that starts late is not
  cut short; with reduce motion nothing moves; leaving Find while the car
  drives and coming back does not play it again.
- [x] **Docs.** Spec 15, 4.6 points at spec 33; CHANGELOG; plans index.

Run with Node 26 (`.nvmrc`): on Node 22 Jest stalls in `welcome.test.tsx`
("Find, signed in"), with or without these changes.

## Stage 2: after the first App Store release

Built as app version 1.1 (spec 33, 3.11, step 3). The details come when
stage 1 is live and the release is done.

- **PR 2, the motion kit on phones:** Reanimated 4,
  `react-native-worklets` and `expo-haptics` with `npx expo install`; the
  Jest setup; `apps/mobile/src/motion/` with web twins; `useArrival` on
  phones (once after the app starts); the banner on phones.
- **PR 3, a booked seat and a request sent:** A2 and A3, and the taps for
  booked, paid, accepted and published.
- **PR 4, the road and the seats:** A4 on the steps of offering a ride, A5
  in the seat view, with ticks.
- **PR 5, things that open and the rest of the taps:** A6, screens fading
  under reduce motion (A7), the light and error taps (3.8).
- **Then:** a 1.1 build through the phone journeys, and Martin's check on a
  real phone with Reduce Motion on and off.
