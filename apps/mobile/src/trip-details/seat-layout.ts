/**
 * Where the seats of the seat view go (spec 15, section 5.3). Positions are
 * illustrative: ShareRide does not assign seats. Rows count from the front
 * (row 0, the driver's); slots run across the car from the driver's side
 * (0) to the other side (2), with 1 in the middle.
 */
export type SeatState = "driver" | "you" | "taken" | "free" | "notOffered";

export interface SeatSpot {
  readonly row: number;
  readonly slot: 0 | 1 | 2;
  readonly state: SeatState;
}

export interface SeatLayout {
  readonly rows: number;
  /** The driver first, then the passenger seats in the order they fill. */
  readonly seats: readonly SeatSpot[];
}

/** A back row fills from the outside in. */
const backRow = (row: number) => [
  { row, slot: 0 as const },
  { row, slot: 2 as const },
  { row, slot: 1 as const },
];

/**
 * The car is drawn with as few seats as hold what the driver offers: a
 * five-seat car up to four, a third row up to seven, and a second front
 * passenger seat for eight. The car's own seat count is not known.
 */
function passengerSpots(offered: number) {
  if (offered <= 4) return [{ row: 0, slot: 2 as const }, ...backRow(1)];
  const front =
    offered <= 7
      ? [{ row: 0, slot: 2 as const }]
      : [
          { row: 0, slot: 2 as const },
          { row: 0, slot: 1 as const },
        ];
  return [...front, ...backRow(1), ...backRow(2)];
}

/**
 * Taken seats come first, then yours, then free ones; the rest are not
 * offered. Yours never outnumber the seats free.
 */
export function seatLayout(counts: {
  readonly offered: number;
  readonly taken: number;
  readonly yours: number;
}): SeatLayout {
  const spots = passengerSpots(counts.offered);
  const taken = Math.min(counts.taken, counts.offered);
  const yours = Math.min(counts.yours, counts.offered - taken);
  const stateAt = (index: number): SeatState => {
    if (index < taken) return "taken";
    if (index < taken + yours) return "you";
    return index < counts.offered ? "free" : "notOffered";
  };
  return {
    rows: Math.max(...spots.map((spot) => spot.row)) + 1,
    seats: [
      { row: 0, slot: 0, state: "driver" },
      ...spots.map((spot, index) => ({ ...spot, state: stateAt(index) })),
    ],
  };
}
