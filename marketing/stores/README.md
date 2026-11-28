# The App Store and Google Play pages

Everything the two stores' pages need for PuffinRide 1.0 (spec 32, 3.9),
ready to paste and upload, with the scripts that make it.

| What | Where |
| ---- | ----- |
| The texts: names, subtitles, descriptions, keywords, each with its count | [texts.md](texts.md), written by `src/listing.py` |
| App Store screenshots, English (U.K.), 1320 x 2868 (6.9-inch iPhone) | `app-store/en-GB/1-find.png` to `6-offer.png` |
| Google Play phone screenshots, 1080 x 1920, Icelandic and English | `google-play/is/` and `google-play/en/`, `1-find.png` to `6-offer.png` |
| Google Play feature graphic, 1024 x 500 | `google-play/is/feature-graphic.png`, `google-play/en/feature-graphic.png` |
| Google Play icon, 512 x 512 | `google-play/icon-512.png` |
| Apple's privacy label and Google's data safety answers | [privacy-answers.md](privacy-answers.md) |
| Age rating, notes for the reviewers, the review account, the other forms | [review-and-rating.md](review-and-rating.md) |
| What the apps add to the privacy policy (published from version 4) | [privacy-policy-v4-paragraphs.md](privacy-policy-v4-paragraphs.md) |
| The phones' own screenshots the pictures are made from | `screens/ios/`, `screens/android/` |

## The rules they keep

- **No word about payments or fees** (Martin, 2026-11-22). `listing.py`
  refuses a text or caption that has one, in either language. The
  screenshots show the app's screens as they are, so a ride's price shows
  on its card, as it does in the app.
- **True to the app today:** open to everyone aged 18 and over, more than
  100 meeting points, Icelandic and English. **Nothing about Google
  sign-in** on the App Store page: the iPhone app has none in version 1
  (spec 32, 3.3).
- **Sample data only** (R32.6): the screenshots come from the phone
  journeys against the test API's sample rides and people, signed out.
- **Google Play's rules for pictures:** no "best", "#1", "top", "new",
  "free" or calls to action, captions well under a fifth of the picture, no
  phone drawn around the screen. `listing.py` checks the words.
- The App Store has no Icelandic for store texts, so its page and pictures
  are in English (United Kingdom), the language of its Iceland store.

## Putting them in the stores (Martin)

Nothing here is sent to a store by a script: Martin pastes and uploads, and
presses Submit himself (R32.2).

**App Store Connect**, PuffinRide (Apple ID 6840158626):

1. App Information: name, subtitle, category Travel, content rights and the
   age rating ([review-and-rating.md](review-and-rating.md)).
2. App Privacy: the answers in [privacy-answers.md](privacy-answers.md), and
   the privacy policy address.
3. The 1.0 version, English (U.K.): promotional text, description,
   keywords, the support and marketing addresses from [texts.md](texts.md);
   the six pictures in `app-store/en-GB/` in their order under "iPhone
   6.9-inch display". App Store Connect makes the smaller iPhones' pictures
   from them.
4. App Review Information: the review account and the notes.

**Play Console**, PuffinRide:

1. Policy and programs, App content: each item in
   [review-and-rating.md](review-and-rating.md), and Data safety from
   [privacy-answers.md](privacy-answers.md).
2. Grow users, Store presence, Main store listing: Icelandic as the default
   language with its texts, the icon, the feature graphic and the six
   pictures from `google-play/is/`; then English (United Kingdom) as a
   translation, with `google-play/en/`.
3. Store settings: category Travel and local, and the contact details.

## Drawing them again

The texts: change them in `src/listing.py` and run
`python3 marketing/stores/src/listing.py marketing/stores/texts.md`.

The pictures, after the app's screens change:

1. In GitHub, Actions, **Phone apps**, Run workflow, on the branch with
   the change, with "Which journeys" set to **store**. It runs
   `apps/mobile/maestro/store` on the iPhone of the App Store's largest
   size and on the Android emulator, in English and Icelandic, with a tidy
   status bar, and keeps the screenshots as the run's `phone-ios` and
   `phone-android` artifacts.
2. Download both, and put their `store-*.png` files in `screens/ios/` and
   `screens/android/`.
3. `sh marketing/stores/src/build.sh marketing/stores/screens <build dir> marketing/stores`
   checks the texts, writes `texts.md`, draws every picture with Chromium
   (Playwright) and takes their alpha channel off, as App Store Connect
   asks. It needs Python 3 with Pillow and Node.js with Playwright, and uses
   the fonts and drawings of `launch-ads/` and `social-pages/`.

To change a caption or the order, edit `SCREENS` in `src/listing.py`; to
change the frame, `src/pictures.py`.
