import { describe, expect, it } from "vitest";
import { activationChecklist, readyToActivate, type ActivationPoint } from "./activation.ts";

/** A made-up draft with everything R2.3 asks for. */
const ready: ActivationPoint = {
  nameIs: "Áningarstaður við Laxá",
  region: "south",
  municipality: "Árborg",
  type: "rest-area",
  whereToStandIs: "Við skiltið.",
  whereToStandEn: "By the sign.",
  amenitiesReviewedOn: "2026-11-16",
  seasonReviewedOn: "2026-11-16",
  lastCheckedOn: "2026-11-15",
};
const photo = { descriptionIs: "Skiltið.", descriptionEn: "The sign." };

const missing = (point: ActivationPoint, photos = [photo], connected = true) =>
  activationChecklist(point, photos, { connected })
    .filter((check) => !check.done)
    .map((check) => check.item);

describe("activationChecklist (R2.3)", () => {
  it("lists every item, each done for a point that has it all", () => {
    const list = activationChecklist(ready, [photo], { connected: true });
    expect(list.map((check) => check.item)).toEqual([
      "details",
      "whereToStand",
      "photos",
      "amenities",
      "season",
      "confirmed",
      "legs",
    ]);
    expect(list.every((check) => check.done)).toBe(true);
    expect(readyToActivate(list)).toBe(true);
  });

  it("needs where to stand in both languages", () => {
    expect(missing({ ...ready, whereToStandEn: null })).toEqual(["whereToStand"]);
    expect(missing({ ...ready, whereToStandIs: " " })).toEqual(["whereToStand"]);
  });

  it("needs a photo with descriptions in both languages", () => {
    expect(missing(ready, [])).toEqual(["photos"]);
    expect(missing(ready, [{ ...photo, descriptionEn: "" }])).toEqual(["photos"]);
    expect(missing(ready, [{ ...photo, descriptionEn: "" }, photo])).toEqual([]);
  });

  it("needs the amenities and the season reviewed, and the date the operator confirmed it", () => {
    expect(
      missing({ ...ready, amenitiesReviewedOn: null, seasonReviewedOn: null, lastCheckedOn: null }),
    ).toEqual(["amenities", "season", "confirmed"]);
  });

  it("needs a road that reaches a point in service, so its legs can be computed", () => {
    expect(missing(ready, [photo], false)).toEqual(["legs"]);
  });

  it("needs the name, type, region and municipality", () => {
    expect(missing({ ...ready, nameIs: "", municipality: "" })).toEqual(["details"]);
    const list = activationChecklist({ ...ready, nameIs: "" }, [photo], { connected: true });
    expect(readyToActivate(list)).toBe(false);
  });
});
