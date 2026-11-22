import { consentRecord, savedChoice } from "./consent";

// The visitor's choice about Google Analytics, kept in the browser with its
// date (spec 23, 3.1, item 6; R23.5).
describe("the saved choice about Google Analytics", () => {
  const now = new Date("2026-11-22T21:00:00Z");

  it("is read back as it was saved, for 12 months", () => {
    expect(savedChoice(consentRecord("accepted", now), now)).toBe("accepted");
    expect(savedChoice(consentRecord("declined", now), new Date("2027-11-22T20:00:00Z"))).toBe(
      "declined",
    );
    expect(savedChoice(consentRecord("accepted", now), new Date("2027-11-22T21:00:00Z"))).toBe(
      null,
    );
  });

  it("is no choice when none was saved or what was saved does not read", () => {
    for (const raw of [null, "", "yes", "{}", '{"choice":"maybe","at":"2026-11-22T21:00:00Z"}']) {
      expect(savedChoice(raw, now)).toBe(null);
    }
    expect(savedChoice('{"choice":"accepted","at":"not a date"}', now)).toBe(null);
  });

  it("keeps only the choice and when it was made", () => {
    expect(JSON.parse(consentRecord("declined", now))).toEqual({
      choice: "declined",
      at: "2026-11-22T21:00:00.000Z",
    });
  });
});
