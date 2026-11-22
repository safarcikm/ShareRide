# PuffinRide logo and puffins implementation plan

**Owner:** Martin · **Date:** 2026-11-22 · **Status:** Logo C chosen by
Martin (2026-11-22, decision card); PR 1 merged (#203), PR 2 merged (#205),
PR 3 merged (#213): done

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** the app wears PuffinRide's new look: logo C, the puffin pin, as
its icon and logo (PR 1), then our puffins in place of the shape people in
the seat view (PR 2), then the board's other puffins on the front page, on
empty screens and when a seat is booked (PR 3).

**Design:** [spec 15](../specs/2026-11-13-visual-design-system.md),
sections 4.2 and 4.9 and decision 12. Martin chose from three directions
drawn side by side (A, two puffins in a little open car; B, Lundi, a
puffin's head in a knitted hat; C, the puffin pin) and a board of how the
puffins sit in the app. Moss stays the main colour. The text and domain
rename is another thread's work (texts, `app.json` name and IDs).

**Drawings:** the puffin is drawn from simple shapes, with no tracing. The
generator that writes `apps/mobile/assets/logo/*.svg` keeps every transform
worked out, so the drawing files and the `Logo` part share their outlines;
it lives with the design boards in the project files
(`puffinride-look/src/pin.py`), as logo A's did.

## PR 1: the puffin pin as icon and logo

- [x] **Test first:** `apps/mobile/src/components/logo.test.tsx`, the
  `Logo` part draws the same outlines as `assets/logo/icon.svg`. It passed
  on logo A, then failed once the drawings were the puffin pin.
- [x] Drawings: `icon`, `icon-dark`, `icon-tinted`,
  `android-icon-foreground` (64%, inside the safe circle),
  `android-icon-monochrome`, `splash-icon` and `favicon` in
  `apps/mobile/assets/logo`; pictures exported with
  `node scripts/export-icons.ts` (`PLAYWRIGHT_CHROMIUM_PATH` in a cloud
  session). `app.json` needs no change: the same files, the same moss.
- [x] **Test first:** `packages/ui/src/tokens.test.ts`, the puffin's face
  stands out from its black by 3:1 on the moss icon and the dark one; then
  the `puffin` drawing colours in `packages/ui/src/tokens.ts`.
- [x] `apps/mobile/src/components/logo.tsx` draws the pin from the tokens.
- [x] Spec 15: sections 4.2 and 4.9, decision 12, the logo picture and the
  three directions; the changelog.
- [x] `pnpm check`, the web build, review, then merge when CI is green (#203).

## PR 2: puffins in the seat view

- [x] Spec 15, section 5.3: the shape people become puffins facing the way
  the car drives. The driver wears a knitted hat in their people colour, you
  wear a moss scarf on your `primarySoft` seat with its `primary` outline,
  and a taken seat shows a grey puffin with no colour. The puffin's black
  stays basalt in dark mode: the seats around it are lighter than the
  screen, and its white face carries it.
- [x] **Test first:** `apps/mobile/src/trip-details/seat-view.test.tsx`,
  the driver's puffin wears the driver's colour, yours a moss scarf, a taken
  seat's puffin has none of the puffin's or the people colours, and the
  booked screen's seat shows you.
- [x] `apps/mobile/src/components/puffin.tsx`: the `Puffin` drawing, in
  colour or grey, with an optional hat or scarf. `seat-view.tsx` uses it in
  place of `Person` (pebble, mountain, dome) and the driver's `KnittedHat`;
  no other screen drew a shape person.
- [x] `pnpm check`, the web build and the look screenshots, review, merge
  (#205).

## PR 3: puffins on the front page, empty screens and the booked screen

Martin asked for "all the cute graphics" of board 2 (2026-11-22); spec 15,
section 5.3 ("Puffin scenes") and decision 13.

- [x] Spec 15: principle 2, the night black in section 4.2, the scenes in
  section 5.3 and decision 13.
- [x] **Test first:** `packages/ui/src/tokens.test.ts`, the puffin's face
  stands out from the night black by 3:1; then `puffin.nightBlack`.
- [x] **Test first:** `apps/mobile/src/components/puffin-scenes.test.tsx`:
  the car carries the driver's puffin in a crowberry hat and yours in a moss
  scarf; `moving` adds the lines behind it; the puffin by the pin wears a
  crowberry scarf; in dark mode both lift the puffin's black; both are
  hidden from screen readers. `Puffin` takes the black to draw in, and
  `sizes` gets the scenes' sizes.
- [x] `apps/mobile/src/components/puffin-scenes.tsx`: `PuffinsInCar` and
  `PuffinByPin`, every colour from the tokens.
- [x] **Test first:** the screens: the front page shows the car (phone and
  wide), the booked screen the moving car once confirmed and your seat while
  requested, and the four empty screens the puffin by the pin.
- [x] The screens: `app/(tabs)/index.tsx`, `app/bookings/[id]/booked.tsx`,
  `app/rides/index.tsx`, `app/(tabs)/my-rides.tsx`,
  `chat/conversation-list.tsx` and `app/drive/trips/index.tsx`.
- [x] `pnpm check`, the web build, a look at the screens in light and dark,
  review, merge.
