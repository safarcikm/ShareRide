# How the pictures of the side column were made

On 2026-11-28 Martin saw a scrollbar under the side column of Find on a
laptop, signed in, which cut off the right edge of the ticket under "Your
next ride" ([spec 18, 3.2](../../../../2026-11-18-laptop-layout.md#32-wide-screens)).
The pictures in [`..`](..) show Find before and after the fix. Nothing
here ships in the app or runs in CI.

| Picture | What it shows |
| ------- | ------------- |
| `before-1-close-up.png`, `after-1-close-up.png` | The side column on a laptop, 1280 wide, twice as large: before, a scrollbar under it and the ticket's right edge cut; after, the ticket whole |
| `before-2-laptop.png`, `after-2-laptop.png` | The whole window around it |
| `after-3-phone.png` | Find on a phone after the fix, where nothing changed: the next ride stands under the greeting |

| File | What it is |
| ---- | ---------- |
| `side-column.spec.ts` | A Playwright script: Bára offers a ride for tomorrow and opens Find, on a laptop and on a phone. It runs Chrome with its scrollbars drawn, as Chrome on Windows draws them |

## Making them

The script needs the test API and the web build, as the web journeys do
([testing strategy](../../../../../engineering/testing-strategy.md)). From
`apps/mobile`, once with `main` built (`STAGE=before`) and once with the
fix (`STAGE=after`):

```sh
EXPO_PUBLIC_API_URL=http://localhost:3001 npx expo export --platform web
node scripts/serve-web.ts 8082 &
S=../../docs/specs/images/laptop-layout/side-column/src
cp $S/side-column.spec.ts e2e/zz-side-column.spec.ts
set -a; . ../../.env; set +a
STAGE=after PICTURES_OUT=/tmp/side-column PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium \
  npx playwright test e2e/zz-side-column.spec.ts --project=desktop --trace off
rm e2e/zz-side-column.spec.ts   # never commit it there: CI would run it
```

`PLAYWRIGHT_CHROMIUM_PATH` names a full Chrome: the headless shell draws
no scrollbars. The people in the pictures are made up by the script and
the test server.
