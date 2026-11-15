import { seatLayout, type SeatSpot } from "./seat-layout";

const states = (spots: readonly SeatSpot[]) => spots.map((spot) => spot.state);
const at = (spots: readonly SeatSpot[]) =>
  spots.map((spot) => `${String(spot.row)}${String(spot.slot)}`);

describe("seatLayout (spec 15, 5.3)", () => {
  it("fills the front passenger seat, then the back seats from the outside in", () => {
    // The board: 3 offered, 1 taken, you have 1.
    const layout = seatLayout({ offered: 3, taken: 1, yours: 1 });
    expect(layout.rows).toBe(2);
    expect(at(layout.seats)).toEqual(["00", "02", "10", "12", "11"]);
    expect(states(layout.seats)).toEqual(["driver", "taken", "you", "free", "notOffered"]);
  });

  it("shows four passenger seats in a car offering up to four", () => {
    for (const offered of [1, 2, 3, 4]) {
      const layout = seatLayout({ offered, taken: 0, yours: 1 });
      expect(layout.rows).toBe(2);
      expect(layout.seats).toHaveLength(5);
      expect(states(layout.seats).filter((state) => state === "notOffered")).toHaveLength(
        4 - offered,
      );
    }
  });

  it("adds a third row for five to seven seats, and a second front seat for eight", () => {
    const seven = seatLayout({ offered: 7, taken: 2, yours: 2 });
    expect(seven.rows).toBe(3);
    expect(states(seven.seats)).toEqual([
      "driver",
      "taken",
      "taken",
      "you",
      "you",
      "free",
      "free",
      "free",
    ]);
    const eight = seatLayout({ offered: 8, taken: 0, yours: 1 });
    expect(eight.rows).toBe(3);
    expect(at(eight.seats).slice(0, 3)).toEqual(["00", "02", "01"]);
    expect(states(eight.seats).filter((state) => state !== "driver")).toHaveLength(8);
  });

  it("never shows more of your seats than are free", () => {
    expect(states(seatLayout({ offered: 3, taken: 3, yours: 1 }).seats)).toEqual([
      "driver",
      "taken",
      "taken",
      "taken",
      "notOffered",
    ]);
    expect(states(seatLayout({ offered: 3, taken: 2, yours: 2 }).seats)).toEqual([
      "driver",
      "taken",
      "taken",
      "you",
      "notOffered",
    ]);
  });
});
