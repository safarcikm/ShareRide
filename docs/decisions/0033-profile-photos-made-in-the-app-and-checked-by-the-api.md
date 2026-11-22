# 0033. Profile photos made in the app and checked by the API

- **Status:** Accepted (2026-11-22, by Martin on a decision card in the
  project thread)
- **Date:** 2026-11-22
- **Deciders:** Martin
- **Related:** [ADR 0022](0022-photo-storage-on-hetzner.md),
  [ADR 0029](0029-photos-cleaned-in-the-browser-and-checked-by-the-api.md)
  (its "revisit when profile photos arrive"),
  [spec 1](../specs/2026-11-13-sign-in-and-profile.md) 3.5,
  [profile photos plan](../plans/2026-11-22-profile-photos.md)

## Context

Profile photos are the first photos that members upload themselves, from
phones and browsers, rather than the operator in the console. A phone's
photo carries where and when it was taken, the camera and often a
thumbnail, and can be 5 to 20 MB. None of that may be stored or shown
(spec 1, section 7). ADR 0029 has the console clean meeting point photos
and the API refuse any file with more than the picture in it. It asked to
look again when profile photos arrived, because a member, not only the
operator, could then send a crafted file. The app already cleans its
feedback screenshots the same way (spec 12, 3.3.2).

## Options considered

1. **The app cleans, the API checks.** The app crops the photo square,
   makes it at most 640 pixels and writes it again as a JPEG. On a phone
   that is Expo's image manipulator, and in a browser a canvas. Then
   `stripPhotoMetadata` drops what the phone or browser added. The API
   takes only a square JPEG that passes `checkPhotoFile`. There is no image
   library on the server and uploads stay small. A crafted file could still
   hide data inside the picture's own tables, but only data the uploader
   put there about themselves.
2. **The server re-encodes every photo.** sharp (libvips) decodes and
   writes every upload again. That is the strongest guarantee, and it would
   also catch a file built to attack another person's image decoder. But it
   adds a large native library to the API, which decodes strangers' files
   on a 512 MB server, and uploads come in at full size.

## Decision

We will have the app crop each profile photo square, at most 640 pixels,
and write it again as a JPEG without what the phone added. The API will
take only a square JPEG of 256 to 640 pixels and at most 512 KB, with
nothing but the picture in it (`checkProfilePhoto` in the domain, built on
`checkPhotoFile`). Each photo is stored under a new random key in the
private bucket of ADR 0022. Its links are signed per hour, as in ADR 0029.
Every file a person no longer has (a photo they replaced or removed, or
their erased account's photo) is queued and deleted from the bucket. A
failed deletion is tried again every minute until it works.

## Consequences

- There is one rule for every photo we take, in the domain, shared by the
  app, the console and the API.
- There is no new dependency category on the server. The app adds Expo's
  image picker and image manipulator.
- A link can work for up to two hours, but a removed photo's file is gone
  within a minute, and with it every link to it.
- A phone or browser whose JPEG the check refuses stops uploads until the
  app handles it. The app's tests include Safari- and iPhone-shaped files.
- We do not import a photo from Google or Apple sign-in. People choose
  their own photo.

## Revisit when

Reports show crafted or harmful files getting through, the API moves to a
server where an image library is cheap, or a common phone's output is
refused in practice.
