import { adminMeRoute, adminSetupOptionsRoute } from "@shareride/contracts";
import { schema } from "@shareride/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, testAdminOrigin, type TestApi } from "../../testing.ts";
import { runOperatorCommand } from "./operator-command.ts";
import { createPasskeyService } from "./passkeys.ts";
import { createOperatorSessionService } from "./sessions.ts";

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.close();
});

async function run(...args: string[]) {
  return runWith(testAdminOrigin, ...args);
}

async function runWith(adminOrigin: string | undefined, ...args: string[]) {
  const lines: string[] = [];
  const sessions = createOperatorSessionService(api.features);
  const exitCode = await runOperatorCommand(args, {
    db: api.connection.db,
    adminOrigin,
    sessions,
    passkeys: createPasskeyService({ ...api.features, sessions, adminOrigin: testAdminOrigin }),
    write: (line) => lines.push(line),
  });
  return { exitCode, output: lines.join("\n") };
}

async function rolesOf(userId: string) {
  const [user] = await api.connection.db
    .select({ roles: schema.users.roles })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return user?.roles;
}

async function auditActions(userId: string) {
  const { rows } = await api.connection.pool.query<{ action: string; session: string | null }>(
    `SELECT action, operator_session_id AS session FROM audit_log
     WHERE subject_type = 'user' AND subject_id = $1 ORDER BY created_at, id`,
    [userId],
  );
  return rows;
}

describe("the operator command (ADR 0028)", () => {
  it("gives the role by phone number and prints a setup link", async () => {
    const phone = api.newPhoneNumber();
    const { userId } = await api.signIn(phone);
    const { exitCode, output } = await run("add", phone);
    expect(exitCode).toBe(0);
    expect(output).toMatch(/https:\/\/shareride\.test\/admin\/setup#sr_ol_[A-Za-z0-9_-]+/);
    expect(await rolesOf(userId)).toContain("operator");
    expect(await auditActions(userId)).toEqual([{ action: "operator.role_given", session: null }]);
  });

  it("gives the role by user ID, once, and a new link replaces the old one", async () => {
    const { userId } = await api.signIn(api.newPhoneNumber());
    expect((await run("add", userId)).exitCode).toBe(0);
    const second = await run("add", userId);
    expect(second.exitCode).toBe(0);
    expect(await rolesOf(userId)).toEqual(["operator"]);
    const links = await api.connection.db
      .select()
      .from(schema.operatorSetupLinks)
      .where(eq(schema.operatorSetupLinks.userId, userId));
    expect(links).toHaveLength(1);
    expect((await auditActions(userId)).map((entry) => entry.action)).toEqual([
      "operator.role_given",
    ]);
  });

  it("refuses a suspended account", async () => {
    const { userId } = await api.signIn(api.newPhoneNumber());
    await api.connection.db
      .update(schema.users)
      .set({ status: "suspended" })
      .where(eq(schema.users.id, userId));
    const { exitCode, output } = await run("add", userId);
    expect(exitCode).toBe(1);
    expect(output).toContain("suspended");
    expect(await rolesOf(userId)).not.toContain("operator");
  });

  it("says when no account matches", async () => {
    const { exitCode, output } = await run("add", "00000000-0000-7000-8000-000000000000");
    expect(exitCode).toBe(1);
    expect(output).toContain("No account");
    expect((await run("add", "not a number")).exitCode).toBe(1);
  });

  it("removes the role, ends console sessions and deletes passkeys", async () => {
    const { userId, cookie } = await api.signInOperator();
    await api.connection.db.insert(schema.operatorPasskeys).values({
      userId,
      credentialId: `credential-${userId}`,
      publicKey: "public-key",
      backedUp: false,
      name: "Laptop",
    });
    const { exitCode } = await run("remove", userId);
    expect(exitCode).toBe(0);
    expect(await rolesOf(userId)).not.toContain("operator");
    const me = await api.request(adminMeRoute.path, { headers: { cookie } });
    expect(me.status).toBe(401);
    const [session] = await api.connection.db
      .select({ endReason: schema.operatorSessions.endReason })
      .from(schema.operatorSessions)
      .where(eq(schema.operatorSessions.userId, userId));
    expect(session?.endReason).toBe("role_removed");
    const passkeys = await api.connection.db
      .select()
      .from(schema.operatorPasskeys)
      .where(eq(schema.operatorPasskeys.userId, userId));
    expect(passkeys).toEqual([]);
    expect((await auditActions(userId)).map((entry) => entry.action)).toContain(
      "operator.role_removed",
    );
  });

  it("deletes setup links when it removes the role", async () => {
    const { userId } = await api.signIn(api.newPhoneNumber());
    const { output } = await run("add", userId);
    const token = /#(sr_ol_[A-Za-z0-9_-]+)/.exec(output)?.[1] ?? "";
    await run("remove", userId);
    const links = await api.connection.db
      .select()
      .from(schema.operatorSetupLinks)
      .where(eq(schema.operatorSetupLinks.userId, userId));
    expect(links).toEqual([]);
    const options = await api.request(adminSetupOptionsRoute.path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(options.status).toBe(400);
  });

  it("needs ADMIN_ORIGIN only to add an operator", async () => {
    const { userId } = await api.signIn(api.newPhoneNumber());
    const added = await runWith(undefined, "add", userId);
    expect(added).toMatchObject({ exitCode: 1 });
    expect(added.output).toContain("ADMIN_ORIGIN");
    expect((await runWith(undefined, "list")).exitCode).toBe(0);
    await run("add", userId);
    expect((await runWith(undefined, "remove", userId)).exitCode).toBe(0);
  });

  it("says when the account is not an operator", async () => {
    const { userId } = await api.signIn(api.newPhoneNumber());
    const { exitCode, output } = await run("remove", userId);
    expect(exitCode).toBe(1);
    expect(output).toContain("not an operator");
  });

  it("lists operators without their phone numbers", async () => {
    const phone = api.newPhoneNumber();
    const { userId } = await api.signIn(phone);
    await run("add", userId);
    const { exitCode, output } = await run("list");
    expect(exitCode).toBe(0);
    expect(output).toContain(userId);
    expect(output).toContain("0 passkeys");
    expect(output).not.toContain(phone);
  });

  it("explains how to use it", async () => {
    for (const args of [[], ["add"], ["rename", "x"]]) {
      const { exitCode, output } = await run(...args);
      expect(exitCode).toBe(2);
      expect(output).toContain("Usage");
    }
  });
});
