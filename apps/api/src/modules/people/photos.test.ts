import { describe, expect, it } from "vitest";
import { createFakePhotoStorage } from "../../platform/photo-storage.ts";
import { markedPhotoOf, photoLinkOf } from "./photos.ts";

const key = "profile-photos/0193f0c4-7d4a-7b1e-9c2a-123456789abc.jpg";
const now = new Date("2026-11-22T12:00:00Z");

describe("photoLinkOf (spec 1, 3.5; ADR 0033)", () => {
  const linkOf = photoLinkOf(createFakePhotoStorage(), now);

  it("links to a photo ShareRide has not hidden", async () => {
    expect(await linkOf({ photoKey: key, photoHiddenAt: null })).toBe(`https://photos.test/${key}`);
  });

  it("gives null without a photo, or for one ShareRide hid", async () => {
    expect(await linkOf({ photoKey: null, photoHiddenAt: null })).toBeNull();
    expect(await linkOf({ photoKey: key, photoHiddenAt: now })).toBeNull();
  });

  it("gives null on a server without photo storage", async () => {
    expect(await photoLinkOf(undefined, now)({ photoKey: key, photoHiddenAt: null })).toBeNull();
  });
});

describe("markedPhotoOf (spec 9, 3.4.3; ADR 0033)", () => {
  const markedOf = markedPhotoOf(createFakePhotoStorage(), now);

  it("links to the photo and says whether ShareRide hid it, as its owner and the console see it", async () => {
    expect(await markedOf({ photoKey: key, photoHiddenAt: null })).toEqual({
      url: `https://photos.test/${key}`,
      hidden: false,
    });
    expect(await markedOf({ photoKey: key, photoHiddenAt: now })).toEqual({
      url: `https://photos.test/${key}`,
      hidden: true,
    });
  });

  it("gives null without a photo, and on a server without photo storage", async () => {
    expect(await markedOf({ photoKey: null, photoHiddenAt: null })).toBeNull();
    expect(await markedPhotoOf(undefined, now)({ photoKey: key, photoHiddenAt: null })).toBeNull();
  });
});
