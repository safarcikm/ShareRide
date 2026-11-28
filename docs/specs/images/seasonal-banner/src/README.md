# How the pictures of spec 36 were made

The pictures of [spec 36](../../../2026-11-28-seasonal-banner.md) are taken
from its moving preview, [`../preview.html`](../preview.html), which draws
the front page's banner for every season and day with the app's scene, car
and puffins. Nothing here ships in the app or runs in CI.

`build.cjs` opens the preview in Playwright's Chromium, in light and dark,
and takes a picture of each banner as it stands once its moment is over
(the look Reduce motion shows), at twice the screen's size, saved as WebP:

```sh
node docs/specs/images/seasonal-banner/src/build.cjs
```

It writes the pictures into `../`. Once the banner is built, the website's
own journeys check the real thing with `?day=`.
