# 0029. Photos made in the browser and checked by the API; links signed per hour

- **Status:** Accepted (2026-11-17, by Martin on a decision card in the
  project thread)
- **Date:** 2026-11-17
- **Deciders:** Martin
- **Supersedes:** in [ADR 0022](0022-photo-storage-on-hetzner.md), "the API
  re-encodes each photo" and "signed links that expire after an hour" (the
  bucket in Helsinki, private, with random keys, stays)
- **Related:** [spec 2](../specs/2026-11-13-meeting-points.md) 3.6.3,
  [milestone 8 plan](../plans/2026-11-16-milestone-8-operator-console-and-meeting-points.md)
  decision 4 and 4.5, [operator console](../engineering/operator-console.md#photos)

## Context

Meeting point photos (spec 2) are the first photos we store; profile
photos (milestone 13) come later. A phone's photo carries its location,
the camera and often a thumbnail, and can be 5 to 20 MB. None of that may
be stored or shown. ADR 0022 had the API re-encode each photo, which needs
an image library in the API: a native one (sharp, libvips) or a slow one
in plain JavaScript, and decoding untrusted images on the server.

The milestone 8 plan, which Martin accepted, has the console resize and
re-encode instead. Browsers differ in what they write: Chrome and Firefox
write JFIF only, Safari may add an Exif segment with the size and colour
space. So the API cannot trust that the browser did its part.

The app caches a point's details for five minutes, and a cached answer must
hold links that still work. A link that expires exactly an hour after it
was made changes on every request and could be cached until a minute
before it expires.

## Options considered

1. **The API re-encodes (ADR 0022).** The strongest guarantee. But an image
   library (sharp is native and large), decoding untrusted files on a
   512 MB server, and full-size uploads of up to 20 MB.
2. **The browser re-encodes; the API checks.** The console draws the photo
   on a canvas at most 1 600 pixels wide, writes a JPEG and keeps only the
   segments the picture needs. The API reads the file segment by segment
   and refuses anything not on a short list. Small uploads, no image
   library. A file the check misses could carry data inside the picture's
   own tables, which only a crafted upload by an operator could do.
3. **The browser re-encodes; the API strips.** As 2, but the API drops what
   it does not know instead of refusing it. Kinder to an odd browser, but
   it silently changes files and hides a console that does not clean them.

## Decision

We will have the operator console resize and re-encode each photo in the
browser, keeping only the picture's own segments, and have the API accept
only a JPEG whose segments are all on its list (the plain JFIF header
without a thumbnail, quantisation and Huffman tables, a restart interval,
one baseline or progressive frame and its scans, each exactly as long as
its parts, with nothing after its end), at most 2 MB and 1 600 pixels
(`checkPhotoFile` in the domain). We will sign each link to the bucket from
the start of the hour, valid for two hours, so a link lasts at least an
hour and stays the same all hour.

## Consequences

- No image library in the API, and uploads of a few hundred kilobytes.
- The rule lives in the domain, so the console and the API share it.
- A browser that writes something new is refused until the console cleans
  it; the console's tests include a Safari-shaped file.
- A link can be used for up to two hours, not one. Photos of public places
  make that acceptable; profile photos (milestone 13) should revisit it.
- Follow-up: the console's cleaning step and its tests (PR 8b).

## Revisit when

Profile photos arrive (people's own uploads from phones, not an
operator's), the API moves to a server where an image library is cheap, or
a browser's output is refused in practice.
