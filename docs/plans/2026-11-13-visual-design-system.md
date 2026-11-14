# Visual design system implementation plan

**Owner:** Martin · **Date:** 2026-11-13 · **Status:** Approved (2026-11-13, PR #12); PR A merged (PR #14); PR B in review

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** the app's existing screens take on the look of spec 15: its
colours, fonts, sizes and parts, in light and dark mode, on iOS, Android and
the web.

**Architecture:** tokens stay in `apps/mobile/src/theme/tokens.ts` with the
same names plus the new ones; fonts load in the root layout while the
existing `Loading` view shows; each part in `apps/mobile/src/components` is
restyled in place, keeping its props, roles and accessible names, so screens
and their tests need no edits.

**Tech stack:** Expo SDK 58, React Native 0.88, Expo Router, `expo-font`,
`@expo-google-fonts/fredoka`, `@expo-google-fonts/nunito`,
`react-native-svg`, `lucide-react-native`, Jest with `jest-expo` and RNTL 14,
Playwright.

**Spec:** [spec 15, visual design system](../specs/2026-11-13-visual-design-system.md)
(approved 2026-11-13) and
[ADR 0017](../decisions/0017-visual-design-system.md) (accepted). Starts
from the sign-in screens of milestone 1
([PR 6 of that plan](2026-11-13-milestone-1-phone-sign-in.md#pr-6-featauth-sign-in-screens-profile-and-settings)),
which must be merged first.

## Global constraints

- Token names the app already uses stay: colours `background`, `surface`,
  `text`, `textMuted`, `primary`, `onPrimary`, `border`, `error`, `focus`;
  typography `title`, `body`, `button`, `label`, `small`; spacing `xs` to
  `xxl`; `minTouchTarget`, `maxContentWidth`.
- Component names, props, roles and accessible names stay as they are;
  existing tests pass unchanged.
- Every value comes from spec 15, sections 4.1 to 4.6 and 5.1. Screens and
  parts use tokens, never raw colours or sizes.
- No `fontWeight` anywhere: the font face name sets the weight (spec 15,
  section 6).
- Text keeps scaling with the phone's text size; parts use `minHeight`,
  never a fixed `height`, so text can wrap.
- Fonts ship in the app; nothing is fetched from Google at run time.
- Add Expo packages with `npx expo install`; pin `lucide-react-native` to an
  exact version.
- Texts in Icelandic and English (`packages/i18n`).

## Review focus

1. **Largest text size with Icelandic texts.** Buttons, chips and fields
   grow taller instead of cutting text. Test: Task 4 checks `minHeight` and
   no `height` on `Button`.
2. **A custom font with a weight on Android.** Android ignores `fontWeight`
   for custom fonts and may fall back to the system font. Test: Task 1 checks
   that no typography token and no component file sets `fontWeight`.
3. **Fonts fail to load** (offline on a first web visit). The app opens with
   system fonts instead of waiting forever. Test: Task 2.
4. **Pressing a chunky part.** The part sinks into its edge without moving
   anything around it. Test: Task 3 checks the pressed style keeps the box
   height.
5. **Keyboard users on the web.** The focus ring is visible on every
   pressable part. Test: Task 7 (Playwright).

---

## PR A: `feat(mobile)`: the look from spec 15

**Changed while building** (the code and spec 15 section 6 follow these):

- The chunky edge is `chunky(edge, edgeColor, pressed)` in
  `theme/pressable.ts`, returning an `outer` style (the bottom border) and a
  `face` style (moved down by the edge when pressed), instead of one
  `edgeStyle`. A secondary button needs its control outline on the face and
  its edge on the outer view, and the box keeps its height when pressed.
- The focus ring is one `:focus-visible` style sheet on the web
  (`focusRingCss`, added by `installFocusRing` in `theme/focus-ring.web.ts`)
  instead of `focusStyle` on each part: it covers links and fields too, and
  shows for the keyboard and not for clicks or taps.
- Lucide icons go through `components/icon.tsx`, which sets the 2.4 stroke
  and hides them from screen readers. Jest maps `lucide-react-native` to its
  CommonJS build.
- The browser check shows light in English and dark in Icelandic, so the 8
  screenshots cover both languages, and also checks the focus ring on the
  phone number field.
- After the code review: `Body` stays `textMuted` as Task 6 says, and spec 15
  section 5.1 now says so too (it said `text`); new tokens `radii.checkbox`,
  `sizes.checkbox`, `controlOutline` and `iconSizes` replace raw sizes in
  the parts; on the web every font has a `system-ui, sans-serif` fallback;
  bold text on the legal screens uses Nunito Bold instead of `fontWeight`,
  and the `fontWeight` test covers `src/app` too; a text button no longer
  places itself, so the language switch stays at the top right of welcome.
- After Martin saw the screenshots (2026-11-13): buttons fit their label
  instead of filling the width; text fields show focus with their own moss
  outline instead of the blue ring; the screenshots are taken before any key
  is pressed. Martin chose to keep the blue ring on buttons and links, for
  the keyboard only (2026-11-14).
- Martin asked for everything more centred (2026-11-14): titles, intro text,
  buttons and links are centred; fields, tick boxes, lists and legal texts
  start at the left (`Body align="start"`).

Not in this PR (they come with the screens of specs 3 to 5, spec 15
section 5.2): tag colours, the rating star, people and car colours, shape
people, the seat view and the other new parts.

New runtime dependencies (justify in the PR): the two font packages (MIT
code, OFL fonts, about 0.5 MB), `react-native-svg` (MIT, needed by the
icons now and the seat view later) and `lucide-react-native` (ISC). See
ADR 0017.

### Task 1: Tokens and the contrast test

**Files:**

- Modify: `apps/mobile/src/theme/tokens.ts`
- Create: `apps/mobile/src/theme/contrast.ts`
- Test: `apps/mobile/src/theme/tokens.test.ts`

**Interfaces:**

- Produces: `colors.light` and `colors.dark` with the 16 keys of spec 15,
  section 4.1, in this order: `background`, `surface`, `text`, `textMuted`,
  `primary`, `onPrimary`, `primaryEdge`, `primarySoft`, `border`, `control`,
  `edge`, `focus`, `error`, `onError`, `errorSoft`, `infoSoft`. `Palette`
  stays derived from `colors.light`.
- Produces: `fonts` (`display` = `"Fredoka_600SemiBold"`, `displayMedium` =
  `"Fredoka_500Medium"`, `body` = `"Nunito_400Regular"`, `bodySemiBold` =
  `"Nunito_600SemiBold"`, `bodyBold` = `"Nunito_700Bold"`).
- Produces: `typography` with the 11 styles of section 4.3 (`display`,
  `title`, `heading`, `figure`, `figureSmall`, `button`, `body`,
  `bodyStrong`, `label`, `small`, `caption`), each `{ fontFamily, fontSize,
  lineHeight }`.
- Produces: `spacing` (`xs` 4, `sm` 8, `ms` 12, `md` 16, `lg` 24, `xl` 32,
  `xxl` 48), `radii` (`seat`, `tag`, `control`, `card`, `pill`), `edges`
  (`card`, `buttonPrimary`, `buttonSecondary`), `sizes` (`buttonHeight`,
  `mainButtonHeight`, `inputHeight`, `chipHeight`, `iconButton`),
  `minTouchTarget`, `maxContentWidth`, `iconStroke` (2.4), `focusRing`
  (`{ width: 3, offset: 2 }`).
- Produces: `contrastRatio(foreground: string, background: string): number`
  (WCAG 2.2 relative luminance, hex `#RRGGBB` in).

- [x] **Step 1: Write the failing tests**

```ts
// tokens.test.ts
const textPairs = [
  ["text", "background"], ["text", "surface"],
  ["textMuted", "background"], ["textMuted", "surface"],
  ["primary", "background"], ["primary", "surface"],
  ["onPrimary", "primary"], ["primary", "primarySoft"],
  ["error", "background"], ["error", "surface"],
  ["onError", "error"], ["text", "errorSoft"], ["text", "infoSoft"],
] as const;
const edgePairs = [
  ["control", "background"], ["control", "surface"],
  ["focus", "background"], ["focus", "surface"],
] as const;

describe.each(["light", "dark"] as const)("%s colours", (scheme) => {
  it.each(textPairs)("%s on %s is at least 4.5:1", (fg, bg) => {
    expect(contrastRatio(colors[scheme][fg], colors[scheme][bg])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(edgePairs)("%s on %s is at least 3:1", (fg, bg) => {
    expect(contrastRatio(colors[scheme][fg], colors[scheme][bg])).toBeGreaterThanOrEqual(3);
  });
});

it("has the same colour keys in light and dark", () => {
  expect(Object.keys(colors.dark)).toEqual(Object.keys(colors.light));
});
it("computes known ratios", () => {
  expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
  expect(contrastRatio("#1F2A30", "#EEF3F4")).toBeCloseTo(13.1, 1);
});
it("sets weights through the font face only", () => {
  for (const style of Object.values(typography)) expect(style).not.toHaveProperty("fontWeight");
});
it("keeps fontWeight out of the components", () => {
  // read every file in src/components with node:fs and expect no "fontWeight"
});
```

- [x] **Step 2: Run the tests and see them fail**

Run: `pnpm --filter @shareride/mobile test -- src/theme/tokens.test.ts`
Expected: FAIL, `contrastRatio` is not defined.

- [x] **Step 3: Write `contrastRatio` and the new tokens** with the values of
  spec 15, sections 4.1, 4.3 and 4.4. The "keeps fontWeight out of the
  components" test fails until Task 5 removes the checkbox tick's weight;
  mark it `it.todo` here and turn it on in Task 5.

- [x] **Step 4: Run the tests and the type check**

Run: `pnpm --filter @shareride/mobile test -- src/theme && pnpm --filter @shareride/mobile typecheck`
Expected: PASS. Type errors in components that read removed fields (the
old `fontWeight`) are fixed by dropping those fields.

- [x] **Step 5: Commit** `feat(mobile): design tokens from spec 15 with a contrast test`

### Task 2: Fonts in the root layout

**Files:**

- Create: `apps/mobile/src/theme/fonts.ts`
- Modify: `apps/mobile/src/app/_layout.tsx`, `apps/mobile/src/components/loading.tsx`,
  `apps/mobile/package.json`, `packages/i18n/src/messages/en.ts`, `is.ts`
- Test: `apps/mobile/src/__tests__/fonts.test.tsx`

**Interfaces:**

- Consumes: `fonts` from Task 1.
- Produces: `fontAssets` (the five faces from `@expo-google-fonts/*`, keyed by
  the names in `fonts`) and `useAppFonts(): boolean`, true once the fonts
  are loaded or have failed.

- [x] **Step 1: Install** with `npx expo install expo-font
  @expo-google-fonts/fredoka @expo-google-fonts/nunito` in `apps/mobile`.

- [x] **Step 2: Write the failing tests.** Mock `@/auth/api`,
  `@/auth/token-store` and `expo-localization` (English device) as
  `src/__tests__/welcome.test.tsx` does, and mock `expo-font`'s `useFonts`:

```tsx
it("shows Loading while the fonts load", async () => {
  mockUseFonts.mockReturnValue([false, null]);
  await renderApp("/");
  expect(screen.getByLabelText("Loading")).toBeOnTheScreen();
});
it("opens the app with system fonts when loading fails", async () => {
  mockUseFonts.mockReturnValue([false, new Error("offline")]);
  await renderApp("/");
  expect(await screen.findByText("Share the ride across Iceland")).toBeVisible();
});
```

- [x] **Step 3: Run them and see them fail**

Run: `pnpm --filter @shareride/mobile test -- fonts`
Expected: FAIL, no element labelled "Loading".

- [x] **Step 4: Implement.** `useAppFonts` returns `loaded || error !== null`.
  `Navigation` shows `<Loading />` while the session is loading **or** fonts
  are not ready, so both happen at once. `Loading` gets
  `accessibilityLabel={t("common.loading")}`; add `common.loading`
  ("Loading", "Hleð") to both message files.

- [x] **Step 5: Run the app's tests**

Run: `pnpm --filter @shareride/mobile test`
Expected: PASS (jest-expo resolves `useFonts`; if it does not, mock it in
`src/testing/app.tsx` to return `[true, null]`).

- [x] **Step 6: Commit** `feat(mobile): load Fredoka and Nunito at start`

### Task 3: The chunky edge and the focus ring

**Files:**

- Create: `apps/mobile/src/theme/pressable.ts`
- Test: `apps/mobile/src/theme/pressable.test.ts`

**Interfaces:**

- Produces: `edgeStyle(edge: number, edgeColor: string, pressed: boolean): ViewStyle`
  and `focusStyle(focused: boolean, palette: Palette, platform = Platform.OS): ViewStyle`
  (an outline on the web only; phones keep their own focus highlight, spec
  15, section 6). Uses the `focusRing` token.

- [x] **Step 1: Write the failing tests**

```ts
it("keeps the box height when pressed", () => {
  expect(edgeStyle(4, "#1F4A36", false)).toMatchObject({ borderBottomWidth: 4, borderBottomColor: "#1F4A36" });
  expect(edgeStyle(4, "#1F4A36", true)).toMatchObject({
    borderBottomWidth: 4, borderBottomColor: "transparent", transform: [{ translateY: 4 }],
  });
});
it("draws a 3 wide focus ring 2 away when focused", () => {
  expect(focusStyle(true, colors.light, "web")).toMatchObject({
    outlineColor: "#1F5F8B", outlineWidth: 3, outlineOffset: 2, outlineStyle: "solid",
  });
  expect(focusStyle(false, colors.light, "web")).toEqual({});
  expect(focusStyle(true, colors.light, "ios")).toEqual({});
});
```

- [x] **Step 2: Run, see them fail, implement, run again**

Run: `pnpm --filter @shareride/mobile test -- pressable`
Expected: FAIL first, then PASS.

- [x] **Step 3: Commit** `feat(mobile): pressed edge and focus ring styles`

### Task 4: Button

**Files:**

- Modify: `apps/mobile/src/components/button.tsx`
- Test: `apps/mobile/src/components/button.test.tsx`

**Interfaces:**

- Consumes: tokens (Task 1), `edgeStyle` and `focusStyle` (Task 3).
- Props unchanged: `label`, `onPress`, `accessibilityLabel`, `variant`
  (`primary` | `secondary` | `text`), `busy`, `disabled`.

- [x] **Step 1: Write the failing tests**

```tsx
it("keeps the label visible while busy", async () => {
  await render(<Button label="Send code" onPress={jest.fn()} busy />);
  expect(screen.getByText("Send code")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Send code" })).toHaveAccessibilityState({ busy: true, disabled: true });
});
it("shows disabled with colours, not opacity", async () => {
  await render(<Button label="Continue" onPress={jest.fn()} disabled />);
  expect(screen.getByRole("button")).toHaveStyle({ backgroundColor: colors.light.border, opacity: 1 });
});
it("grows with its text instead of a fixed height", async () => {
  await render(<Button label="Continue" onPress={jest.fn()} />);
  const button = screen.getByRole("button");
  expect(button).toHaveStyle({ minHeight: 48 });
  expect(StyleSheet.flatten(button.props.style)).not.toHaveProperty("height");
});
```

- [x] **Step 2: Run them and see them fail**

Run: `pnpm --filter @shareride/mobile test -- button`

- [x] **Step 3: Restyle** as spec 15, section 5.1: primary (fill `primary`,
  edge `buttonPrimary` in `primaryEdge`), secondary (fill `surface`,
  2 `control` outline, edge `buttonSecondary` in `edge`), text (no fill,
  `primary` label in `typography.label`); corner `radii.control`;
  `minHeight` `sizes.buttonHeight`; label `typography.button`; busy shows a
  small `ActivityIndicator` before the label; disabled uses `border` fill and
  `textMuted` label with no edge; `Pressable` style uses `pressed` with
  `edgeStyle` and `focused` with `focusStyle`. Remove the old opacity dimming.

- [x] **Step 4: Run all the app's tests**

Run: `pnpm --filter @shareride/mobile test`
Expected: PASS, including the existing screen tests.

- [x] **Step 5: Commit** `feat(mobile): restyle Button`

### Task 5: Form parts: TextField, Checkbox, Chip, Notice

**Files:**

- Modify: `apps/mobile/src/components/text-field.tsx`, `checkbox.tsx`,
  `chip.tsx`, `notice.tsx`, `apps/mobile/package.json`
- Test: `apps/mobile/src/components/form-parts.test.tsx`; turn on the
  `fontWeight` test from Task 1

**Interfaces:**

- Consumes: tokens, `focusStyle`; `iconStroke` for every Lucide icon.
- Props unchanged.

- [x] **Step 1: Install** `npx expo install react-native-svg` and
  `pnpm --filter @shareride/mobile add lucide-react-native@<latest, exact>`.

- [x] **Step 2: Write the failing tests**

```tsx
it("outlines a field in the control colour, and in error colour with an error", async () => {
  await render(<TextField label="Phone number" value="" onChangeText={jest.fn()} />);
  expect(screen.getByLabelText("Phone number")).toHaveStyle({ borderColor: colors.light.control, minHeight: 52 });
  await render(<TextField label="Phone number" value="" onChangeText={jest.fn()} error="Check the number" />);
  expect(screen.getByLabelText("Phone number")).toHaveStyle({ borderColor: colors.light.error });
});
it("marks a selected chip with more than colour", async () => {
  await render(<Chip label="English" selected onToggle={jest.fn()} />);
  expect(screen.getByTestId("chip-tick")).toBeOnTheScreen();
});
it("gives a 40 high chip a 44 high touch area", async () => {
  await render(<Chip label="English" selected={false} onToggle={jest.fn()} />);
  const chip = screen.getByRole("checkbox", { name: "English" });
  expect(chip).toHaveStyle({ minHeight: 40 });
  expect(chip.props.hitSlop).toEqual({ top: 2, bottom: 2, left: 0, right: 0 });
});
it("puts an error notice on the error fill", async () => {
  await render(<Notice message="That code didn't work." />);
  expect(screen.getByRole("alert")).toHaveStyle({ backgroundColor: colors.light.errorSoft });
});
```

- [x] **Step 3: Run them and see them fail**

Run: `pnpm --filter @shareride/mobile test -- form-parts`

- [x] **Step 4: Restyle** as spec 15, section 5.1. TextField: label in
  `typography.label`, input `minHeight` `sizes.inputHeight`, fill
  `surface`, 2 `control` outline, corner `radii.control`, error message
  after a Lucide `CircleAlert`. Checkbox: 26 box, corner 9, 2 `control`
  outline; checked `primary` fill with a Lucide `Check` in `onPrimary` and a
  2 `primaryEdge` bottom edge. Chip: `minHeight` `sizes.chipHeight`, corner
  `radii.pill`, 2 `control` outline, `typography.label`; selected
  `primarySoft` fill, `primary` outline and a `Check` (`testID="chip-tick"`)
  before the label. Notice: corner `radii.control`, `errorSoft` or
  `infoSoft` fill, `CircleAlert` or `Info` icon, message in `typography.body`
  and `text`. Icons are `aria-hidden` (`accessibilityElementsHidden`,
  `importantForAccessibility="no-hide-descendants"`).

- [x] **Step 5: Run all the app's tests** (now with the `fontWeight` test on)

Run: `pnpm --filter @shareride/mobile test`
Expected: PASS. If Jest cannot parse `react-native-svg` or
`lucide-react-native`, add them to the pattern in `jest.config.js` the way
FormatJS is added.

- [x] **Step 6: Commit** `feat(mobile): restyle text fields, checkboxes, chips and notices`

### Task 6: Screen, text, links, back and language

**Files:**

- Modify: `apps/mobile/src/components/screen.tsx`, `text.tsx`,
  `text-link.tsx`, `back-button.tsx`, `language-switch.tsx`
- Test: `apps/mobile/src/components/navigation-parts.test.tsx`

**Interfaces:**

- Consumes: tokens, `edgeStyle`, `focusStyle`, Lucide `ChevronLeft`.
- `BackButton` keeps role `button` and the accessible name
  `t("common.back")`; `LanguageSwitch` keeps its label and accessible name.

- [x] **Step 1: Write the failing tests**

```tsx
it("shows Back as a round icon button with its name", async () => {
  await renderApp("/sign-in");
  const back = screen.getByRole("button", { name: "Back" });
  expect(back).toHaveStyle({ width: 44, height: 44, borderRadius: 999 });
  expect(screen.queryByText("Back")).toBeNull();
});
it("underlines links in bold Nunito", async () => {
  await render(<TextLink label="Terms" href="/legal/terms" />);
  expect(screen.getByText("Terms")).toHaveStyle({ textDecorationLine: "underline", fontFamily: "Nunito_700Bold" });
});
```

- [x] **Step 2: Run them and see them fail**

Run: `pnpm --filter @shareride/mobile test -- navigation-parts`

- [x] **Step 3: Restyle.** `Screen`: `background`, padding `spacing.md`,
  column gap `spacing.md`, at most `maxContentWidth`. `Title`:
  `typography.title` in `text`. `Body`: `typography.body` (keeps
  `textMuted`). `TextLink`: `primary`, `fonts.bodyBold`, underlined.
  `BackButton`: a `Pressable` 44 round, `surface`, edge `edges.card` in
  `edge`, `ChevronLeft` 22 in `text`, with the same fallback behaviour.
  `LanguageSwitch`: the `text` button variant.

- [x] **Step 4: Run all the app's tests and the type check**

Run: `pnpm --filter @shareride/mobile test && pnpm --filter @shareride/mobile typecheck`
Expected: PASS. Screen tests that found "Back" by role and name still pass.

- [x] **Step 5: Commit** `feat(mobile): restyle screens, titles, links and the back button`

### Task 7: Browser checks and screenshots for review

**Files:**

- Create: `apps/mobile/e2e/look.spec.ts`
- Modify: `.github/workflows/ci.yml` (upload `apps/mobile/test-results/look/`
  with `actions/upload-artifact`, pinned to a commit SHA like the other
  actions)

- [x] **Step 1: Write the test.** On the welcome and sign-in screens, in
  both Playwright projects (phone and desktop) and both colour schemes
  (`test.use({ colorScheme })`):
  - press Tab until the "Browse trips" button has focus and expect its
    computed `outline` to be `3px solid` in `rgb(31, 95, 139)` (light) or
    `rgb(143, 203, 230)` (dark);
  - expect `document.fonts.check("16px Fredoka_600SemiBold")` to be true;
  - save a full-page screenshot to `test-results/look/<screen>-<project>-<scheme>.png`.

- [x] **Step 2: Run it**

Run: `pnpm --filter @shareride/mobile e2e:web -- look.spec.ts`
Expected: PASS, 8 screenshots written.

- [x] **Step 3: Check the screenshots** against the spec's boards and
  attach them to the PR description (phone and desktop, light and dark,
  Icelandic and English).

- [x] **Step 4: Commit** `test(mobile): browser check of focus ring and fonts, with screenshots`

### Task 8: Docs and the pull request

**Files:**

- Modify: `CHANGELOG.md`, `docs/plans/README.md` (this plan's status),
  this plan (tick the tasks), `apps/mobile/src/theme/tokens.ts` header
  comment (points to spec 15 instead of "placeholder")

- [x] **Step 1: Run every check**

Run: `pnpm check && pnpm format:check && npx --yes markdownlint-cli2@0.24.0`
Expected: all pass.

- [ ] **Step 2: By hand,** in Expo Go on an iPhone and an Android phone:
  light and dark, Icelandic and English, the largest text size, VoiceOver
  and TalkBack on the sign-in screens.

- [x] **Step 3: Request a code review**, fix what it finds, then open the
  PR with the template, the dependency reasons and the screenshots.

## PR B: `feat(mobile)`: app icon and splash screen

Martin chose logo direction A, "A shared ride" (the car from above with
the driver and you), on 2026-11-13, and approved the refined drawing on
2026-11-14 ("Go with the icons"). The rules are in
[spec 15, section 4.9](../specs/2026-11-13-visual-design-system.md#49-logo-and-app-icon).

**Files:**

- Create: `apps/mobile/assets/logo/*.svg` (one drawing per picture),
  `apps/mobile/scripts/export-icons.ts`,
  `apps/mobile/src/__tests__/app-icons.test.ts`,
  `apps/mobile/assets/icon-dark.png`, `icon-tinted.png`
- Modify: `apps/mobile/app.json`, `apps/mobile/package.json`, the template
  pictures in `apps/mobile/assets/`, spec 15
- Delete: `apps/mobile/assets/android-icon-background.png` (a colour now)

- [x] **Step 1: Write the failing test.** `app-icons.test.ts` reads
  `app.json` and each PNG's header and top-left pixel: the icon and the iOS
  light icon are the same 1024 file with no alpha channel on `primary`; the
  iOS dark icon is on dark `background`, the tinted one on black; the
  Android layers are 1024 and see-through over a `primary` background
  colour with no background image; the `expo-splash-screen` options use
  light and dark `background`, the same picture and `imageWidth` 288; the
  favicon is 48 and see-through; every PNG in `assets` is used and has a
  drawing in `assets/logo`.
- [x] **Step 2: Run it and see it fail** (5 of 6 fail; the template favicon
  already passes).
- [x] **Step 3: Install** `npx expo install expo-splash-screen` (offline:
  `EXPO_OFFLINE=1`, which uses Expo's own list of versions).
- [x] **Step 4: Draw and export.** Write the drawings from the refined
  logo A, run `node scripts/export-icons.ts`, and set `ios.icon`,
  `android.adaptiveIcon` and the `expo-splash-screen` plugin in `app.json`.
- [x] **Step 5: Run the test again** and `expo prebuild --no-install` once
  (not committed) to see the native icon and opening screen files.
- [x] **Step 6: Spec 15** gets section 4.9 and decision 11, with the board
  `images/visual-design-system/logo.png` made from the exported pictures.
- [ ] **Step 7: Run every check**, request a code review, then open the PR.
- [ ] **Step 8: By hand,** in an Android emulator: build the app once with
  `npx expo run:android` and look at the icon (light, themed) and the
  opening screen (light and dark).

## Definition of done

- Every task ticked, CI green, and the PR reviewed by Martin.
- Existing screen tests pass without edits.
- Screenshots in the PR show phone and desktop, light and dark, Icelandic
  and English.
- No `fontWeight` and no raw colours in `apps/mobile/src/components`.
