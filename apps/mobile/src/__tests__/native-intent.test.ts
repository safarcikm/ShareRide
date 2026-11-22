import { redirectSystemPath } from "@/app/+native-intent";

describe("redirectSystemPath", () => {
  it("opens the return screen without the ticket", () => {
    const ticket = `sr_pt_${"t".repeat(43)}`;
    for (const path of [
      `shareride://sign-in/return#ticket=${ticket}`,
      "shareride://sign-in/return#error=cancelled",
      `/sign-in/return#ticket=${ticket}`,
      `sign-in/return?x=1#ticket=${ticket}`,
    ]) {
      expect(redirectSystemPath({ path, initial: false })).toBe("/sign-in/return");
    }
  });

  it("leaves other addresses as they came", () => {
    for (const path of ["shareride://trips/1", "/sign-in", "/invite/BETA2345", "/sign-in/code"]) {
      expect(redirectSystemPath({ path, initial: true })).toBe(path);
    }
  });
});
