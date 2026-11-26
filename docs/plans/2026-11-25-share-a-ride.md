# Plan: share a ride on Facebook, Instagram and anywhere else

**Spec:** [spec 28](../specs/2026-11-25-share-a-ride.md) · **Date:**
2026-11-25 · **Status:** In progress

Martin, 2026-11-25: a share icon on the ride cards, and a prompt after
posting a ride to share it in groups, on Instagram and on walls. Four PRs
on `claude/project-thread-fcno2q`, each merged before the next. No
migration, no new dependency.

## PR 1: the spec and this plan

`docs(sharing)`: spec 28, this plan, both indexes.

## PR 2: the share icon on ride cards

`feat(search)`, spec 28, 3.1 items 1 to 4.

1. **A quiet icon button:** `IconButton` gets `quiet`: drawn 36 round
   inside its 44 button (the web has no `hitSlop`), no fill or edge, the icon in `textMuted`,
   `primarySoft` under the pointer or pressed. Spec 15's component table
   says so. Test first in `display-parts.test.tsx` or a new test.
2. **A card's corner:** `Card` gets `corner`, a node drawn in its top
   right corner outside the pressable part, after it, so it is a button of
   its own. Test: pressing the corner does not press the card.
3. **`lib/share.ts`:** `shareLink` takes the share window's title apart
   from its text; `copyText(text)` copies or answers "failed".
4. **`ResultCard`:** the corner icon shares the part's link with
   `trip.shareText`, a tick for two seconds and the `Announcer` after a
   copy, `ShareNotice` under the card after a failure. The top row leaves
   the icon room. Tests in `search` screen tests: shares the part's link,
   does not open the trip, copies without a share window.
5. **Texts:** `shareRide.cardLabel` in both languages.
6. **Web journey:** a search result's icon copies its link (`search.spec.ts`).
7. **Docs:** spec 4, 3.7 points to spec 28; the changelog.

## PR 3: Share this ride

`feat(drive)`, spec 28, 3.1 items 5 and 6, 3.2 items 1 to 4 and 6, 3.3,
3.4, 3.6.

1. **`sharing/post-text.ts`:** the post's lines for a `MyTrip` in a
   language (3.4). Test first: both languages, stops or none, instant or
   approval, never "kr", a fee or a name.
2. **`sharing/links.ts`:** Facebook's share address for a link, and the
   Page's address. Test: the link is encoded.
3. **`sharing/share-ride-panel.tsx`:** heading, Share (only with a share
   window: `canShare()` in `lib/share.ts`), Share on Facebook
   (`Linking.openURL`), the text box with the language chips and Copy
   text, Follow PuffinRide on Facebook. Tests with and without a share
   window and a clipboard.
4. **Screens:** the published screen shows the panel instead of "Share the
   trip"; `app/drive/trips/[id]/share.tsx` shows it for a trip that can be
   shared, otherwise `shareRide.notShareable` and a link to the trip; My
   trips' published cards and the driver's trip page head get the quiet
   icon that opens it. Tests in the drive screen tests.
5. **Texts:** the `shareRide.*` keys of spec 28, 8, except the story's.
6. **Web journeys:** `post-a-trip.spec.ts` sees the panel after
   publishing and copies the text; `laptop.spec.ts` looks at the share
   screen at 1280.
7. **Docs:** spec 3 screen 10 and spec 5's driver's trip point to spec 28;
   privacy (R28.3); the changelog.

## PR 4: the story picture

`feat(drive)`, spec 28, 3.2 item 5 and 3.5.

1. **API:** `ride-picture.ts` draws a story layout, 1080 × 1920, beside the
   link preview: the route one end under the other, the day, the stops,
   the scene, the safe area. `GET /v1/trips/{id}/story.png` with
   `download=1` and the file's name from the route. Tests first: the
   layout keeps inside the safe area for long names and many stops; the
   route answers a PNG of that size, 404 for a cancelled trip, and the
   file's name.
2. **App:** the panel's story section on the web: the picture small, Share
   picture where `navigator.canShare` takes a file (fetched when the panel
   shows), otherwise Download picture (`openDownload`), and Copy link.
   Tests for both.
3. **Texts:** `shareRide.story`, `shareRide.storyHint`, `shareRide.sharePicture`,
   `shareRide.downloadPicture`, `shareRide.copyLink`.
4. **Check by eye:** draw the story for a short, a long and a many-stop
   trip in both languages.
5. **Docs:** spec 23, 3.10 mentions the story picture; the changelog.

## After merging

Production needs a release (Martin's "Release to production"). Martin's
step then: publish or open a ride and share it into a group from his phone
and from a laptop.
