// A member's own CO2 totals as the API gives them (spec 34, 3.8), for
// screen tests. Not used by the app itself.
import type { Co2Totals } from "@shareride/contracts";
import { ok, type FakeClient } from "./fake-client";

/** Nothing counted yet: what a new member, or the setting at 0, gives. */
export const noCo2Totals: Co2Totals = { grams: 0, asPassenger: null, asDriver: null };

/** 66 kg as a passenger on 2 rides and 95 kg as a driver with 2 passengers on 1 ride. */
export const bothRoles: Co2Totals = {
  grams: 161_100,
  asPassenger: { grams: 66_000, rides: 2 },
  asDriver: { grams: 95_100, rides: 1, passengers: 2 },
};

/** Answers GET /v1/me/co2 with what `totals` gives at the time. */
export function co2Api(client: FakeClient, totals: () => Co2Totals) {
  client.answer("/v1/me/co2", () => ok(200, totals()));
}
