// The values the operator will set (spec 3, section 4; feature H4). Until the
// operator settings exist they are these defaults, passed to every rule so
// the API can later read them from the database.

export interface TripSettings {
  /** Suggested price per km per passenger, in krónur (rule P2). */
  readonly suggestedRatePerKm: number;
  /** The cost of driving per km, in krónur, shared by a full car (rule P3). */
  readonly referenceCostPerKm: number;
  /** Prices are whole steps of this many krónur. */
  readonly priceStep: number;
  /** Price levels are whole steps of this many percent (rule P4). */
  readonly priceLevelStep: number;
  /** Seats a trip offers, at most (R3.9). */
  readonly maxSeats: number;
  /** A point is on the way when it adds at most this percent of the direct distance… */
  readonly onTheWayPercent: number;
  /** …and at most this many metres: whichever is less (spec 3, 3.4.2). */
  readonly onTheWayMaxM: number;
  /** The route is at most this percent of the direct distance (R3.4). */
  readonly routeFactorPercent: number;
  /** A stop that adds more than this percent of the stretch between its neighbours… */
  readonly detourWarningPercent: number;
  /** …and more than this many metres shows a warning (spec 3, 3.4.5). */
  readonly detourWarningMinM: number;
  /** Planned times are rounded to this many minutes (spec 3, 3.5.2). */
  readonly timeRoundingMinutes: number;
  /** Each stretch takes at least this percent of its typical time (R3.6). */
  readonly timeFloorPercent: number;
  /** A stretch this many minutes longer than typical shows a warning (spec 3, 3.5.3). */
  readonly longBreakMinutes: number;
  /** Departure is at least this many minutes after publishing (R3.5)… */
  readonly minNoticeMinutes: number;
  /** …and at most this many days ahead. */
  readonly maxDaysAhead: number;
}

/** The starting values (decided 2026-11-13, pricing and seats; spec 3). */
export const defaultTripSettings: TripSettings = {
  suggestedRatePerKm: 15,
  referenceCostPerKm: 150,
  priceStep: 100,
  priceLevelStep: 10,
  maxSeats: 8,
  onTheWayPercent: 5,
  onTheWayMaxM: 3000,
  routeFactorPercent: 150,
  detourWarningPercent: 20,
  detourWarningMinM: 20_000,
  timeRoundingMinutes: 5,
  timeFloorPercent: 90,
  longBreakMinutes: 120,
  minNoticeMinutes: 30,
  maxDaysAhead: 60,
};
