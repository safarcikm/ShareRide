import type { AdminSettingChange, AdminSettings, Config } from "@shareride/contracts";
import { schema } from "@shareride/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app.ts";
import { createLogger } from "../../logger.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import { createSettingsService } from "./service.ts";

// The settings store (spec 10, 3.2; R10.1, R10.2, R10.8; ADR 0032;
// milestone 11, PR 2). One database for the whole file: the history cannot
// be emptied, so the tests follow each other, and each reads the version
// it starts from.

let api: TestApi;
let operator: { userId: string; cookie: string };
let member: { accessToken: string };

beforeAll(async () => {
  api = await startTestApi();
  operator = await api.signInOperator();
  member = await api.signIn(api.newPhoneNumber());
  // From here the closed beta's setting is the stored one, as on a server.
  api.useStoredInviteSetting();
});

afterAll(async () => {
  await api.close();
});

async function send(method: string, path: string, body?: unknown, cookie = operator.cookie) {
  const response = await api.request(path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as unknown, response };
}

const settings = async () => (await send("GET", "/admin/v1/settings")).body as AdminSettings;
const valueOf = (all: AdminSettings, key: string) =>
  all.settings.find((setting) => setting.key === key)?.value;
const change = (key: string, body: unknown) => send("PATCH", `/admin/v1/settings/${key}`, body);
const codeOf = (body: unknown) => (body as { error: { code: string } }).error.code;

describe("the console's settings", () => {
  it("are closed to everyone but a signed-in operator", async () => {
    for (const [method, path] of [
      ["GET", "/admin/v1/settings"],
      ["PATCH", "/admin/v1/settings/beta_max_testers"],
      ["GET", "/admin/v1/settings/history"],
    ] as const) {
      const bare = await send(method, path, method === "PATCH" ? {} : undefined, "");
      expect(bare.status).toBe(401);
      expect(codeOf(bare.body)).toBe("operator_unauthenticated");
      const withToken = await api.request(path, {
        method,
        headers: {
          authorization: `Bearer ${member.accessToken}`,
          "content-type": "application/json",
        },
        ...(method === "PATCH" ? { body: "{}" } : {}),
      });
      expect(withToken.status).toBe(401);
    }
  });

  it("start as the defaults, at version 0", async () => {
    const all = await settings();
    expect(all.version).toBe(0);
    // The six switches for emergencies come first (spec 10, 3.3).
    expect(all.settings.slice(0, 6)).toEqual(
      [
        "signups_open",
        "trips_open",
        "bookings_open",
        "sms_sending",
        "email_sending",
        "push_sending",
      ].map((key) => ({
        key,
        group: "switches",
        kind: "switch",
        unit: null,
        value: 1,
        default: 1,
        min: 0,
        max: 1,
        step: 1,
      })),
    );
    expect(all.settings.slice(6, 8)).toEqual([
      {
        key: "invite_code_required",
        group: "beta",
        kind: "switch",
        unit: null,
        value: 0,
        default: 0,
        min: 0,
        max: 1,
        step: 1,
      },
      {
        key: "beta_max_testers",
        group: "beta",
        kind: "number",
        unit: "people",
        value: 150,
        default: 150,
        min: 0,
        max: 1000,
        step: 1,
      },
    ]);
    // The price values and the seat limit are ADR 0032's, with its ranges.
    expect(
      all.settings.slice(8).map(({ key, unit, value, min, max, step }) => ({
        key,
        unit,
        value,
        min,
        max,
        step,
      })),
    ).toEqual([
      { key: "suggested_rate", unit: "kr_per_km", value: 15, min: 5, max: 30, step: 1 },
      { key: "reference_cost_per_km", unit: "kr_per_km", value: 150, min: 50, max: 150, step: 1 },
      { key: "price_step", unit: "kr", value: 100, min: 50, max: 500, step: 50 },
      { key: "price_level_step", unit: "percent", value: 10, min: 5, max: 25, step: 5 },
      { key: "max_capacity", unit: "seats", value: 8, min: 1, max: 8, step: 1 },
      { key: "booking_cutoff", unit: "minutes", value: 15, min: 0, max: 120, step: 1 },
      { key: "request_expiry", unit: "hours", value: 12, min: 1, max: 48, step: 1 },
      { key: "payment_window", unit: "minutes", value: 30, min: 10, max: 120, step: 1 },
      { key: "pay_in_person", unit: null, value: 0, min: 0, max: 1, step: 1 },
      { key: "free_cancellation_until", unit: "minutes", value: 15, min: 0, max: 120, step: 1 },
      { key: "major_time_change", unit: "minutes", value: 30, min: 10, max: 120, step: 1 },
      { key: "max_time_change", unit: "minutes", value: 120, min: 30, max: 360, step: 1 },
      {
        key: "reliability_cancellation_window",
        unit: "hours",
        value: 24,
        min: 0,
        max: 72,
        step: 1,
      },
      { key: "no_show_wait", unit: "minutes", value: 10, min: 5, max: 30, step: 1 },
      { key: "trip_completion_delay", unit: "hours", value: 2, min: 1, max: 12, step: 1 },
      { key: "reliability_period", unit: "months", value: 12, min: 3, max: 24, step: 1 },
      { key: "reliability_min_count", unit: "records", value: 5, min: 1, max: 20, step: 1 },
      { key: "reliability_watch_level", unit: "percent", value: 80, min: 50, max: 95, step: 1 },
    ]);
  });

  it("change with a reason, to the next version, with an audit entry (R10.2, R10.8)", async () => {
    const changed = await change("beta_max_testers", {
      value: 120,
      reason: "  Akranes waits a week  ",
      version: 0,
    });
    expect(changed.status).toBe(200);
    const all = changed.body as AdminSettings;
    expect(all.version).toBe(1);
    expect(valueOf(all, "beta_max_testers")).toBe(120);
    expect(await settings()).toEqual(all);

    const entries = await api.connection.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "setting.changed"));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      operatorUserId: operator.userId,
      subjectType: "setting",
      subjectId: "beta_max_testers",
      before: { value: 150 },
      after: { value: 120, version: 1, reason: "Akranes waits a week" },
    });
  });

  it("refuse a change without a reason, out of range, off its step or unchanged (R10.1)", async () => {
    const { version } = await settings();
    const refused = async (body: object, key = "beta_max_testers") => {
      const answer = await change(key, { version, ...body });
      return [answer.status, codeOf(answer.body), answer.body] as const;
    };

    const noReason = await refused({ value: 130, reason: " " });
    expect(noReason.slice(0, 2)).toEqual([400, "validation_failed"]);
    expect(noReason[2]).toMatchObject({
      error: { details: [{ path: "reason", issue: "missing" }] },
    });
    const longReason = await refused({ value: 130, reason: "a".repeat(501) });
    expect(longReason[2]).toMatchObject({
      error: { details: [{ path: "reason", issue: "too_long" }] },
    });
    const tooHigh = await refused({ value: 1001, reason: "More" });
    expect(tooHigh.slice(0, 2)).toEqual([400, "validation_failed"]);
    expect(tooHigh[2]).toMatchObject({
      error: { details: [{ path: "value", issue: "out_of_range" }] },
    });
    const half = await refused({ value: 130.5, reason: "Half a person" });
    expect(half[2]).toMatchObject({ error: { details: [{ path: "value", issue: "not_a_step" }] } });
    expect((await refused({ value: 120, reason: "Again" })).slice(0, 2)).toEqual([
      409,
      "unchanged",
    ]);
    expect((await refused({ value: 1, reason: "Why" }, "no_such_setting")).slice(0, 2)).toEqual([
      404,
      "not_found",
    ]);
    expect((await settings()).version).toBe(version);
  });

  it("refuse a change made on values the console did not see", async () => {
    const { version } = await settings();
    const stale = await change("invite_code_required", {
      value: 1,
      reason: "Invited people only",
      version: version - 1,
    });
    expect([stale.status, codeOf(stale.body)]).toEqual([409, "settings_changed"]);
    expect(valueOf(await settings(), "invite_code_required")).toBe(0);
  });

  it("give two changes made at the same moment one version each, or refuse the second", async () => {
    const { version } = await settings();
    const answers = await Promise.all([
      change("beta_max_testers", { value: 140, reason: "One", version }),
      change("invite_code_required", { value: 1, reason: "Two", version }),
    ]);
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
    const all = await settings();
    expect(all.version).toBe(version + 1);
    const rows = await api.connection.db.select().from(schema.settingChanges);
    expect(rows.map((row) => row.version).sort()).toEqual(
      Array.from({ length: version + 1 }, (_, index) => index + 1),
    );
  });

  it("list their history, newest first, with who and why", async () => {
    const { version } = await settings();
    const history = (await send("GET", "/admin/v1/settings/history")).body as {
      changes: AdminSettingChange[];
      next: number | null;
    };
    expect(history.next).toBeNull();
    expect(history.changes.map((entry) => entry.version)).toEqual(
      Array.from({ length: version }, (_, index) => version - index),
    );
    expect(history.changes.at(-1)).toEqual({
      version: 1,
      key: "beta_max_testers",
      oldValue: 150,
      newValue: 120,
      reason: "Akranes waits a week",
      changedBy: { userId: operator.userId, firstName: null },
      changedAt: api.now().toISOString(),
    });
    const older = (await send("GET", "/admin/v1/settings/history?before=2")).body as {
      changes: AdminSettingChange[];
    };
    expect(older.changes.map((entry) => entry.version)).toEqual([1]);
  });

  it("keep a history the database lets nobody edit (R10.2)", async () => {
    const { pool } = api.connection;
    await expect(pool.query("update setting_changes set new_value = 1")).rejects.toThrow(
      "append-only",
    );
    await expect(pool.query("delete from setting_changes")).rejects.toThrow("append-only");
    await expect(pool.query("truncate setting_changes")).rejects.toThrow("append-only");
  });
});

describe("the settings service", () => {
  it("gives the values of an earlier version, and of the current one", async () => {
    const service = createSettingsService(api.features);
    expect((await service.at(0)).beta_max_testers).toBe(150);
    expect((await service.at(1)).beta_max_testers).toBe(120);
    const current = await service.current();
    expect(current.version).toBe((await settings()).version);
    expect(await service.at(current.version)).toEqual(current.values);
  });

  it("sees a change made elsewhere within 5 seconds, and its own at once", async () => {
    const here = createSettingsService(api.features);
    const elsewhere = createSettingsService(api.features);
    const before = await here.current();
    const made = await elsewhere.change(
      { key: "beta_max_testers", value: 99, reason: "Elsewhere", version: before.version },
      { operator: { userId: operator.userId, sessionId: null }, request: null },
    );
    expect(made.ok).toBe(true);
    expect((await elsewhere.current()).values.beta_max_testers).toBe(99);
    expect((await here.current()).values.beta_max_testers).toBe(before.values.beta_max_testers);
    api.advance(6);
    expect((await here.current()).values.beta_max_testers).toBe(99);
  });
});

describe("GET /v1/config", () => {
  it("tells the apps, signed in or not, that this is the beta, whatever the invite switch, cached for 5 minutes", async () => {
    const before = (await settings()).version;
    const response = await api.request("/v1/config");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    const required = valueOf(await settings(), "invite_code_required") === 1;
    expect((await response.json()) as Config).toEqual({
      beta: true,
      paused: [],
      maxSeats: 8,
      freeCancellationMinutes: 15,
      maxMoveMinutes: 120,
      reliabilityMonths: 12,
      signInProviders: ["google", "apple"],
      payInPerson: false,
      analytics: null,
      // The test API sends email, so a code by email signs in (spec 26).
      emailSignIn: true,
    });

    await change("invite_code_required", {
      value: required ? 0 : 1,
      reason: "The other way",
      version: before,
    });
    expect((await (await api.request("/v1/config")).json()) as Config).toEqual({
      beta: true,
      paused: [],
      maxSeats: 8,
      freeCancellationMinutes: 15,
      maxMoveMinutes: 120,
      reliabilityMonths: 12,
      signInProviders: ["google", "apple"],
      payInPerson: false,
      analytics: null,
      // The test API sends email, so a code by email signs in (spec 26).
      emailSignIn: true,
    });
  });
});

describe("GET /v1/config with Google Analytics (spec 23, section 6)", () => {
  it("names the measurement ID, for the question about cookies", async () => {
    const app = createApp({
      logger: createLogger({ level: "silent" }),
      checkDatabase: () => Promise.resolve(),
      features: api.features,
      analytics: { googleMeasurementId: "G-ABC123XYZ9" },
    });
    const config = (await (await app.request("/v1/config")).json()) as Config;
    expect(config.analytics).toEqual({ googleMeasurementId: "G-ABC123XYZ9" });
  });
});
