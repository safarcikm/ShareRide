# How the pictures of spec 31 were made

Everything behind [spec 31](../../../2026-11-26-one-ride-one-ticket.md)'s
pictures and its [proposal page](../proposal/index.html). Nothing here ships
in the app or runs in CI.

| Folder | What it is |
| ------ | ---------- |
| `walk/` | The review walk: Playwright scripts that use the web app as a member does and take a picture of every screen (the "now" pictures) |
| `mock/` | The proposed screens as drawings: `kit.cjs` (the app's colours, fonts, icons and drawings, and the new parts) and `build.cjs` (the screens) |
| `mock/assets/` | Drawings copied out of the running app: the scene, the car, the puffin, the seat view and the maps |
| `page/` | The proposal page: `page.html` (its text and look) and `make.py` (puts the pictures in) |
| `built/` | The parts as built: `parts-screen.tsx` (a screen that shows them all) and `shoot.cjs` (takes its picture on a phone and a laptop, light and dark) |

## The "now" pictures

The walk needs the test API and a web build, as the web journeys do
([testing strategy](../../../../engineering/testing-strategy.md)). From
`apps/mobile`:

```sh
W=../../docs/specs/images/one-ride-one-ticket/src/walk
cp $W/walk.config.ts .
cp $W/walk.ts $W/walk-1-signed-out.spec.ts $W/walk-2-story.spec.ts e2e/
# in another terminal, the test API (it wipes and seeds the _test database):
#   cd ../api && PORT=3001 E2E_SMS_OUTBOX=/tmp/shareride-e2e-sms.jsonl \
#     E2E_EMAIL_OUTBOX=/tmp/shareride-e2e-email.jsonl \
#     E2E_WEB_ORIGIN=http://localhost:8082 pnpm e2e:serve
# and the web build:
#   EXPO_PUBLIC_API_URL=http://localhost:3001 npx expo export --platform web
#   node scripts/serve-web.ts 8082
E2E_SMS_OUTBOX=/tmp/shareride-e2e-sms.jsonl E2E_EMAIL_OUTBOX=/tmp/shareride-e2e-email.jsonl \
  WALK_OUT=/tmp/walk npx playwright test -c walk.config.ts --trace off
rm walk.config.ts e2e/walk*.ts   # never commit them there: CI would run them
```

The pictures land in `$WALK_OUT/<set>/<phone|laptop>/NN-name.png`, at twice
the screen's size. People, emails and phone numbers in them are made up by
the test server.

## The proposed screens

With the workspace installed (for the fonts and icons) and Playwright's
Chromium:

```sh
node docs/specs/images/one-ride-one-ticket/src/mock/build.cjs /tmp/mock
node docs/specs/images/one-ride-one-ticket/src/mock/build.cjs /tmp/mock home,trip   # only some
```

Each screen comes out whole (`home.png`) and as the first screen of a phone
or a small laptop (`home--first.png`).

## The page

```sh
python3 docs/specs/images/one-ride-one-ticket/src/page/make.py /tmp/walk /tmp/mock \
  docs/specs/images/one-ride-one-ticket/proposal
```

It writes `index.html` and `img/*.webp` (needs Pillow). `index.html` is the
page as published; it has no `<html>` or `<head>` of its own, because the
place it is published to adds them.

## The parts as built

The pictures in `../built/parts-*.webp` show the parts of section 3.3 in
the web app itself, to compare with the drawing of the parts. The screen is
not one of the app's: it is copied in for the pictures and taken out again.
From `apps/mobile`:

```sh
B=../../docs/specs/images/one-ride-one-ticket/src/built
cp $B/parts-screen.tsx src/app/zz-parts.tsx
EXPO_PUBLIC_API_URL=http://localhost:3001 npx expo export --platform web
rm src/app/zz-parts.tsx   # never commit it there: it would be a page of the app
node scripts/serve-web.ts 8082 &
node $B/shoot.cjs /zz-parts parts /tmp/built
```

The pictures land in `/tmp/built/parts-<phone|laptop>-<light|dark>.png`; no
API has to run, as `shoot.cjs` answers the app's first calls itself. They
are saved here as `.webp` (Pillow, quality 82). The people in them are made
up.
