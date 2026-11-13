# 0003. Cross-platform client with Expo

- **Status:** Proposed
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [ADR 0002](0002-monorepo-and-typescript.md), open question Q1

## Context

The app must run on iOS, Android and the web ("every common platform"), be
maintained for years, and be built mostly by one person with Claude Code. It
needs maps, push notifications, secure storage, deep links, location (with
permission) and good accessibility. Desktop users are served by the web app.

## Options considered

1. **Expo (React Native) with Expo Router.** One TypeScript codebase for iOS,
   Android and web. Managed native builds (EAS Build), store submission (EAS
   Submit), over-the-air JavaScript updates (EAS Update), and first-party
   upgrade tooling. Very large ecosystem; official Expo skills for Claude Code.
   Web output is good for app screens; marketing pages may need a separate
   site.
2. **Flutter.** One Dart codebase for all platforms with consistent rendering
   and strong performance. Smaller hiring pool than React; the web build is
   heavier and weaker for search engines; no shared code with a TypeScript
   backend.
3. **Native apps (Swift, Kotlin) plus a web app.** Best platform fit, three
   codebases and roughly three times the effort.
4. **Progressive web app only.** Cheapest, but weaker push notifications on
   iOS, no store presence, and less trust for a safety-sensitive product.

## Decision

We will build the passenger and driver app with **Expo (React Native) and
Expo Router**, targeting iOS, Android and web from one codebase, and use
**EAS** for builds, store submission and over-the-air updates.

- Stay on the latest stable Expo SDK, upgrading each release with the
  official upgrade skill and guide.
- Use development builds (not Expo Go) once native modules are needed.
- The admin console starts as a separate web target (Expo web or a small React
  web app), decided at scaffolding; the public website with route pages is
  decided in Phase 4.

## Consequences

- Shared TypeScript domain rules give instant, identical price previews in the
  app and on the server.
- One UI codebase to design, test and translate.
- We depend on Expo's release cadence; staying current is a recurring task
  (budget a day per SDK upgrade).
- Platform-specific polish (maps, sheets, haptics) still needs testing on real
  devices of both platforms.

## Revisit when

A core feature needs native capabilities Expo modules cannot provide, or web
traffic grows enough to need a dedicated web framework for the passenger app.
