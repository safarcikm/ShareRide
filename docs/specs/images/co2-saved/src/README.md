# How the pictures of spec 34 were made

The pictures of [spec 34](../../../2026-11-28-co2-saved.md) are drawings,
made with [spec 31's kit](../../one-ride-one-ticket/src/mock/kit.cjs) (the
app's colours, fonts, icons and parts). Nothing here ships in the app or
runs in CI. Fictional names and rides only.

`build.cjs` draws every screen into one page and takes a picture of each,
at twice the screen's size. It needs the app's fonts and icons, so either
the workspace installed (`pnpm install`) or `REPO` pointing at a folder
whose `apps/mobile/node_modules` holds `@expo-google-fonts/fredoka`,
`@expo-google-fonts/nunito` and `lucide-react-native`, and Playwright's
Chromium:

```sh
node docs/specs/images/co2-saved/src/build.cjs /tmp/co2
```

The pictures in `../` are those PNGs saved as WebP. Once the feature is
built, the app's own `e2e/pictures.spec.ts` takes them again from the real
screens.
