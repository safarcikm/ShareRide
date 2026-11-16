import { randomUUID } from "node:crypto";
import { adminAuditLogRoute, type AuditEntry } from "@shareride/contracts";
import { schema } from "@shareride/db";
import { inIceland } from "@shareride/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import { recordAudit } from "./audit.ts";

let api: TestApi;
let cookie: string;
let operator: { userId: string; sessionId: string };

beforeAll(async () => {
  api = await startTestApi();
  const signedIn = await api.signInOperator();
  cookie = signedIn.cookie;
  operator = { userId: signedIn.userId, sessionId: signedIn.sessionId };
  await api.connection.db
    .update(schema.users)
    .set({ firstName: "Ari" })
    .where(eq(schema.users.id, operator.userId));
});

afterAll(async () => {
  await api.close();
});

type Page = { entries: AuditEntry[]; hasMore: boolean };

async function auditLog(query: Record<string, string>, withCookie = cookie) {
  const response = await api.request(
    `${adminAuditLogRoute.path}?${new URLSearchParams(query).toString()}`,
    { headers: { cookie: withCookie } },
  );
  return { status: response.status, body: (await response.json()) as Page };
}

/** Entries about one made-up record, so each test sees only its own. */
async function record(
  subjectId: string,
  actions: readonly string[],
  by: { userId: string; sessionId: string | null } = operator,
) {
  for (const action of actions) {
    await recordAudit(api.connection.db, {
      operator: by,
      action,
      subjectType: "test_record",
      subjectId,
      before: { name: "Old" },
      after: { name: "New" },
      request: { ipAddress: "192.0.2.10", userAgent: "Test browser" },
    });
  }
}

const today = () => {
  const { year, month, day } = inIceland(new Date());
  return `${String(year)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

describe("the audit log page's API (spec 9, 3.8)", () => {
  it("needs a console session", async () => {
    const { status } = await auditLog({}, "sr_operator=sr_os_not-a-session");
    expect(status).toBe(401);
  });

  it("lists entries newest first with who, what, on which record and from where", async () => {
    const subjectId = randomUUID();
    await record(subjectId, ["test_record.created", "test_record.renamed"]);
    await record(subjectId, ["test_record.checked"], { userId: operator.userId, sessionId: null });

    const { status, body } = await auditLog({ subjectType: "test_record", subjectId });
    expect(status).toBe(200);
    expect(body.hasMore).toBe(false);
    expect(body.entries.map((entry) => entry.action)).toEqual([
      "test_record.checked",
      "test_record.renamed",
      "test_record.created",
    ]);
    expect(body.entries[0]).toMatchObject({
      operator: { userId: operator.userId, firstName: "Ari" },
      byCommand: true,
      subjectType: "test_record",
      subjectId,
    });
    expect(body.entries[1]).toMatchObject({
      byCommand: false,
      before: { name: "Old" },
      after: { name: "New" },
      ipAddress: "192.0.2.10",
      userAgent: "Test browser",
    });
  });

  it("pages back 50 entries at a time", async () => {
    const subjectId = randomUUID();
    await record(
      subjectId,
      Array.from(
        { length: 53 },
        (_, index) => `test_record.step_${String.fromCharCode(97 + (index % 26))}`,
      ),
    );
    const first = await auditLog({ subjectId });
    expect(first.body.entries).toHaveLength(50);
    expect(first.body.hasMore).toBe(true);

    const last = first.body.entries.at(-1)?.id ?? "";
    const second = await auditLog({ subjectId, before: last });
    expect(second.body.entries).toHaveLength(3);
    expect(second.body.hasMore).toBe(false);
    const ids = [...first.body.entries, ...second.body.entries].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(53);
  });

  it("filters by the start of the action, the operator and the days", async () => {
    const subjectId = randomUUID();
    const other = await api.signInOperator();
    await record(subjectId, ["test_record.activated", "test_record.paused"]);
    await record(subjectId, ["test_audit.activated"], { userId: other.userId, sessionId: null });

    const actions = async (query: Record<string, string>) =>
      (await auditLog({ subjectId, ...query })).body.entries.map((entry) => entry.action);

    expect(await actions({ action: "test_record." })).toEqual([
      "test_record.paused",
      "test_record.activated",
    ]);
    expect(await actions({ action: "test_record.act" })).toEqual(["test_record.activated"]);
    // An underscore is a letter here, not a wildcard.
    expect(await actions({ action: "test_record_" })).toEqual([]);
    expect(await actions({ operatorUserId: other.userId })).toEqual(["test_audit.activated"]);
    expect(await actions({ from: today(), to: today() })).toHaveLength(3);
    expect(await actions({ to: "2020-01-01" })).toEqual([]);
    expect(await actions({ from: "2999-01-01" })).toEqual([]);
  });

  it("refuses days the wrong way round, and a page after an unknown entry", async () => {
    expect((await auditLog({ from: "2026-11-16", to: "2026-11-15" })).status).toBe(400);
    expect((await auditLog({ before: randomUUID() })).status).toBe(404);
  });

  it("has no way to change or delete an entry", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = await api.request(adminAuditLogRoute.path, {
        method,
        headers: { cookie, "content-type": "application/json" },
        body: "{}",
      });
      expect({ method, status: response.status }).toEqual({ method, status: 404 });
    }
  });
});
