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

Of these drawings, only `../0-how-it-counts.webp` is still used.

Pictures 1 to 8 in `../` are the screens as built, taken by the app's own
`e2e/pictures.spec.ts` ("the CO2 a shared ride saves") on a phone and a
laptop, with the test API and a web build running as for the web journeys
([testing strategy](../../../../engineering/testing-strategy.md)). From
`apps/mobile`:

```sh
PICTURES_DIR=/tmp/pictures npx playwright test e2e/pictures.spec.ts \
  -g "CO2 a shared ride saves" --trace off
```

It writes PNGs to `/tmp/pictures/co2-saved/built/`, at twice the screen's
size on a phone; they are saved here as WebP (Pillow, quality 82), the dark
ones with `-is` added to their names. The people, emails and phone numbers
in them are made up by the test server.
