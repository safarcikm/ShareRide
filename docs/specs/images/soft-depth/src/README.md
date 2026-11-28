# How the pictures of the shadows were made

The pictures in [`..`](..) compare the looks Martin chose from on
2026-11-28 (spec 15, decision 16): the app as it was, and the three ways
to draw cards and buttons. Nothing here ships in the app or runs in CI.

| Picture | What it shows |
| ------- | ------------- |
| `0-now-on-iphone.webp` | The app before the change, from the iPhone check of the phone apps (the simulator) |
| `1-close-up.webp`, `2-close-up-night.webp` | One card and one button in each look, by day and at night |
| `3-find-phone.webp`, `4-ride-phone.webp`, `5-driver-phone-night.webp` | Find, a ride and a driver's ride on an iPhone's screen, in each look |
| `6-laptop.webp` | Find on a laptop, before and in look 2 |
| `7-ticket-notches.webp` | The notches of a ticket's tear line as built, three times as large: under the pointer (moss) and at rest (hairline), by day and at night (`shoot.cjs`) |

| File | What it is |
| ---- | ---------- |
| `looks.spec.ts` | A Playwright script: Bára offers a ride, Dóra and Edda sign up, and each screen is taken in every look, on an iPhone's screen (393 by 852, three times as large) and on a laptop (1280 by 800, twice as large), by day and at night |
| `looks.config.ts` | Its own Playwright settings: no web server of its own, one worker |
| `serve-looks.cjs` | Serves the web build that the link `current` names, read again at every request, so the script can switch looks on the same address and keep its people signed in |
| `boards.py` | Puts the pictures side by side, with the looks' names (needs Pillow) |
| `shoot.cjs` | Takes the notches of the first tickets on the front page, on a laptop, with the pointer on the first, by day and at night: `node shoot.cjs <folder>` from `apps/mobile`, with the build served on port 8082 |

## Making them

The script needs the test API and the web builds, as the web journeys do
([testing strategy](../../../../engineering/testing-strategy.md)). The
three looks were built from the branch of the change while it had a
switch (`EXPO_PUBLIC_LOOK` read in `apps/mobile/src/theme/pressable.ts`:
`slab`, `mix` or `soft`), and "before" from `main`. From `apps/mobile`:

```sh
H=/tmp/looks   # holds web-before, web-slab, web-mix and web-soft
EXPO_PUBLIC_API_URL=http://localhost:3001 npx expo export --platform web --output-dir $H/web-before
# ... and once for each look, with EXPO_PUBLIC_LOOK=<look> set as well
S=../../docs/specs/images/soft-depth/src
ln -sfn $H/web-before $H/current && node $S/serve-looks.cjs $H 8082 &
# in another terminal, the test API (it wipes and seeds the _test database):
#   cd ../api && PORT=3001 E2E_SMS_OUTBOX=/tmp/shareride-e2e-sms.jsonl \
#     E2E_EMAIL_OUTBOX=/tmp/shareride-e2e-email.jsonl \
#     E2E_WEB_ORIGIN=http://localhost:8082 pnpm e2e:serve
cp $S/looks.spec.ts e2e/zz-looks.spec.ts && cp $S/looks.config.ts zz-looks.config.ts
set -a; . ../../.env; set +a
E2E_SMS_OUTBOX=/tmp/shareride-e2e-sms.jsonl E2E_EMAIL_OUTBOX=/tmp/shareride-e2e-email.jsonl \
  LOOKS_HOME=$H LOOKS_OUT=$H/pictures npx playwright test -c zz-looks.config.ts
rm e2e/zz-looks.spec.ts zz-looks.config.ts   # never commit them there: CI would run them
python3 $S/boards.py $H/pictures /tmp/boards
```

The people in the pictures are made up by the script and the test server.
