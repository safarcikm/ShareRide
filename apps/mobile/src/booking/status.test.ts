import { northBooking } from "@/testing/bookings";
import { statusTag } from "./status";

// What a status tag's colour says (spec 31, 3.2, rule 6, and decision 10):
// blue is waiting, amber is yours and now, moss is good news, red is a
// problem, and a quiet tag asks nothing of anyone.
describe("statusTag", () => {
  it.each([
    ["requested", "info"],
    ["accepted", "warning"],
    ["confirmed", "positive"],
    ["completed", "positive"],
    ["declined", "plain"],
    ["expired", "plain"],
    ["cancelled", "plain"],
    ["no_show", "problem"],
  ] as const)("shows %s as a %s tag", (status, kind) => {
    expect(statusTag(northBooking({ status }))).toBe(kind);
  });

  it("shows a request its passenger withdrew as a quiet tag", () => {
    expect(statusTag(northBooking({ status: "cancelled", withdrawn: true }))).toBe("plain");
  });
});
