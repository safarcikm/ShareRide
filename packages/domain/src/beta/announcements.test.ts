import { describe, expect, it } from "vitest";
import {
  announcementPreview,
  checkAnnouncement,
  receivesAnnouncement,
  type AnnouncementDraft,
  type AnnouncementReader,
} from "./announcements.ts";

const draft = (more: Partial<AnnouncementDraft> = {}): AnnouncementDraft => ({
  audience: "everyone",
  corridorId: null,
  titleIs: "Nýjar leiðir",
  titleEn: "New corridors",
  messageIs: "Við opnum tvær leiðir í næstu viku.",
  messageEn: "We open two corridors next week.",
  ...more,
});

describe("checkAnnouncement", () => {
  it("takes a title and a message in both languages, trimmed", () => {
    expect(checkAnnouncement(draft({ titleEn: "  New corridors  " }))).toEqual({
      ok: true,
      value: draft(),
    });
  });

  it("requires each of the four texts", () => {
    for (const field of ["titleIs", "titleEn", "messageIs", "messageEn"] as const) {
      expect(checkAnnouncement(draft({ [field]: "   " }))).toEqual({
        ok: false,
        error: { code: "text_missing", field },
      });
    }
  });

  it("holds a title to 80 characters and a message to 1,000", () => {
    expect(checkAnnouncement(draft({ titleIs: "x".repeat(80) })).ok).toBe(true);
    expect(checkAnnouncement(draft({ titleIs: "x".repeat(81) }))).toEqual({
      ok: false,
      error: { code: "text_too_long", field: "titleIs" },
    });
    expect(checkAnnouncement(draft({ messageEn: "x".repeat(1000) })).ok).toBe(true);
    expect(checkAnnouncement(draft({ messageEn: "x".repeat(1001) }))).toEqual({
      ok: false,
      error: { code: "text_too_long", field: "messageEn" },
    });
  });

  it("needs a corridor for that audience, and drops one for the others", () => {
    expect(checkAnnouncement(draft({ audience: "corridor" }))).toEqual({
      ok: false,
      error: { code: "corridor_missing" },
    });
    expect(checkAnnouncement(draft({ audience: "corridor", corridorId: "c" }))).toMatchObject({
      ok: true,
      value: { corridorId: "c" },
    });
    expect(checkAnnouncement(draft({ audience: "drivers", corridorId: "c" }))).toMatchObject({
      ok: true,
      value: { corridorId: null },
    });
  });
});

const reader = (more: Partial<AnnouncementReader> = {}): AnnouncementReader => ({
  betaNews: true,
  inGoodStanding: true,
  hasPostedTrip: false,
  hasBooked: false,
  onCorridor: false,
  ...more,
});

describe("receivesAnnouncement", () => {
  it("reaches everyone with Beta news on", () => {
    expect(receivesAnnouncement("everyone", reader())).toBe(true);
  });

  it("reaches nobody who turned Beta news off, whatever the audience", () => {
    const off = reader({ betaNews: false, hasPostedTrip: true, hasBooked: true, onCorridor: true });
    for (const audience of ["everyone", "drivers", "passengers", "corridor"] as const) {
      expect(receivesAnnouncement(audience, off)).toBe(false);
    }
  });

  it("leaves out an account that is suspended or waiting to be deleted", () => {
    expect(receivesAnnouncement("everyone", reader({ inGoodStanding: false }))).toBe(false);
  });

  it("reaches drivers who posted a trip, passengers who booked, and people on the corridor", () => {
    expect(receivesAnnouncement("drivers", reader())).toBe(false);
    expect(receivesAnnouncement("drivers", reader({ hasPostedTrip: true }))).toBe(true);
    expect(receivesAnnouncement("passengers", reader({ hasPostedTrip: true }))).toBe(false);
    expect(receivesAnnouncement("passengers", reader({ hasBooked: true }))).toBe(true);
    expect(receivesAnnouncement("corridor", reader({ hasBooked: true }))).toBe(false);
    expect(receivesAnnouncement("corridor", reader({ onCorridor: true }))).toBe(true);
  });
});

describe("announcementPreview", () => {
  it("keeps a short message, on one line", () => {
    expect(announcementPreview("We open\n\ntwo corridors.")).toBe("We open two corridors.");
  });

  it("cuts a long one with an ellipsis", () => {
    const preview = announcementPreview(`${"word ".repeat(60)}end`);
    expect(preview).toHaveLength(140);
    expect(preview.endsWith("…")).toBe(true);
  });
});
