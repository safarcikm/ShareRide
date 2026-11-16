import { groupPlaces } from "./group-places";
import { bsi, hof, thorlakshofn } from "@/testing/meeting-points";

describe("groupPlaces", () => {
  it("puts towns and areas apart from meeting points, keeping the API's order in each", () => {
    const town = { kind: "place" as const, place: thorlakshofn };
    const area = { kind: "place" as const, place: { ...thorlakshofn, id: "area" } };
    const first = { kind: "meetingPoint" as const, meetingPoint: hof };
    const second = { kind: "meetingPoint" as const, meetingPoint: bsi };
    expect(groupPlaces([first, town, second, area])).toEqual({
      places: [town, area],
      meetingPoints: [first, second],
    });
  });
});
