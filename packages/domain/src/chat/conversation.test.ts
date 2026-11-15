import { describe, expect, it } from "vitest";
import { canWrite, conversationWindow } from "./conversation.ts";
import { defaultChatSettings } from "./settings.ts";

const confirmedAt = new Date("2026-11-20T09:00:00Z");
const arrivesAt = new Date("2026-11-22T12:30:00Z");
const window = conversationWindow({ confirmedAt, arrivesAt }, defaultChatSettings);
const minute = 60_000;

describe("a booking's conversation (R7.1)", () => {
  it("opens when the booking is confirmed", () => {
    expect(window.opensAt).toEqual(confirmedAt);
  });

  it("closes 7 days after the trip's planned arrival", () => {
    expect(window.closesAt).toEqual(new Date("2026-11-29T12:30:00Z"));
  });

  it("can be written in from the moment it opens until a minute before it closes", () => {
    expect(canWrite(window, confirmedAt)).toBe(true);
    expect(canWrite(window, new Date(window.closesAt.getTime() - minute))).toBe(true);
  });

  it("is read-only exactly at closing time and after", () => {
    expect(canWrite(window, window.closesAt)).toBe(false);
    expect(canWrite(window, new Date(window.closesAt.getTime() + minute))).toBe(false);
  });

  it("cannot be written in before the booking is confirmed", () => {
    expect(canWrite(window, new Date(confirmedAt.getTime() - minute))).toBe(false);
  });
});
