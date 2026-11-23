import type { MyTrip } from "@shareride/contracts";
import { router } from "expo-router";

/** The five steps of posting a trip (spec 3, screens 4 to 9). */
// The seats come before the price, as the highest price level depends on
// them (spec 3, 3.6; spec 17).
export const stepNames = ["route", "time", "seats", "price", "review"] as const;
export type StepName = (typeof stepNames)[number];

export const stepNumber = (step: StepName) => stepNames.indexOf(step) + 1;

export function stepHref(id: string, step: StepName) {
  return { pathname: `/drive/trips/[id]/${step}` as const, params: { id } };
}

/**
 * Where a draft carries on: the date and times while it has none, then the
 * review, which shows every other step with a way to change it. A draft
 * keeps no record of the steps after the times, which all have a choice
 * made already (spec 3, 3.8.4; spec 16, 3.6).
 */
export function resumeStep(trip: Pick<MyTrip, "departsAt">): StepName {
  return trip.departsAt === null ? "time" : "review";
}

/**
 * After saving a step: on to the next one, or back to the review when the
 * driver came from there to change one thing.
 */
export function goOn(id: string, next: StepName, fromReview: boolean): void {
  if (!fromReview) {
    router.push(stepHref(id, next));
  } else if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(stepHref(id, "review"));
  }
}

/** An Edit link on the review opens a step with this, to come back after. */
export const fromReviewParams = (id: string, step: StepName) => ({
  ...stepHref(id, step),
  params: { id, from: "review" },
});
