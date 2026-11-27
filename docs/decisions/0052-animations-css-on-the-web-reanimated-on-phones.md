# 0052. Animations: CSS on the website, Reanimated and expo-haptics in the phone apps

- **Status:** Proposed
- **Date:** 2026-11-27
- **Deciders:** Martin
- **Related:** [spec 33](../specs/2026-11-27-small-animations.md),
  [spec 15, 4.6](../specs/2026-11-13-visual-design-system.md#46-motion),
  [ADR 0003](0003-cross-platform-client-expo.md),
  [ADR 0017](0017-visual-design-system.md),
  [spec 32](../specs/2026-11-27-phone-apps-in-the-stores.md)

## Context

Spec 33 adds a few small animations (the front page's car arriving, a
booked seat, the road, things opening, a seat popping) and short touch
taps (haptics) on phones. Until now nothing moved, so the app has no
animation library and no haptics module.

One Expo codebase builds the website (React Native Web, a single-page app)
and the iPhone and Android apps (ADR 0003). The website is where most
members are today and is found through Google, so what it downloads and how
fast it shows its first frame matter. The car arrives just as the front
page loads its rides, when the page's JavaScript is busiest. The phone
apps are about to go to the stores for the first time (spec 32); a new
native module means a new store build and a new round of checks, and an
over-the-air update cannot add one.

The motion must follow the system's reduce motion setting on every
platform, use only transform and opacity, and never hold up a tap.

## Options considered

1. **CSS on the website; Reanimated 4 and `expo-haptics` on phones,
   behind one small motion kit.** CSS keyframes run off the main thread,
   start with the first frame, follow `prefers-reduced-motion` in the style
   sheet itself and add nothing to the download. Reanimated is Expo's
   standard for animation on phones: it runs on the UI thread, has
   animations for things that leave the screen, and reads reduce motion.
   Each motion part has a `.web.tsx` twin, so screens do not care. Costs:
   two ways to write the same motion (kept small, with shared tokens), and
   three native modules (`react-native-reanimated`,
   `react-native-worklets`, `expo-haptics`) in a new build.
2. **React Native's own `Animated` everywhere, plus `expo-haptics`.** One
   way to write each motion, nothing new for animation, and the motion
   (not the taps) could reach phones over the air. But on the website it
   runs in JavaScript on the main thread, exactly while the front page
   loads, so the car can stutter; it has no ready way to animate things
   leaving the screen; and reduce motion must be read by hand.
3. **Reanimated everywhere, the website too.** One way to write it. But
   every visitor downloads the library for a handful of short moments, on
   the platform where speed matters most.
4. **Lottie files.** Animations made in a design tool and played back. Good
   for complex scenes, but needs After Effects and keeps a second copy of
   the puffins and the car outside our code, where the ads and link
   pictures already copy them.
5. **No animation library: CSS on the web only, phones stay still.** Nothing
   new on phones, but the apps would differ from the website, and phones
   are where taps and motion help most.

## Decision

We will animate the website with CSS keyframes and transitions, and the
phone apps with Reanimated 4 and touch taps with `expo-haptics`, behind one
motion kit in `apps/mobile/src/motion/` whose parts have a web twin, with
durations and curves as tokens in `packages/ui`, because it keeps the
website light and smooth while the phones get Expo's standard tools.

## Consequences

- The website downloads nothing new, and its first frame is not delayed;
  the banner can go live before the phone apps change.
- The phones need a new store build (version 1.1) for Reanimated and
  `expo-haptics`; spec 33 waits for the first App Store release so its
  builds are not redone.
- Two implementations per motion part, web and native. The kit stays small
  (about five parts), each with a test that its end state is right with
  reduce motion on.
- Reanimated adds a Babel step (handled by `babel-preset-expo`) and a Jest
  setup; Dependabot and Expo SDK upgrades keep it in step.
- New runtime dependencies, each justified in its PR: three native modules,
  all MIT licensed, maintained by Software Mansion and Expo.

## Revisit when

- Gestures that drag or swipe (sheets, rows) arrive: they need
  Reanimated's gesture tools, and may need `react-native-gesture-handler`.
- The website moves to rendering pages on the server, or the motion kit
  grows past a handful of parts.
- Reanimated's web build becomes small enough that one implementation is
  worth its download.
