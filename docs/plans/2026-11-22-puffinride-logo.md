# PuffinRide logo and puffins implementation plan

**Owner:** Martin · **Date:** 2026-11-22 · **Status:** Logo C chosen by
Martin (2026-11-22, decision card); PR 1 in review

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** the app wears PuffinRide's new look: logo C, the puffin pin, as
its icon and logo (PR 1), then our puffins in place of the shape people in
the seat view (PR 2).

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
- [ ] `pnpm check`, the web build, review, then merge when CI is green.

## PR 2: puffins in the seat view

- [ ] Spec 15, section 5.3: the shape people become puffins facing the way
  the car drives. The driver wears a knitted hat in their people colour, you
  wear a moss scarf on your `primarySoft` seat with its `primary` outline,
  and a taken seat shows a grey puffin with no colour. In dark mode the
  puffin's black lifts to `#2E3D45` so it shows on the dark car.
- [ ] **Test first:** in the seat view's tests, each kind of seat still
  draws its person, and the driver's hat takes the driver's colour.
- [ ] `apps/mobile/src/trip-details/seat-view.tsx`: a `Puffin` drawing in
  place of `Person` (pebble, mountain, dome), from the same outlines as the
  logo's puffin; the `puffin` tokens gain the night black.
- [ ] Screens that draw a shape person elsewhere (the driver's seats step)
  follow.
- [ ] `pnpm check`, the web build and the look screenshots, review, merge.

Puffins on the front page, on empty screens and when a seat is booked (the
board's other ideas) come after, when Martin has seen PR 2.
