# Marketing

Pictures and texts made for PuffinRide outside the app, with the scripts
that draw them, so any text can be changed and the pictures drawn again.
Everything here keeps to Martin's rules for marketing: never a word about
payments or fees, no Meta Pixel, and every claim true to the app on
puffinride.is today.

| Folder | What | Made |
| ------ | ---- | ---- |
| `launch-ads/` | Facebook and Instagram ads (square, feed, story) in Icelandic and English, the Facebook cover and an A5 flyer with a QR code. Texts and tagged links in [ad-texts.md](launch-ads/ad-texts.md) | 2026-11-22 |
| `social-pages/` | The Facebook Page and Instagram profile kit: profile picture, highlight covers, the first seven posts, a welcome story, and the texts (names, bios, captions, hashtags, alt text, a four-week plan, Messenger replies and the setup checklist) in [texts.md](social-pages/texts.md) | 2026-11-25 |

## Drawing them again

The pictures are HTML and SVG drawn by Python scripts and turned into PNG
or PDF by Chromium with Playwright. They use the app's fonts, Fredoka and
Nunito (SIL Open Font License, licences in `launch-ads/src/fonts/`), and the
same puffins and Beetle-style car as the site.

- **Launch ads and flyer:** `sh launch-ads/src/build_all.sh <python> <build dir> <out dir>`.
  The Python needs `segno` and `pikepdf`; the CMYK flyer needs Ghostscript.
- **Page kit:** `sh social-pages/src/build.sh <build dir> <out dir> [names]`,
  for example `post-04-safety-en` to draw only that post. The meeting points
  map comes from `social-pages/src/iceland-map.json`; after the points
  change, run `node social-pages/src/export_map.ts` to write it again from
  the app's map and `packages/db/src/places/*.csv`.

Then copy the new pictures over the old ones here, in the same pull request
as the script change.
