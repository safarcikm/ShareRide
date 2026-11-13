import { describe, expect, it } from "vitest";
import { checkAcceptance, isAcceptableDocumentType } from "./legal.ts";

const current = [
  { type: "terms", version: 3 },
  { type: "community-rules", version: 2 },
];

describe("isAcceptableDocumentType", () => {
  it("accepts the Terms and the Community Rules", () => {
    expect(isAcceptableDocumentType("terms")).toBe(true);
    expect(isAcceptableDocumentType("community-rules")).toBe(true);
  });

  it("does not ask people to accept the Privacy Policy", () => {
    expect(isAcceptableDocumentType("privacy")).toBe(false);
  });
});

describe("checkAcceptance", () => {
  it("allows accepting the current versions", () => {
    expect(checkAcceptance([{ type: "terms", version: 3 }], current).ok).toBe(true);
  });

  it("refuses an older version, so people accept what they were shown last", () => {
    expect(checkAcceptance([{ type: "terms", version: 2 }], current)).toEqual({
      ok: false,
      error: { code: "legal_version_outdated", type: "terms" },
    });
  });

  it("refuses a version that does not exist yet", () => {
    expect(checkAcceptance([{ type: "community-rules", version: 9 }], current)).toEqual({
      ok: false,
      error: { code: "legal_version_outdated", type: "community-rules" },
    });
  });

  it("refuses a document that is not accepted, such as the Privacy Policy", () => {
    expect(checkAcceptance([{ type: "privacy", version: 1 }], current)).toEqual({
      ok: false,
      error: { code: "legal_document_not_acceptable", type: "privacy" },
    });
  });

  it("refuses the same document twice", () => {
    const twice = [
      { type: "terms", version: 3 },
      { type: "terms", version: 3 },
    ];
    expect(checkAcceptance(twice, current)).toEqual({
      ok: false,
      error: { code: "legal_document_not_acceptable", type: "terms" },
    });
  });
});
