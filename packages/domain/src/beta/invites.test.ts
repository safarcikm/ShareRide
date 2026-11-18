import { describe, expect, it } from "vitest";
import {
  checkGroupCode,
  checkInviteCode,
  inviteCodeAlphabet,
  isInviteCodeShaped,
  newInviteCode,
  normaliseInviteCode,
  placesLeft,
  type InviteCodeState,
} from "./invites.ts";

const now = new Date("2026-11-18T12:00:00.000Z");
const seconds = (count: number) => new Date(now.getTime() + count * 1000);

const group = (over: Partial<InviteCodeState> = {}): InviteCodeState => ({
  usesAllowed: 20,
  uses: 0,
  expiresAt: seconds(3600),
  endedAt: null,
  ...over,
});

describe("an invite code as typed", () => {
  it("is upper-cased, without spaces and hyphens", () => {
    expect(normaliseInviteCode(" abcd-2345 ")).toBe("ABCD2345");
    expect(normaliseInviteCode("ab cd 23 45")).toBe("ABCD2345");
  });

  it("is shaped like a code when it has 8 of the code's characters", () => {
    expect(isInviteCodeShaped("ABCD2345")).toBe(true);
    expect(isInviteCodeShaped("ABCD234")).toBe(false);
    expect(isInviteCodeShaped("ABCD23456")).toBe(false);
    // No I, L, O, 0 or 1.
    for (const confused of ["I", "L", "O", "0", "1"]) {
      expect(isInviteCodeShaped(`ABCD234${confused}`)).toBe(false);
    }
  });
});

describe("a new invite code", () => {
  it("has 8 characters, each picked by the random number", () => {
    const picks = [0, 1, 2, 3, 4, 5, 6, inviteCodeAlphabet.length - 1];
    const code = newInviteCode(() => picks.shift() ?? 0);
    expect(code).toBe("ABCDEFG9");
    expect(isInviteCodeShaped(code)).toBe(true);
  });
});

describe("using an invite code (R12.1 to R12.3)", () => {
  it("works while it has uses left, has not ended and the beta has places", () => {
    expect(checkInviteCode(group(), 0, 150, now).ok).toBe(true);
  });

  it("refuses a code nobody made", () => {
    expect(checkInviteCode(undefined, 0, 150, now)).toEqual({
      ok: false,
      error: { code: "invite_invalid" },
    });
  });

  it("works at its last use and not past it", () => {
    expect(checkInviteCode(group({ uses: 19 }), 0, 150, now).ok).toBe(true);
    expect(checkInviteCode(group({ uses: 20 }), 0, 150, now)).toEqual({
      ok: false,
      error: { code: "invite_invalid" },
    });
  });

  it("works a second before its end and not from its end on", () => {
    expect(checkInviteCode(group({ expiresAt: seconds(1) }), 0, 150, now).ok).toBe(true);
    for (const expiresAt of [now, seconds(-1)]) {
      expect(checkInviteCode(group({ expiresAt }), 0, 150, now)).toEqual({
        ok: false,
        error: { code: "invite_invalid" },
      });
    }
  });

  it("refuses a code the operator ended", () => {
    expect(checkInviteCode(group({ endedAt: seconds(-60) }), 0, 150, now)).toEqual({
      ok: false,
      error: { code: "invite_invalid" },
    });
  });

  it("holds the tester cap: the 150th joins, the 151st does not", () => {
    expect(checkInviteCode(group(), 149, 150, now).ok).toBe(true);
    for (const testers of [150, 151]) {
      expect(checkInviteCode(group(), testers, 150, now)).toEqual({
        ok: false,
        error: { code: "beta_full" },
      });
    }
  });

  it("says a bad code is invalid even when the beta is full", () => {
    expect(checkInviteCode(group({ uses: 20 }), 150, 150, now)).toEqual({
      ok: false,
      error: { code: "invite_invalid" },
    });
  });

  it("counts the places left, never below none", () => {
    expect(placesLeft(150, 0)).toBe(150);
    expect(placesLeft(150, 149)).toBe(1);
    expect(placesLeft(150, 150)).toBe(0);
    expect(placesLeft(100, 120)).toBe(0);
  });
});

describe("a group code the operator makes", () => {
  const draft = { name: " Marel carpool ", uses: 20, expiresAt: seconds(86_400) };

  it("is accepted with its name trimmed", () => {
    expect(checkGroupCode(draft, now)).toEqual({
      ok: true,
      value: { name: "Marel carpool", uses: 20, expiresAt: draft.expiresAt },
    });
  });

  it("needs a name of at most 80 characters", () => {
    expect(checkGroupCode({ ...draft, name: "  " }, now)).toEqual({
      ok: false,
      error: { code: "name_missing" },
    });
    expect(checkGroupCode({ ...draft, name: "a".repeat(80) }, now).ok).toBe(true);
    expect(checkGroupCode({ ...draft, name: "a".repeat(81) }, now)).toEqual({
      ok: false,
      error: { code: "name_too_long", max: 80 },
    });
  });

  it("takes 1 to 500 uses, in whole numbers", () => {
    for (const uses of [1, 500]) expect(checkGroupCode({ ...draft, uses }, now).ok).toBe(true);
    for (const uses of [0, 501, 2.5]) {
      expect(checkGroupCode({ ...draft, uses }, now)).toEqual({
        ok: false,
        error: { code: "uses_out_of_range", min: 1, max: 500 },
      });
    }
  });

  it("ends in the future, at most 12 months ahead", () => {
    expect(checkGroupCode({ ...draft, expiresAt: now }, now)).toEqual({
      ok: false,
      error: { code: "end_in_past" },
    });
    const latest = new Date("2027-11-18T12:00:00.000Z");
    expect(checkGroupCode({ ...draft, expiresAt: latest }, now).ok).toBe(true);
    expect(checkGroupCode({ ...draft, expiresAt: new Date(latest.getTime() + 1000) }, now)).toEqual(
      { ok: false, error: { code: "end_too_far", latest } },
    );
  });
});
