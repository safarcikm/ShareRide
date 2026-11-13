import { describe, expect, it } from "vitest";
import { canUseMemberFeatures, missingSteps } from "./onboarding.ts";

const t0 = new Date("2026-11-13T12:00:00Z");
const current = [
  { type: "terms", version: 2 },
  { type: "community-rules", version: 1 },
] as const;

const complete = {
  phoneVerifiedAt: t0,
  ageConfirmedAt: t0,
  firstName: "Test",
  acceptances: [
    { type: "terms", version: 2 },
    { type: "community-rules", version: 1 },
  ],
};

describe("missingSteps (spec 1, sections 3.2 to 3.5)", () => {
  it("is empty for a finished account", () => {
    expect(missingSteps(complete, current)).toEqual([]);
  });

  it("asks for the terms and age when either is missing", () => {
    expect(missingSteps({ ...complete, ageConfirmedAt: null }, current)).toEqual(["legal"]);
    expect(missingSteps({ ...complete, acceptances: [] }, current)).toEqual(["legal"]);
  });

  it("asks again after a material change to a document (section 3.4)", () => {
    const accepted = {
      ...complete,
      acceptances: [
        { type: "terms", version: 1 },
        { type: "community-rules", version: 1 },
      ],
    };
    expect(missingSteps(accepted, current)).toEqual(["legal"]);
  });

  it("accepts a newer acceptance than the current material version", () => {
    const accepted = {
      ...complete,
      acceptances: [
        { type: "terms", version: 3 },
        { type: "community-rules", version: 1 },
      ],
    };
    expect(missingSteps(accepted, current)).toEqual([]);
  });

  it("asks for a first name when there is none", () => {
    expect(missingSteps({ ...complete, firstName: null }, current)).toEqual(["profile"]);
  });

  it("asks for the phone number first, for Apple and Google accounts later", () => {
    expect(missingSteps({ ...complete, phoneVerifiedAt: null }, current)).toEqual(["phone"]);
  });
});

describe("canUseMemberFeatures (rules R1.6 and R1.7)", () => {
  it("allows booking, posting and chat only with a verified phone, age and current terms", () => {
    expect(canUseMemberFeatures(complete, current)).toBe(true);
    expect(canUseMemberFeatures({ ...complete, phoneVerifiedAt: null }, current)).toBe(false);
    expect(canUseMemberFeatures({ ...complete, ageConfirmedAt: null }, current)).toBe(false);
    expect(canUseMemberFeatures({ ...complete, acceptances: [] }, current)).toBe(false);
  });

  it("does not need a first name, which is required at sign-up anyway", () => {
    expect(canUseMemberFeatures({ ...complete, firstName: null }, current)).toBe(true);
  });
});
