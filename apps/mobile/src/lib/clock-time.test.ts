import { clockText, roundUpClock } from "./clock-time";

describe("roundUpClock", () => {
  it.each([
    [
      { hour: 9, minute: 30 },
      { hour: 9, minute: 30 },
    ],
    [
      { hour: 9, minute: 31 },
      { hour: 9, minute: 35 },
    ],
    [
      { hour: 9, minute: 58 },
      { hour: 10, minute: 0 },
    ],
    [
      { hour: 0, minute: 1 },
      { hour: 0, minute: 5 },
    ],
  ])("rounds %j up to the next 5 minutes", (clock, rounded) => {
    expect(roundUpClock(clock)).toEqual(rounded);
  });

  it("goes on to 00:00 after 23:55", () => {
    expect(roundUpClock({ hour: 23, minute: 57 })).toEqual({ hour: 0, minute: 0 });
  });

  it("keeps a departure after 23:55 on its day", () => {
    expect(roundUpClock({ hour: 23, minute: 57 }, true)).toEqual({ hour: 23, minute: 55 });
    expect(roundUpClock({ hour: 9, minute: 31 }, true)).toEqual({ hour: 9, minute: 35 });
  });
});

describe("clockText", () => {
  it("writes a 24-hour clock with two digits each", () => {
    expect(clockText({ hour: 9, minute: 5 })).toBe("09:05");
    expect(clockText({ hour: 21, minute: 30 })).toBe("21:30");
  });
});
