import { describe, expect, it } from "vitest";
import { auditLogPeriod, changedFields, isAuditAction } from "./audit.ts";

describe("isAuditAction", () => {
  it("takes a dotted name of lower-case words", () => {
    expect(isAuditAction("meeting_point.activated")).toBe(true);
    expect(isAuditAction("operator.passkey.added")).toBe(true);
  });

  it("refuses a name without a dot, with capitals or spaces", () => {
    expect(isAuditAction("activated")).toBe(false);
    expect(isAuditAction("MeetingPoint.activated")).toBe(false);
    expect(isAuditAction("meeting point.activated")).toBe(false);
    expect(isAuditAction("meeting_point.")).toBe(false);
  });
});

describe("changedFields", () => {
  it("keeps only the fields whose value changed", () => {
    expect(
      changedFields(
        { nameIs: "Mjódd", status: "draft", aliases: ["BSÍ"] },
        { nameIs: "Mjódd", status: "active", aliases: ["BSÍ"] },
      ),
    ).toEqual({ before: { status: "draft" }, after: { status: "active" } });
  });

  it("compares lists and objects by value", () => {
    expect(
      changedFields(
        { aliases: ["KEF"], location: { latitude: 64, longitude: -22 } },
        { aliases: ["KEF", "Keflavík"], location: { latitude: 64, longitude: -22 } },
      ),
    ).toEqual({ before: { aliases: ["KEF"] }, after: { aliases: ["KEF", "Keflavík"] } });
  });

  it("records a field added or removed as null on the other side", () => {
    expect(changedFields({ nameEn: "Hub" }, { pausedUntil: "2026-11-20" })).toEqual({
      before: { nameEn: "Hub", pausedUntil: null },
      after: { nameEn: null, pausedUntil: "2026-11-20" },
    });
  });

  it("is empty when nothing changed", () => {
    expect(changedFields({ status: "active" }, { status: "active" })).toEqual({
      before: {},
      after: {},
    });
  });
});

describe("auditLogPeriod", () => {
  it("covers whole days in Iceland, the last one to its end", () => {
    expect(auditLogPeriod({ from: "2026-11-01", to: "2026-11-16" })).toEqual({
      from: new Date("2026-11-01T00:00:00Z"),
      until: new Date("2026-11-17T00:00:00Z"),
    });
  });

  it("leaves out a side that is not given", () => {
    expect(auditLogPeriod({ from: "2026-12-31" })).toEqual({
      from: new Date("2026-12-31T00:00:00Z"),
    });
    expect(auditLogPeriod({ to: "2026-12-31" })).toEqual({
      until: new Date("2027-01-01T00:00:00Z"),
    });
    expect(auditLogPeriod({})).toEqual({});
  });
});
