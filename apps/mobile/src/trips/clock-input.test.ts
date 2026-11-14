import { onOrAfter, parseClock } from "./clock-input";

describe("parseClock", () => {
  it.each([
    ["9", { hour: 9, minute: 0 }],
    ["930", { hour: 9, minute: 30 }],
    ["0930", { hour: 9, minute: 30 }],
    ["9:30", { hour: 9, minute: 30 }],
    [" 09.30 ", { hour: 9, minute: 30 }],
    ["21 05", { hour: 21, minute: 5 }],
    ["23:59", { hour: 23, minute: 59 }],
  ])("reads %j", (text, clock) => {
    expect(parseClock(text)).toEqual(clock);
  });

  it.each(["", "24:00", "9:60", "9:3", "nine", "9:30 am", "12345"])("refuses %j", (text) => {
    expect(parseClock(text)).toBeNull();
  });
});

describe("onOrAfter", () => {
  const previous = new Date("2026-11-15T22:30:00Z");

  it("keeps a later time on the same day", () => {
    expect(onOrAfter(previous, { hour: 23, minute: 10 })).toEqual(new Date("2026-11-15T23:10:00Z"));
  });

  it("moves an earlier time to the next day", () => {
    expect(onOrAfter(previous, { hour: 0, minute: 40 })).toEqual(new Date("2026-11-16T00:40:00Z"));
  });

  it("keeps the same time on the same day", () => {
    expect(onOrAfter(previous, { hour: 22, minute: 30 })).toEqual(previous);
  });
});
