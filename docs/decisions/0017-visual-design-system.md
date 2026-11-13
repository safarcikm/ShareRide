# 0017. Our own visual design system on React Native primitives

- **Status:** Proposed
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [spec 15](../specs/2026-11-13-visual-design-system.md),
  [ADR 0003](0003-cross-platform-client-expo.md),
  [ADR 0011](0011-localization.md),
  [conventions: accessibility](../engineering/conventions.md#accessibility)

## Context

The app runs on iOS, Android and the web from one Expo codebase (ADR 0003).
Its look so far is a neutral placeholder. Martin chose a direction (spec 15):
shape people with faces, a top-down seat view, chunky rounded parts with a
solid bottom edge, moss green, and the fonts Fredoka and Nunito.

That look needs custom drawings (the car, seats, shape people), two fonts
that have every Icelandic letter, an icon set, and colour pairs that meet
WCAG 2.2 AA in light and dark mode. Parts must keep their accessibility roles
and names, because tests find them that way. One person builds most of the
app, so every dependency is upkeep.

## Options considered

1. **Our own parts on React Native primitives.** Tokens in a TypeScript
   module, parts built from `Pressable`, `Text` and `View`, drawings in
   `react-native-svg`, fonts from `@expo-google-fonts` loaded by `expo-font`,
   icons from `lucide-react-native`. Full control of the look and
   accessibility; few dependencies, all MIT, ISC or OFL. We write and test
   each part ourselves.
2. **A UI kit (Tamagui, gluestack-ui or React Native Paper).** Many parts
   ready-made, theming built in. But the chunky edges, seat view and shape
   people are custom anyway; Paper brings Material Design's look, which
   fights ours; Tamagui and gluestack add a compiler or styling layer and
   tie upgrades to their release cycle as well as Expo's.
3. **System fonts and no drawings.** Nothing to load and nothing to draw. It
   drops the seat view and the character Martin chose, and system fonts
   differ between platforms.

## Decision

We will build our own design system on React Native primitives (option 1):

- Tokens (colours, type, spacing, corners, edges, sizes) live in
  `apps/mobile/src/theme/tokens.ts` and move to `packages/ui` when a second
  client, such as the operator console, needs them.
- Fredoka and Nunito ship inside the app and the web build through
  `@expo-google-fonts/fredoka` and `@expo-google-fonts/nunito`, loaded with
  `expo-font`; nothing is fetched from Google at run time.
- Drawings use `react-native-svg`; icons use `lucide-react-native`.
- Spec 15 is the source of truth for values, parts and screens.

## Consequences

- The look is the same on every platform, and we control every part's
  accessibility.
- A unit test can check the contrast of every token pair.
- Four new runtime dependencies (two font packages, `react-native-svg`,
  `lucide-react-native`); the fonts add about 0.5 MB to the app.
- We build and maintain parts a kit would give us, such as switches and
  radio cards; spec 15 keeps that list short.
- Follow-up: the implementation PR for tokens, fonts and existing parts,
  after milestone 1's sign-in screens merge; the logo and app icon.

## Revisit when

- We need many complex parts (date pickers, bottom sheets) that a kit does
  well and we would struggle to make accessible.
- The operator console or website needs the tokens (move them to
  `packages/ui`).
- A font or icon package stops being maintained.
