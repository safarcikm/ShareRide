import { adminMeRoute, adminSignOutRoute, getMeRoute } from "@shareride/contracts";
import { schema } from "@shareride/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import { cleanUpOperatorSessions } from "./clean-up.ts";
import { recordAudit } from "./audit.ts";
import { createOperatorSessionService } from "./sessions.ts";

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.close();
});

const me = (cookie?: string) =>
  api.request(adminMeRoute.path, cookie === undefined ? {} : { headers: { cookie } });

const signOut = (cookie: string) =>
  api.request(adminSignOutRoute.path, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", "user-agent": "Firefox on Linux" },
    body: "{}",
  });

async function endReasonOf(sessionId: string) {
  const [session] = await api.connection.db
    .select({ endReason: schema.operatorSessions.endReason })
    .from(schema.operatorSessions)
    .where(eq(schema.operatorSessions.id, sessionId));
  return session?.endReason;
}

async function auditEntries(action: string) {
  const { rows } = await api.connection.pool.query<Record<string, unknown>>(
    "SELECT * FROM audit_log WHERE action = $1 ORDER BY created_at",
    [action],
  );
  return rows;
}

describe("the console's guard (ADR 0028)", () => {
  it("refuses a request without a console session", async () => {
    const response = await me();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "operator_unauthenticated" } });
  });

  it("refuses the app's access token, even an operator's", async () => {
    const { userId, cookie } = await api.signInOperator();
    const { accessToken } = await api.signIn(
      (
        await api.connection.db
          .select({ phone: schema.users.phoneE164 })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
      )[0]?.phone ?? "",
    );
    const response = await api.request(adminMeRoute.path, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.status).toBe(401);
    expect((await me(cookie)).status).toBe(200);
  });

  it("never lets the console's cookie into the app's API", async () => {
    const { cookie } = await api.signInOperator();
    expect(await api.request(getMeRoute.path, { headers: { cookie } })).toMatchObject({
      status: 401,
    });
  });

  it("refuses a token that is not a session", async () => {
    const response = await me("sr_operator=sr_os_not-a-real-token");
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toContain("sr_operator=;");
  });

  it("guards every path under /admin/v1, even one without a route", async () => {
    expect((await api.request("/admin/v1/no-such-page")).status).toBe(401);
    expect((await api.request("/admin/v1/auth/no-such-page")).status).toBe(401);
    expect((await api.request("/admin/v1")).status).toBe(401);
    expect((await api.request(adminMeRoute.path, { method: "HEAD" })).status).toBe(401);
    const { cookie } = await api.signInOperator();
    const known = await api.request("/admin/v1/no-such-page", { headers: { cookie } });
    expect(known.status).toBe(404);
    expect(await known.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("answers who is signed in and when the session ends", async () => {
    const { userId, cookie } = await api.signInOperator();
    const response = await me(cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId,
      firstName: null,
      locale: "en",
      sessionEndsAt: new Date(api.now().getTime() + 30 * 60_000).toISOString(),
    });
  });

  it("stores the session token only as a hash", async () => {
    const { cookie } = await api.signInOperator();
    const { rows } = await api.connection.pool.query("SELECT * FROM operator_sessions");
    expect(JSON.stringify(rows)).not.toContain(cookie.split("=")[1]?.slice(6));
  });
});

describe("console sessions", () => {
  it("end after 30 minutes without use", async () => {
    const { cookie, sessionId } = await api.signInOperator();
    api.advance(29 * 60);
    expect((await me(cookie)).status).toBe(200);
    api.advance(29 * 60);
    expect((await me(cookie)).status).toBe(200);
    api.advance(30 * 60);
    expect((await me(cookie)).status).toBe(401);
    // Ended for good: nothing brings it back.
    expect((await me(cookie)).status).toBe(401);
    expect(await endReasonOf(sessionId)).toBe("idle");
  });

  it("end 12 hours after sign-in, however much they are used", async () => {
    const { cookie, sessionId } = await api.signInOperator();
    for (let hour = 0; hour < 24; hour += 1) {
      api.advance(29 * 60);
      expect((await me(cookie)).status).toBe(200);
    }
    api.advance(29 * 60);
    expect((await me(cookie)).status).toBe(401);
    expect(await endReasonOf(sessionId)).toBe("expired");
  });

  it("end when the account loses the role", async () => {
    const { userId, cookie, sessionId } = await api.signInOperator();
    await api.connection.db
      .update(schema.users)
      .set({ roles: [] })
      .where(eq(schema.users.id, userId));
    expect((await me(cookie)).status).toBe(401);
    await api.connection.db
      .update(schema.users)
      .set({ roles: ["operator"] })
      .where(eq(schema.users.id, userId));
    expect((await me(cookie)).status).toBe(401);
    expect(await endReasonOf(sessionId)).toBe("role_removed");
  });

  it("end when the account is suspended", async () => {
    const { userId, cookie, sessionId } = await api.signInOperator();
    await api.connection.db
      .update(schema.users)
      .set({ status: "suspended" })
      .where(eq(schema.users.id, userId));
    expect((await me(cookie)).status).toBe(401);
    expect(await endReasonOf(sessionId)).toBe("suspended");
  });

  it("all end together when the role is taken away", async () => {
    const { userId, cookie } = await api.signInOperator();
    const second = await createOperatorSessionService(api.features).start({
      userId,
      device: "Phone",
    });
    const sessions = createOperatorSessionService(api.features);
    expect(await sessions.endAllOf(userId, "role_removed")).toBe(2);
    expect((await me(cookie)).status).toBe(401);
    expect((await me(`sr_operator=${second.token}`)).status).toBe(401);
    expect(await sessions.endAllOf(userId, "role_removed")).toBe(0);
  });

  it("end on sign-out, with an audit entry", async () => {
    const { userId, sessionId, cookie } = await api.signInOperator();
    const response = await signOut(cookie);
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("sr_operator=;");
    expect((await me(cookie)).status).toBe(401);
    const [entry] = (await auditEntries("operator.signed_out")).filter(
      (row) => row["operator_user_id"] === userId,
    );
    expect(entry).toMatchObject({
      operator_session_id: sessionId,
      subject_type: "operator_session",
      subject_id: sessionId,
      ip_address: api.ip,
      user_agent: "Firefox on Linux",
    });
  });

  it("are deleted 30 days after they end", async () => {
    const { sessionId, cookie } = await api.signInOperator();
    await signOut(cookie);
    const exists = async () =>
      (
        await api.connection.db
          .select()
          .from(schema.operatorSessions)
          .where(eq(schema.operatorSessions.id, sessionId))
      ).length === 1;
    await cleanUpOperatorSessions(
      api.connection.db,
      new Date(api.now().getTime() + 29 * 86_400_000),
    );
    expect(await exists()).toBe(true);
    await cleanUpOperatorSessions(
      api.connection.db,
      new Date(api.now().getTime() + 31 * 86_400_000),
    );
    expect(await exists()).toBe(false);
  });

  it("are deleted 30 days after they could last have worked, even if never ended", async () => {
    const { sessionId } = await api.signInOperator();
    const day = 86_400_000;
    const exists = async () =>
      (
        await api.connection.db
          .select()
          .from(schema.operatorSessions)
          .where(eq(schema.operatorSessions.id, sessionId))
      ).length === 1;
    const at = (ms: number) => new Date(api.now().getTime() + ms);
    await cleanUpOperatorSessions(api.connection.db, at(30 * day + 11 * 3600_000));
    expect(await exists()).toBe(true);
    await cleanUpOperatorSessions(api.connection.db, at(30 * day + 13 * 3600_000));
    expect(await exists()).toBe(false);
  });
});

describe("the audit log (spec 9, 3.8)", () => {
  const operator = { userId: "019a0000-0000-7000-8000-000000000001", sessionId: null };

  it("is saved with the change or not at all", async () => {
    await expect(
      api.connection.db.transaction(async (tx) => {
        await recordAudit(tx, { operator, action: "test.rolled_back", request: null });
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");
    expect(await auditEntries("test.rolled_back")).toEqual([]);
  });

  it("refuses an action name that is not dotted", async () => {
    await expect(
      recordAudit(api.connection.db, { operator, action: "Activated", request: null }),
    ).rejects.toThrow("not an audit action name");
  });

  it("cannot be changed, emptied or deleted while younger than 3 years", async () => {
    await recordAudit(api.connection.db, {
      operator,
      action: "test.kept",
      before: { status: "draft" },
      after: { status: "active" },
      request: null,
    });
    const { pool } = api.connection;
    await expect(pool.query("UPDATE audit_log SET action = 'test.changed'")).rejects.toThrow(
      "append-only",
    );
    await expect(pool.query("DELETE FROM audit_log WHERE action = 'test.kept'")).rejects.toThrow(
      "append-only",
    );
    await expect(pool.query("TRUNCATE audit_log")).rejects.toThrow("append-only");
    expect(await auditEntries("test.kept")).toMatchObject([
      { before: { status: "draft" }, after: { status: "active" } },
    ]);
  });

  it("takes the database's time, so no entry can be backdated", async () => {
    await api.connection.pool.query(
      `INSERT INTO audit_log (operator_user_id, action, created_at, updated_at)
       VALUES ($1, 'test.backdated', now() - interval '4 years', now() - interval '4 years')`,
      [operator.userId],
    );
    const [entry] = await auditEntries("test.backdated");
    expect(Date.now() - (entry?.["created_at"] as Date).getTime()).toBeLessThan(60_000);
    await expect(
      api.connection.pool.query("DELETE FROM audit_log WHERE action = 'test.backdated'"),
    ).rejects.toThrow("append-only");
  });

  it("lets retention delete entries older than 3 years, but never change them", async () => {
    const client = await api.connection.pool.connect();
    try {
      // Only a test can write an old entry: it turns the stamp off in a transaction.
      await client.query("BEGIN");
      await client.query("ALTER TABLE audit_log DISABLE TRIGGER audit_log_stamp");
      await client.query(
        `INSERT INTO audit_log (operator_user_id, action, created_at, updated_at)
         VALUES ($1, 'test.old', now() - interval '3 years 2 days', now() - interval '3 years 2 days')`,
        [operator.userId],
      );
      await client.query("ALTER TABLE audit_log ENABLE TRIGGER audit_log_stamp");
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    const { pool } = api.connection;
    await expect(
      pool.query("UPDATE audit_log SET action = 'test.changed' WHERE action = 'test.old'"),
    ).rejects.toThrow("append-only");
    await pool.query("DELETE FROM audit_log WHERE action = 'test.old'");
    expect(await auditEntries("test.old")).toEqual([]);
  });
});
