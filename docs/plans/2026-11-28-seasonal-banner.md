# The front page's banner through the year: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the Iceland scene at the top of Find follows the year on its own,
in the Clear day colours: four seasons, eight big days and five smaller
ones, each with its look, a greeting and a short moment, behind one console
switch.

**Architecture:** one pure function in `packages/domain` turns Iceland's
date into `{ season, day }`. The colours are tokens. The drawing is
react-native-svg, ported from the preview's `scene()`, `car()`, `hat()`,
`puffin()`, `loads` and `overlay()` (the reference for every shape, size and
colour: [`preview.html`](../specs/images/seasonal-banner/preview.html)). The
moments are CSS keyframes in the website's motion sheet (ADR 0052), on parts
marked with `motionMark`; phones show the still look. Three pull requests,
each shippable on its own: the seasons, the days, the moments.

**Tech stack:** TypeScript, Vitest (domain, ui), Jest and RNTL 14 (app),
react-native-svg, Hono (API), React (console), Playwright (website journeys).

**Spec:** [spec 36](../specs/2026-11-28-seasonal-banner.md), Accepted
2026-11-28 with Clear day, every season and day, and greetings on.
[ADR 0056](../decisions/0056-a-switch-for-the-festive-days-on-the-front-page.md)
for the switch.

## Global constraints

- R36.1: every word on the scene keeps at least 4.5:1 with every colour it
  can stand on, light and dark (phone: `text` and `primary` on `skyTop`;
  laptop: `text` on `skyTop`, `sky`, `far`, `mountain`, `glacier`,
  `hillBack`, `hill`).
- R36.2: the day is Iceland's date; season and day come from `bannerFor`
  in `packages/domain`, nowhere else.
- R36.3 and R33.2: a moment starts with the arrival, plays once a visit, is
  over within 3500 ms; only `transform` and `opacity` animate; nothing loops.
- R36.4: a moment ends on the day's look; with reduce motion on the look
  shows at once, still, and nothing that only moves (snow, leaves, flying
  puffins, firework trails) is drawn.
- R36.5: on a laptop the day's things and everything that moves stay in the
  car's room at the right.
- R36.6: greetings are i18n texts, `home.greeting.<day>`, in `en.ts` and
  `is.ts`, exactly as spec 36, 3.4 and 3.5 give them.
- R36.7: `festive_days` off shows the season only: no day look, greeting or
  moment.
- Colours only from tokens (`icelandScene`, `icelandSeasons`,
  `bannerDrawing`, `people`, `puffin`, `puffinCar`); no raw colours in
  components.
- No new dependency. Phones get no motion (spec 33, 3.11).
- Node 26 for Jest (`.nvmrc`).

## Review focus

1. A date near midnight UTC on a device in another time zone: the banner
   follows Iceland's date (`inIceland(at)`), not the device's. Test in Task 4.
2. `?day=` with nonsense (`2027-02-30`, `banana`, `2027-6-17`) shows today's
   banner and no error; on a phone the parameter is ignored. Test in Task 4.
3. Sjómannadagurinn when the first Sunday of June is Whitsunday (2028, 2031,
   2033, 2036): by law (Act 20/1987, to check) it moves to the second
   Sunday. Test in Task 1.
4. Find opened again in the same visit, or after pulling to refresh: the
   still look, no moment, nothing left half-way. Test in Task 10.
5. The switch turned off while Find is open: the day goes within the config
   read (5 minutes) without a jump in the page's layout other than the
   greeting going. Test in Task 7.

---

## Pull request 1: the seasons in Clear day colours

### Task 1: the calendar

**Files:**

- Create: `packages/domain/src/banner/banner.ts`, `packages/domain/src/banner/index.ts`
- Modify: `packages/domain/src/index.ts` (export `./banner/index.ts`)
- Test: `packages/domain/src/banner/banner.test.ts`

**Interfaces:**

- Produces:
  - `seasons = ["winter", "spring", "summer", "autumn"] as const`, `type Season`
  - `bannerDays = ["christmas", "newyear", "easter", "summerday", "june17",
    "longweekend", "winterday", "dec1", "bondadagur", "konudagur",
    "bolludagur", "oskudagur", "seafarers"] as const`, `type BannerDay`
  - `interface CalendarDate { year: number; month: number; day: number }`
  - `interface Banner { season: Season; day: BannerDay | null }`: `season`
    is the scene the banner is drawn in (the day's own, 3.4, else the
    date's)
  - `bannerFor(date: CalendarDate, options: { festiveDays: boolean }): Banner`
  - `easterSunday(year: number): CalendarDate`
  - `parseCalendarDate(text: string): CalendarDate | null` (strict
    `YYYY-MM-DD`, a real date, years 2000 to 2099)

- [ ] **Step 1: Write the failing tests** in `banner.test.ts`:
  - `easterSunday` for 2026 to 2038: 04-05, 03-28, 04-16, 04-01, 04-21,
    04-13, 03-28, 04-17, 04-09, 03-25, 04-13, 04-05, 04-25.
  - The one-day days, `bannerFor(d, { festiveDays: true }).day`, for 2026
    to 2036: first day of summer (`summerday`) 04-23, 04-22, 04-20, 04-19,
    04-25, 04-24, 04-22, 04-21, 04-20, 04-19, 04-24; first day of winter
    (`winterday`) 10-24, 10-23, 10-21, 10-27, 10-26, 10-25, 10-23, 10-22,
    10-21, 10-27, 10-25; Bóndadagur 01-23, 01-22, 01-21, 01-19, 01-25,
    01-24, 01-23, 01-21, 01-20, 01-19, 01-25; Konudagur 02-22, 02-21,
    02-20, 02-18, 02-24, 02-23, 02-22, 02-20, 02-19, 02-18, 02-24;
    Bolludagur is Easter Sunday minus 48 days and Öskudagur minus 46
    (2027: 02-08 and 02-10); 17 June, 1 December, 31 December, 1 January.
  - Sjómannadagurinn: the first Sunday of June (2027-06-06), and the second
    when the first is Whitsunday, Easter plus 49 days (2028-06-11,
    2031-06-08, 2033-06-12, 2036-06-08).
  - Spans: Easter from Maundy Thursday to Easter Monday (2027-03-25 to
    03-29, and 2027-03-24 is not Easter); the long weekend from the
    Wednesday before the first Monday of August to that Monday (2027-07-28
    to 08-02; 07-27 and 08-03 are not); Christmas 12 to 30 December and
    2 to 6 January (12-11 and 01-07 are not).
  - Seasons: 03-31 winter, 04-01 spring, 05-31 spring, 06-01 summer,
    08-31 summer, 09-01 autumn, the day before the first day of winter
    autumn, 12-25 with `festiveDays: false` is winter with `day: null`.
  - The scene a day is drawn in: Easter on 2027-03-25 is `spring` (the date
    is winter); `winterday` is `autumn` (it turns white as its moment);
    `seafarers` is `summer`; `dec1` is `winter`.
  - Two days together: 2038-04-22 is `summerday` (also Maundy Thursday);
    2027-12-31 is `newyear`, not Christmas.
  - `parseCalendarDate`: `"2027-06-17"` gives `{ 2027, 6, 17 }`;
    `"2027-02-30"`, `"2027-6-17"`, `"banana"`, `""` and `"1999-01-01"` give
    `null`.

- [ ] **Step 2: Run** `pnpm --filter @shareride/domain test -- banner`.
  Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `banner.ts`. Weekday arithmetic on
  `Date.UTC` only (pure, no time zone). Easter: the anonymous Gregorian
  algorithm. A day wins over another in this order: newyear, dec1, june17,
  summerday, winterday, bondadagur, konudagur, bolludagur, oskudagur,
  seafarers, easter, longweekend, christmas. Each day's scene: christmas,
  newyear, dec1, bondadagur, konudagur, bolludagur, oskudagur winter;
  easter, summerday spring; june17, longweekend, seafarers summer;
  winterday autumn.
- [ ] **Step 4: Check the rule for Sjómannadagurinn** against Act 20/1987
  (lög um sjómannadag) and two years of the almanac (Almanak Háskóla
  Íslands); if the law says otherwise, follow it and change the test.
  Correct spec 36, 3.5 in the same commit.
- [ ] **Step 5: Run** the tests. Expected: PASS. Run `pnpm --filter
  @shareride/domain lint typecheck`.
- [ ] **Step 6: Commit** `feat(banner): the season and day of a date in Iceland`.

### Task 2: the Clear day colours and the seasons' colours

**Files:**

- Modify: `packages/ui/src/tokens.ts`, `packages/ui/src/tokens.test.ts`
- Modify: `docs/specs/2026-11-13-visual-design-system.md` (5.3: the scene's
  colours are Clear day, varied by season on Find; link spec 36)

**Interfaces:**

- Consumes: `Season` (Task 1).
- Produces:
  - `icelandScene: Record<"light" | "dark", SceneColours>`: Clear day,
    `{ skyTop, sky, far, mountain, glacier, hillBack, hill, road, roadLine,
    roof }` (the preview's `PAL.clear`). `road` and `roadLine` stay the keys
    `road.tsx` and `ticket-parts` read.
  - `icelandSeasons: Record<Season, Record<"light" | "dark", SeasonColours>>`,
    `SeasonColours = SceneColours & { snow?: string }`, values from the
    preview's `PAL.winter`, `spring`, `summer`, `autumn` (colours only; what
    each season draws is the scene's, Task 3).
  - `bannerDrawing`: the drawing's own colours from the preview's `C`
    (`red`, `flagBlue`, `flagRed`, `navy`, `sky`, `choc`, `chocDark`, `tree`,
    `treeLight`, `tent`, `tentDark`, `bag`, `bagDark`, `guitar`, `bun`,
    `cream`, `jam`, `stem`, `lupine`, `lupineLight`, `heather`, `birch`,
    `aurora`, `aurora2`, `sunLow` = `#F6A15A`, `flakeEdge` = `#9FB3BF`,
    `nightFlake` = `#DCE7EC`) and `bannerHouse` (`wall`, `window`, light and
    dark, from `MODE`). Keep `people`, `puffin` and `puffinCar` for the
    colours they already have.

- [ ] **Step 1: Write the failing tests** in `tokens.test.ts`, replacing
  the scene's block: for each season and scheme, `text` and `primary` on
  `skyTop` at least 4.5; `text` on each of `skyTop`, `sky`, `far`,
  `mountain`, `glacier`, `hillBack`, `hill` at least 4.5; light and dark
  have the same keys. The same for `icelandScene`.
- [ ] **Step 2: Run** `pnpm --filter @shareride/ui test`. Expected: FAIL.
- [ ] **Step 3: Add the tokens.** Update the comment on `icelandScene`
  (spec 36, 3.1).
- [ ] **Step 4: Run** the tests, then `pnpm --filter @shareride/mobile test
  -- puffin-scenes welcome ticket-parts` and fix only what reads `.sky` of
  the old scene (Find's `topColour` now reads `skyTop`).
- [ ] **Step 5: Commit** `feat(banner): Clear day colours and each season's`.

### Task 3: the scene draws its season

**Files:**

- Create: `apps/mobile/src/banner/scene-layers.tsx` (the layers as
  components), `apps/mobile/src/banner/season-looks.ts` (what each season
  draws)
- Modify: `apps/mobile/src/components/puffin-scenes.tsx` (`IcelandScene`,
  `IcelandPanel`)
- Test: `apps/mobile/src/components/puffin-scenes.test.tsx`

**Interfaces:**

- Consumes: `Season`, `icelandSeasons`, `bannerDrawing`, `bannerHouse`.
- Produces:
  - `seasonLooks: Record<Season, Record<"light" | "dark", SeasonLook>>`,
    `SeasonLook = { caps: number; capDepth: number; house: boolean; stars:
    boolean; aurora: boolean; sun: "high" | "midnight" | null; flowers:
    boolean; lupines: boolean; heather: boolean; snowBanks: boolean }`,
    from the preview's `PAL` flags.
  - `IcelandScene` props: `season: Season` (required), `room?: readonly
    [number, number]` (the part of the width where the sky's and the hills'
    small things go; the whole width by default), with `width`, `height`,
    `ground`, `road` as today.
  - `IcelandPanel` props: `season: Season`, `room: number` (the car room's
    width at the right), with `height`, `ground`.
  - `sceneTop(season, scheme): string` (the colour above the scene, for
    Find's `topColour`).

- [ ] **Step 1: Write the failing tests:** `IcelandScene` renders a sky
  gradient from `skyTop` to `sky`; winter has `testID="snow-banks"` on the
  road and nine caps; dark winter has `testID="aurora"`; light summer has
  `testID="sun"` and `lupines`; dark summer `midnight-sun`; spring has
  `flowers`; autumn has `heather`; the farmhouse in every season; stars only
  in dark; on `road={false}` no banks. With `room={[600, 900]}` on a 900
  wide scene every lupine's x is within 600 to 900.
- [ ] **Step 2: Run** `pnpm --filter @shareride/mobile test --
  puffin-scenes`. Expected: FAIL.
- [ ] **Step 3: Port** the preview's `scene()` into `scene-layers.tsx`:
  `SkyGradient`, `Stars`, `Aurora` (tapered ribbons), `HighSun`,
  `MidnightSun`, `FarRange`, `Caps`, `BackHill`, `Farmhouse`, `Heather`
  (clipped to the hills), `Lupines`, `Flowers`, `SnowBanks`. Random
  placement from the preview's seeded `random(seed)` with seed 7, so the
  drawing is the same on every visit. Ids for gradients and clips from
  `useId`. Every layer keeps the existing `aria-hidden`.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(banner): the scene in its season`.

### Task 4: Find shows today's season

**Files:**

- Create: `apps/mobile/src/banner/use-banner.ts`
- Modify: `apps/mobile/src/app/(tabs)/index.tsx`
- Test: `apps/mobile/src/banner/use-banner.test.tsx`,
  `apps/mobile/src/__tests__/welcome.test.tsx`
- Modify: `docs/specs/2026-11-28-seasonal-banner.md` (3.9 as built)

**Interfaces:**

- Consumes: `bannerFor`, `parseCalendarDate`, `inIceland` (domain);
  `onWebsite`; `useLocalSearchParams` (expo-router).
- Produces: `useBanner(at: Date): Banner`. In this pull request it calls
  `bannerFor(date, { festiveDays: false })`; Task 7 gives it the switch.

- [ ] **Step 1: Write the failing tests:** at 2027-01-15T23:59Z the
  season is winter, and at 2027-06-01T00:00Z summer (the device's own
  zone does not matter); on the website `?day=2027-07-01` gives summer and
  `?day=2027-02-30` today's; on a phone `?day=` is ignored. On Find
  (`welcome.test.tsx`), with `now` at 2027-01-15 the scene's top colour is
  `icelandSeasons.winter.light.skyTop`.
- [ ] **Step 2: Run** and see them fail.
- [ ] **Step 3: Implement** the hook, and in Find pass `season` to
  `IcelandScene` and `IcelandPanel` (`room` = the car room's width,
  `carFromEdge + sizes.sceneCarWide + spacing.lg`) and `sceneTop` to
  `topColour`.
- [ ] **Step 4: Run** the tests, then `pnpm check`.
- [ ] **Step 5: Look** at the website in Chromium (phone 390 and laptop
  1280, light and dark) with `?day=` for one date in each season, against
  the preview's pictures.
- [ ] **Step 6: Commit** `feat(banner): Find shows today's season`, push,
  open pull request 1 (the template filled in), ask for a code review,
  merge once green.

## Pull request 2: the days

### Task 5: the puffins dressed up

**Files:**

- Modify: `apps/mobile/src/components/puffin.tsx`
- Test: `apps/mobile/src/components/puffin.test.tsx` (create if missing)

**Interfaces:**

- Produces: `PuffinLook` "colour" gains `headwear?: Headwear`, `glasses?:
  boolean`, `mask?: boolean`, and `PuffinDress = { headwear?: Headwear;
  scarf?: string; glasses?: boolean; mask?: boolean }` names that part for
  Task 6; `Headwear = { kind: "wool"; colour: string } |
  { kind: "yule" } | { kind: "party"; colour: string } | { kind: "crown" } |
  { kind: "sailor" }`. The existing `hat?: string` stays and means
  `{ kind: "wool", colour: hat }`, so every other screen draws the same.

- [ ] **Step 1: Write the failing tests:** each headwear draws its own
  `testID` (`hat-wool`, `hat-yule`, `hat-party`, `hat-crown`, `hat-sailor`);
  `glasses` and `mask` draw theirs; `hat: "#F08C9C"` still draws the wool
  hat in that colour.
- [ ] **Step 2 to 4:** fail, port the preview's `hat()` and `puffin()`
  (glasses, mask), pass.
- [ ] **Step 5: Commit** `feat(banner): hats, glasses and a mask for the puffins`.

### Task 6: the car and the scene on a day

**Files:**

- Create: `apps/mobile/src/banner/day-looks.ts`,
  `apps/mobile/src/banner/car-loads.tsx`
- Modify: `apps/mobile/src/components/puffin-scenes.tsx` (`PuffinsInCar`,
  `IcelandScene`, `IcelandPanel`)
- Test: `apps/mobile/src/components/puffin-scenes.test.tsx`

**Interfaces:**

- Consumes: `BannerDay`, `Season`, `Headwear`.
- Produces:
  - `dayLooks: Record<BannerDay, DayLook>`, `DayLook = { load: "case" |
    "tree" | "egg" | "tent" | "bun" | "flowers"; roofSnow: boolean; flags:
    "wings" | "roof" | null; balloons: boolean; heart: "driver" | "you" |
    null; you: PuffinDress; driver: PuffinDress; sky: "fireworks" |
    "sunrise" | null; cover: Season | null }` from the preview's `THEMES`
    (`PuffinDress` is the dress part of `PuffinLook`). The seasons' own
    look: the case on the roof, with snow on it in winter.
  - `PuffinsInCar` props gain `day?: BannerDay | null` and `season?: Season`
    (for snow on the case); with neither it draws exactly as today.
  - `IcelandScene` gains `day?: BannerDay | null`: the sunrise sun, the
    fireworks' bursts and the first snow's cover, in `room`.
  - `car-loads.tsx`: `RoofCase`, `Tree`, `Egg`, `Tent`, `Bun`, `Bouquet`,
    `Flag`, `Balloons`, `Heart`.

- [ ] **Step 1: Write the failing tests,** one per day: `christmas` draws
  `tree` and both puffins in `hat-yule`; `newyear` `hat-party` on both and
  three `firework` bursts in the scene; `easter` `egg` and `chick`;
  `summerday` `sunrise` in the scene and the driver's `glasses`; `june17`
  two `flag`s and `balloons`; `longweekend` `tent`; `winterday` the cover
  in winter's hill colour and the passenger in `hat-wool`; `dec1` one
  `flag` on the roof; `bondadagur` `bouquet` and a `heart` over the driver,
  `konudagur` over the passenger; `bolludagur` `bun`; `oskudagur` `mask`
  and `hat-crown`; `seafarers` `hat-sailor` on both. With no day the car is
  as today (the existing tests stay green).
- [ ] **Step 2 to 4:** fail, port the preview's `loads`, `flag()`,
  `balloons()`, `car()` and the sky parts of `scene()`, pass.
- [ ] **Step 5: Commit** `feat(banner): the car and the scene dressed for each day`.

### Task 7: the switch

**Files:**

- Modify: `packages/domain/src/settings/catalogue.ts` (`festive_days`, group
  `front_page`, on by default), `packages/domain/src/settings/values.test.ts`
- Modify: `packages/contracts/src/settings.ts` (`festiveDays:
  z.boolean().default(true)`)
- Modify: `apps/api/src/modules/settings/routes.ts`,
  `apps/api/src/modules/settings/settings.integration.test.ts`
- Modify: `apps/admin/src/pages/settings/texts.ts`,
  `apps/admin/src/pages/settings/settings.test.tsx`
- Modify: `packages/i18n/src/messages/en.ts`, `is.ts`
  (`admin.settings.group.front_page` "Front page" / "Forsíða",
  `admin.settings.name.festive_days` "Festive days on the front page" /
  "Hátíðisdagar á forsíðunni", `admin.settings.help.festive_days`: "The
  front page's banner dresses up for Christmas, 17 June and the other days.
  Turn it off on a day when a party would be wrong; the seasons stay." and
  its Icelandic)
- Modify: `apps/mobile/src/beta/config.tsx` (`quiet.festiveDays: true`,
  `useFestiveDays(): boolean`), `apps/mobile/src/banner/use-banner.ts`
- Modify: `docs/engineering/operator-console.md`,
  `docs/specs/2026-11-13-operator-settings-and-metrics.md` (the list),
  `docs/decisions/0056-…` only if Martin asks for changes

**Interfaces:**

- Produces: `useFestiveDays(): boolean`; `useBanner` reads it.

- [ ] **Step 1: Write the failing tests:** the catalogue has
  `festive_days` on by default; `GET /v1/config` gives `festiveDays: true`,
  and `false` after the operator turns it off; the console shows the switch
  under "Front page"; `useBanner` at 2027-12-24 gives `christmas` with the
  switch on and `{ winter, null }` with it off; on Find, turning it off
  (the fake API's next config read) takes the greeting away and leaves the
  scene's height as the season's.
- [ ] **Step 2 to 4:** fail, implement, pass (`pnpm test:integration` for
  the API test, one package).
- [ ] **Step 5: Commit** `feat(banner): a console switch for the festive days (ADR 0056)`.

### Task 8: the greeting, and Find on a day

**Files:**

- Modify: `apps/mobile/src/app/(tabs)/index.tsx`
- Modify: `packages/i18n/src/messages/en.ts`, `is.ts`
  (`home.greeting.<day>` for all thirteen days, spec 36, 3.4 and 3.5)
- Test: `apps/mobile/src/__tests__/welcome.test.tsx`

**Interfaces:**

- Consumes: `useBanner`, `Tag` (`kind="positive"`), `dayLooks`.

- [ ] **Step 1: Write the failing tests:** on 2027-12-24 Find shows "Merry
  Christmas" above "Share your ride" (signed out) and above "Hi Anna"
  (signed in), and "Gleðileg jól" in Icelandic; on 2027-07-01 no greeting;
  on a laptop the greeting is in the title's line, above the title. The car
  gets the day.
- [ ] **Step 2 to 4:** fail, implement (the greeting as a `Tag` in its own
  row, centred over a centred title and at the start otherwise), pass.
- [ ] **Step 5: Look** at every day with `?day=` on the website, phone and
  laptop, light and dark; compare with the preview's pictures.
- [ ] **Step 6: Commit** `feat(banner): a greeting on the festive days`,
  push, open pull request 2, code review, merge once green.

## Pull request 3: the moments

### Task 9: the moments' keyframes

**Files:**

- Modify: `packages/ui/src/tokens.ts` (`motion.moments`, the durations and
  delays below), `apps/mobile/src/theme/motion-css.ts`,
  `apps/mobile/src/theme/motion.ts` (`MotionPart` grows; `momentProps`)
- Test: `apps/mobile/src/theme/motion-css.test.ts`, `motion.test.tsx`

**Interfaces:**

- Produces:
  - `MotionPart` adds `"bulb" | "chick" | "cloth" | "balloons" | "load" |
    "bun" | "heart" | "sparkle" | "flake" | "leaf" | "flyer" | "aurora" |
    "sunrise" | "rays" | "glow" | "burst" | "trail" | "lupine" | "flower" |
    "cover"`.
  - `momentProps(playing: boolean): ViewProps`: marks the scene's View
    `data-motion="moment"` on the website while the car arrives.
  - `motionMark(part, timing?: { delay?: number; duration?: number; dx?:
    number; dy?: number; turn?: number })`: the timing as CSS custom
    properties (`--d`, `--t`, `--dx`, `--dy`, `--r`) in `style`.
- Keyframes, names `pr-<part>`, from the preview's stylesheet: flake
  (1700 to 2600 ms, delay up to 900), leaf (1500 to 2200, delay 150 to
  1150), fly (2500 and 2700, delays 200 and 520; the wings flap and bob
  only within it), aurora 3000, sunrise 1900 after 150, rays 2600, glow
  2000, burst 1300 at 300, 850 and 1400, trail 420 before each burst, bulb
  520 one after another from the car's stop, chick 2400, wave 1700 after
  500, sway 2300, wobble 1500, grow 450 with delays, lupine 1900 with
  delays, heart 2300, sparkle 2200, cover 3200. Every animation's delay
  plus duration is at most 3500.

- [ ] **Step 1: Write the failing tests:** `motionCss()` has a rule and a
  keyframe for every part; no rule animates anything but `transform` and
  `opacity`; every duration plus delay from `motion.moments` is at most
  3500; nothing has `infinite`; the reduce-motion rule still covers every
  `[data-motion]`. `motionMark("flake", { delay: 300 })` gives
  `--d: 300ms` on the website and nothing on a phone.
- [ ] **Step 2 to 4:** fail, implement, pass.
- [ ] **Step 5: Commit** `feat(banner): the moments' keyframes`.

### Task 10: the moments play, once

**Files:**

- Create: `apps/mobile/src/banner/moment-overlay.tsx` (snow, leaves,
  flyers, firework trails: drawn only on the website while the moment
  plays, each at opacity 0 until its animation shows it)
- Modify: `apps/mobile/src/components/puffin-scenes.tsx`,
  `apps/mobile/src/banner/car-loads.tsx`, `scene-layers.tsx` (the marks)
- Modify: `apps/mobile/src/theme/motion-sheet.web.ts` (`whenArrived` ends
  when nothing under `[data-motion="arrive"]` or `[data-motion="moment"]`
  still runs: on each `animationend` or `animationcancel` of a marked part,
  `document.getAnimations()` has none of theirs that is not finished; where
  the browser has no `getAnimations`, at the driver's hop as today)
- Modify: `apps/mobile/src/app/(tabs)/index.tsx` (`playing` = `arriving`
  to the scene and the panel)
- Test: `motion-sheet.web.test.ts`, `puffin-scenes.test.tsx`,
  `apps/mobile/e2e/banner.spec.ts`

- [ ] **Step 1: Write the failing tests:**
  - `whenArrived` is not done at the driver's hop while a moment part still
    runs, and is done when the last ends.
  - The overlay is drawn only with `playing` on the website.
  - Journey (motion on): with `?day=2027-12-31` the fireworks burst, every
    animation under the car and the scene is finished within 3500 ms of
    load, the marks are gone after, and the bursts stand where they ended;
    with `?day=2027-01-15` snow falls and is gone after; with reduce motion
    on (the other journeys' setting) and `?day=2027-12-24` the tree is lit
    at once and no flake is in the page. Coming back to Find, no
    `[data-motion="moment"]`.
- [ ] **Step 2 to 4:** fail, implement, pass. Run the journeys on GitHub
  (long runs go there).
- [ ] **Step 5: Look** at every season and day moving, phone and laptop,
  light and dark, against the preview.
- [ ] **Step 6: Commit** `feat(banner): the seasons' and days' moments`.

### Task 11: the docs as built

**Files:**

- Modify: `docs/specs/2026-11-28-seasonal-banner.md` (6, as built),
  `docs/specs/2026-11-27-small-animations.md` (3.2 links spec 36),
  `CHANGELOG.md`, `docs/specs/images/seasonal-banner/src/README.md` (the
  real banner with `?day=`)

- [ ] **Step 1:** update; `npx --yes markdownlint-cli2@0.24.0`; commit
  `docs(banner): spec 36 as built`.
- [ ] **Step 2:** push, open pull request 3, code review, merge once green.

## After the three pull requests

- Martin's steps (spec 36, 11): someone Icelandic reads the thirteen
  greetings; he says when the website may go live with "Release to
  production". Nothing goes to production before his go.
- The phone apps take the still look with their next build; the moments
  come with app 1.1 (spec 33, 3.11).
