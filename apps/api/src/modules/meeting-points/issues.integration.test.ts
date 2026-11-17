import { reportMeetingPointIssueRoute } from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId, seedSampleMeetingPoints } from "@shareride/db/seed";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import { collectExport } from "../privacy/export-data.ts";

let api: TestApi;
const borgarnes = sampleId("point:borgarnes");

beforeAll(async () => {
  api = await startTestApi();
  await seedSampleMeetingPoints(api.connection.db, api.now());
  const base = {
    location: { latitude: 64.14, longitude: -21.93 },
    region: "capital",
    municipality: "Reykjavík",
    type: "other",
  } as const;
  await api.connection.db.insert(schema.meetingPoints).values([
    { ...base, id: sampleId("test:draft"), nameIs: "Drög", status: "draft", searchText: "drog" },
    {
      ...base,
      id: sampleId("test:retired"),
      nameIs: "Hætt",
      status: "retired",
      searchText: "haett",
    },
  ]);
});

afterAll(async () => {
  await api.close();
});

async function report(
  accessToken: string | null,
  id: string,
  body: { reason: string; note: string } = { reason: "unsafe", note: "" },
) {
  return api.client.call(reportMeetingPointIssueRoute, {
    params: { id },
    body: body as { reason: "unsafe"; note: string },
    ...(accessToken === null ? {} : { accessToken }),
  });
}

async function issuesOf(userId: string) {
  return api.connection.db
    .select()
    .from(schema.meetingPointIssues)
    .where(eq(schema.meetingPointIssues.reporterId, userId));
}

describe("POST /v1/meeting-points/{id}/issues", () => {
  it("needs an account, which has a verified phone number (R2.8)", async () => {
    const result = await report(null, borgarnes);
    expect(result.ok ? 0 : result.status).toBe(401);
  });

  it("puts the report in the operator's queue, linked to the person", async () => {
    const { accessToken, userId } = await api.signIn(api.newPhoneNumber());
    const result = await report(accessToken, borgarnes, {
      reason: "wrong_location",
      note: "  Skiltið er hinum megin við götuna. \n",
    });
    expect(result.ok ? result.status : result.status).toBe(204);
    expect(await issuesOf(userId)).toMatchObject([
      {
        meetingPointId: borgarnes,
        reason: "wrong_location",
        note: "Skiltið er hinum megin við götuna.",
        status: "open",
        resolutionNote: null,
        resolvedAt: null,
      },
    ]);
  });

  it("is only for points people can see", async () => {
    const { accessToken } = await api.signIn(api.newPhoneNumber());
    for (const id of [sampleId("test:draft"), sampleId("test:retired"), sampleId("test:none")]) {
      const result = await report(accessToken, id);
      expect(result.ok ? null : [result.status, result.error.code]).toEqual([404, "not_found"]);
    }
  });

  it("refuses a note over 300 characters or a reason it does not know", async () => {
    const { accessToken, userId } = await api.signIn(api.newPhoneNumber());
    const long = await report(accessToken, borgarnes, { reason: "other", note: "x".repeat(301) });
    expect(long.ok ? null : [long.status, long.error.details]).toEqual([
      400,
      [{ path: "note", issue: "too_long" }],
    ]);
    const unknown = await report(accessToken, borgarnes, { reason: "dirty", note: "" });
    expect(unknown.ok ? null : unknown.status).toBe(400);
    expect(await issuesOf(userId)).toEqual([]);
  });

  it("takes 5 a day from one person, then says when the next can be sent", async () => {
    const phone = api.newPhoneNumber();
    const { accessToken, userId } = await api.signIn(phone);
    for (let sent = 0; sent < 5; sent += 1) {
      const result = await report(accessToken, borgarnes);
      expect(result.ok).toBe(true);
      api.advance(60);
    }
    const sixth = await report(accessToken, borgarnes);
    expect(sixth.ok ? null : [sixth.status, sixth.error.code]).toEqual([429, "too_many_reports"]);
    expect(sixth.ok ? null : sixth.error.retryAfterSeconds).toBe(24 * 3_600 - 5 * 60);
    expect(await issuesOf(userId)).toHaveLength(5);

    // The first falls out of the last 24 hours; a new sign-in, as the token has expired.
    api.advance(24 * 3_600 - 5 * 60);
    expect((await report((await api.signIn(phone)).accessToken, borgarnes)).ok).toBe(true);
  });

  it("is in the person's Download my data while it is open", async () => {
    const { accessToken, userId } = await api.signIn(api.newPhoneNumber());
    await report(accessToken, borgarnes, { reason: "closed_or_moved", note: "Lokað í vetur." });
    const data = await collectExport(api.connection.db, userId, api.now());
    expect(data.sections.meeting_point_reports).toEqual([
      {
        place: "N1 Borgarnesi",
        problem: "closed_or_moved",
        note: "Lokað í vetur.",
        sentAt: api.now().toISOString(),
      },
    ]);
  });
});
