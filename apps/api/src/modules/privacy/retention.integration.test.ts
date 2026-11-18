import { randomBytes } from "node:crypto";
import { Writable } from "node:stream";
import { schema } from "@shareride/db";
import {
  defaultTripDaySettings,
  holdEndsAt,
  retentionRules,
  type HoldSubjectKind,
  type RetentionRule,
} from "@shareride/domain";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../../logger.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";
import { runPrivacyCommand } from "./command.ts";
import { createErasure } from "./erasure.ts";
import { lastRuns, retentionSteps, runRetention, type RetentionStep } from "./retention.ts";

// Retention runs and holds (spec 11, 3.7; plan 4.7). The sample trips at the
// test clock (Friday 13 November 2026, noon): Jón drives Hlemmur to
// Keflavík Airport on Saturday at 05:30, instant.

let api: TestApi;
let logLines: string[];

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
  const { db } = api.connection;
  await db.update(schema.users).set({ deleteAfter: null });
  await db.delete(schema.retentionRuns);
  await db.delete(schema.holds);
  await db.delete(schema.blockedNumbers);
  await db.delete(schema.erasedAccounts);
  await db.delete(schema.dataExports);
  logLines = [];
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, rewind, driverOf, booked, paid } = bookingHelpers(() => api);
const { airport } = sampleTrip;
const day = 24 * 3600 * 1000;

function logger() {
  return createLogger({
    level: "info",
    destination: new Writable({
      write(chunk: Buffer, _encoding, callback) {
        logLines.push(chunk.toString());
        callback();
      },
    }),
  });
}

function erasure() {
  return createErasure({
    db: api.connection.db,
    clock: () => api.now(),
    hasher: api.features.hasher,
    tripDaySettings: defaultTripDaySettings,
    logger: logger(),
  });
}

function steps(): RetentionStep[] {
  return retentionSteps({ db: api.connection.db, erasure: erasure(), logger: logger() });
}

/** The clean-up's rules once, at `now`; with the real steps, none may fail. */
async function run(now = api.now(), using?: RetentionStep[]) {
  const result = await runRetention({
    db: api.connection.db,
    now,
    steps: using ?? steps(),
    logger: logger(),
  });
  if (using === undefined) expect(result.failedRules).toEqual([]);
  return result;
}

async function runs() {
  return api.connection.db.select().from(schema.retentionRuns);
}

const countOf = async (table: string) =>
  (
    await api.connection.db.execute<{ count: number }>(
      sql.raw(`select count(*)::int as count from ${table}`),
    )
  ).rows[0]?.count ?? 0;

/** A hold in force on the subject, set by an operator, until `endsAt`. */
async function hold(kind: HoldSubjectKind, id: string, endsAt: Date) {
  const operator = await api.signInOperator();
  const [row] = await api.connection.db
    .insert(schema.holds)
    .values({
      subjectType: kind,
      subjectId: id,
      reason: "Chargeback",
      endsAt,
      setBy: operator.userId,
    })
    .returning({ id: schema.holds.id });
  if (row === undefined) throw new Error("No hold.");
  return row.id;
}

async function endHold(holdId: string, at: Date) {
  await api.connection.db
    .update(schema.holds)
    .set({ endedAt: at })
    .where(eq(schema.holds.id, holdId));
}

/** Jón and a passenger with a paid booking on the airport trip, which opens their conversation. */
async function confirmedBooking() {
  const jon = await driverOf(airport, "Jón");
  const gunna = await newMember("Gunna");
  const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
  await paid(gunna.accessToken, booking.id);
  return { jon, gunna, bookingId: booking.id };
}

/** A year and a day after the airport trip arrives: its conversations are past their date. */
async function yearAfterTrip() {
  const [trip] = await api.connection.db
    .select({ arrivesAt: schema.trips.arrivesAt })
    .from(schema.trips)
    .where(eq(schema.trips.id, airport));
  if (trip?.arrivesAt === undefined || trip.arrivesAt === null) throw new Error("No arrival.");
  const after = new Date(trip.arrivesAt);
  after.setUTCFullYear(after.getUTCFullYear() + 1);
  return new Date(after.getTime() + day);
}

/** Ends the member's 7 days: as if they asked to delete their account over a week ago. */
async function waitEnded(member: Member) {
  await api.connection.db
    .update(schema.users)
    .set({ deleteAfter: new Date(api.now().getTime() - 1000) })
    .where(eq(schema.users.id, member.userId));
}

async function userExists(userId: string) {
  const rows = await api.connection.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return rows.length > 0;
}

/** The booking cancelled by its passenger, so nothing is open any more. */
async function cancelled(bookingId: string) {
  await api.connection.db
    .update(schema.bookings)
    .set({ status: "cancelled", cancelledAt: api.now(), cancelledBy: "passenger" })
    .where(eq(schema.bookings.id, bookingId));
}

describe("retention runs (spec 11, 3.7.2; R11.5)", () => {
  it("covers every rule, each in one step", () => {
    const covered = steps().flatMap((step) => step.rules);
    expect([...covered].sort()).toEqual([...retentionRules].sort());
  });

  it("records one run per rule, with how many records it erased and nothing else", async () => {
    const now = api.now();
    const { db } = api.connection;
    await db.insert(schema.blockedNumbers).values([
      { phoneHash: "gone", until: new Date(now.getTime() - 1000) },
      { phoneHash: "kept", until: new Date(now.getTime() + day) },
    ]);
    await db.insert(schema.erasedAccounts).values({
      userId: "0190f0a0-0000-7000-8000-000000000001",
      erasedAt: new Date(now.getTime() - 31 * day),
    });

    const result = await run(now);

    expect(result.failedRules).toEqual([]);
    const rows = await runs();
    expect(rows.map((row) => row.rule).sort()).toEqual([...retentionRules].sort());
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(["anonymised", "erased", "id", "ranAt", "rule"]);
      expect(row.ranAt).toEqual(now);
    }
    const counted = (rule: RetentionRule) => rows.find((row) => row.rule === rule);
    expect(counted("blocked_numbers")).toMatchObject({ erased: 1, anonymised: 0 });
    expect(counted("erased_accounts")).toMatchObject({ erased: 1, anonymised: 0 });
    expect(result.counts.blocked_numbers).toEqual({ erased: 1, anonymised: 0 });
  });

  it("is safe to run twice: the second run erases nothing", async () => {
    const now = api.now();
    await api.connection.db
      .insert(schema.blockedNumbers)
      .values({ phoneHash: "gone", until: new Date(now.getTime() - 1000) });
    await run(now);
    await api.connection.db.delete(schema.retentionRuns);

    await run(now);

    const rows = await runs();
    expect(rows).toHaveLength(retentionRules.length);
    expect(rows.filter((row) => row.erased !== 0 || row.anonymised !== 0)).toEqual([]);
  });

  it("deletes the record of a run after 90 days", async () => {
    const now = api.now();
    const cutoff = new Date(now.getTime() - 90 * day);
    await api.connection.db.insert(schema.retentionRuns).values([
      { rule: "holds", ranAt: cutoff },
      { rule: "holds", ranAt: new Date(cutoff.getTime() - 1) },
    ]);

    await run(now);

    const left = (await runs()).filter((row) => row.ranAt < now);
    expect(left.map((row) => row.ranAt)).toEqual([cutoff]);
    expect((await runs()).find((row) => row.rule === "retention_runs")?.erased).toBe(1);
  });

  it("goes on when a rule fails, records no run for it, and says which", async () => {
    const failing: RetentionStep = {
      rules: ["holds"],
      run: () => Promise.reject(new Error("The database went away.")),
    };
    const using = [failing, ...steps().filter((step) => !step.rules.includes("holds"))];

    const result = await run(api.now(), using);

    expect(result.failedRules).toEqual(["holds"]);
    expect(result.errors).toHaveLength(1);
    const rules = (await runs()).map((row) => row.rule);
    expect(rules).not.toContain("holds");
    expect(rules).toContain("blocked_numbers");
    expect(logLines.join("")).toContain("retention rule failed");
  });

  it("shows the last run of each rule", async () => {
    const now = api.now();
    await api.connection.db.insert(schema.retentionRuns).values([
      { rule: "holds", ranAt: new Date(now.getTime() - 3600_000), erased: 4 },
      { rule: "holds", ranAt: now, erased: 1 },
      { rule: "accounts", ranAt: now, erased: 2 },
    ]);

    const last = await lastRuns(api.connection.db);

    expect(last).toEqual([
      { rule: "accounts", ranAt: now, erased: 2, anonymised: 0 },
      { rule: "holds", ranAt: now, erased: 1, anonymised: 0 },
    ]);
  });
});

describe("the rules this feature adds (plan 4.7)", () => {
  it("deletes a blocked number once its date has come, not before", async () => {
    const now = api.now();
    await api.connection.db.insert(schema.blockedNumbers).values([
      { phoneHash: "until-now", until: now },
      { phoneHash: "until-later", until: new Date(now.getTime() + 1) },
    ]);

    await run(now);

    const left = await api.connection.db.select().from(schema.blockedNumbers);
    expect(left.map((row) => row.phoneHash)).toEqual(["until-later"]);
  });

  it('deletes the beta\'s feedback 12 months after "Invite code required" was last turned off (spec 12, section 7)', async () => {
    const { db } = api.connection;
    const now = api.now();
    const monthsAgo = (months: number) => new Date(now.getTime() - months * 30.5 * day);
    const gunna = await newMember("Gunna");
    const held = await newMember("Sigga");
    const details = {
      kind: "idea",
      appVersion: "1.4.0",
      platform: "web",
      osVersion: "",
      screen: "/",
      language: "is",
    };
    const sentAt = (userId: string, message: string, createdAt: Date) => ({
      userId,
      message,
      createdAt,
      ...details,
    });
    await db
      .insert(schema.feedback)
      .values([
        sentAt(gunna.userId, "during the beta", monthsAgo(20)),
        sentAt(gunna.userId, "after the beta", monthsAgo(6)),
        sentAt(held.userId, "held", monthsAgo(20)),
      ]);
    const [old] = await db
      .select({ id: schema.feedback.id })
      .from(schema.feedback)
      .where(eq(schema.feedback.message, "during the beta"));
    if (old === undefined) throw new Error("No feedback.");
    await db.insert(schema.feedbackScreenshots).values({
      feedbackId: old.id,
      file: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      width: 1,
      height: 1,
    });
    const left = async () =>
      (await db.select().from(schema.feedback).orderBy(asc(schema.feedback.createdAt))).map(
        (row) => row.message,
      );
    const [last] = await db
      .select({ version: schema.settingChanges.version })
      .from(schema.settingChanges)
      .orderBy(desc(schema.settingChanges.version))
      .limit(1);
    const change = (step: number, newValue: 0 | 1, createdAt: Date) =>
      db.insert(schema.settingChanges).values({
        version: (last?.version ?? 0) + step,
        key: "invite_code_required",
        oldValue: 1 - newValue,
        newValue,
        reason: "Test",
        createdAt,
      });

    // While the requirement is on, however old the feedback: nothing.
    expect((await run(now)).counts.feedback).toEqual({ erased: 0, anonymised: 0 });
    // Turned off 11 months ago: not yet.
    await change(1, 0, monthsAgo(11));
    await run(now);
    expect(await left()).toEqual(["during the beta", "held", "after the beta"]);
    // Turned on again and off 13 months ago is not the last change; off 12 months ago is.
    await change(2, 1, monthsAgo(10));
    await run(now);
    expect(await left()).toHaveLength(3);
    await change(3, 0, new Date(now.getTime() - 366 * day));
    const holdId = await hold("user", held.userId, new Date(now.getTime() + day));

    const result = await run(now);

    expect(result.counts.feedback).toEqual({ erased: 1, anonymised: 0 });
    expect(await left()).toEqual(["held", "after the beta"]);
    expect(await db.select().from(schema.feedbackScreenshots)).toEqual([]);
    await endHold(holdId, now);
    await db.delete(schema.feedback);
  });

  it("deletes the record of an erased account after 30 days", async () => {
    const now = api.now();
    const cutoff = new Date(now.getTime() - 30 * day);
    const kept = "0190f0a0-0000-7000-8000-000000000002";
    await api.connection.db.insert(schema.erasedAccounts).values([
      { userId: kept, erasedAt: cutoff },
      { userId: "0190f0a0-0000-7000-8000-000000000003", erasedAt: new Date(cutoff.getTime() - 1) },
    ]);

    await run(now);

    const left = await api.connection.db.select().from(schema.erasedAccounts);
    expect(left.map((row) => row.userId)).toEqual([kept]);
  });

  it("deletes a hold 3 years after it ended, and keeps one in force", async () => {
    const now = api.now();
    const threeYearsAgo = new Date(now);
    threeYearsAgo.setUTCFullYear(threeYearsAgo.getUTCFullYear() - 3);
    const subject = "0190f0a0-0000-7000-8000-000000000004";
    const ended = await hold("user", subject, new Date(now.getTime() + day));
    await endHold(ended, threeYearsAgo);
    const ranOut = await hold("user", subject, new Date(threeYearsAgo.getTime() + 1));
    const inForce = await hold("user", subject, new Date(now.getTime() + day));

    await run(now);

    const left = await api.connection.db.select({ id: schema.holds.id }).from(schema.holds);
    expect(left.map((row) => row.id).sort()).toEqual([ranOut, inForce].sort());
  });
});

describe("holds (spec 11, 3.7.3; R11.6)", () => {
  it.each([
    ["the booking", "booking"],
    ["the trip", "trip"],
    ["the passenger", "passenger"],
    ["the driver", "driver"],
  ] as const)(
    "keeps a conversation past its date while %s is held, and lets go after the hold ends",
    async (_name, which) => {
      const { jon, gunna, bookingId } = await confirmedBooking();
      expect(await countOf("conversations")).toBe(1);
      const now = await yearAfterTrip();
      const subject: [HoldSubjectKind, string] =
        which === "booking"
          ? ["booking", bookingId]
          : which === "trip"
            ? ["trip", airport]
            : ["user", which === "passenger" ? gunna.userId : jon.userId];
      const held = await hold(...subject, new Date(now.getTime() + day));

      await run(now);
      expect(await countOf("conversations")).toBe(1);

      await endHold(held, now);
      await run(now);
      expect(await countOf("conversations")).toBe(0);
    },
  );

  it("does not let a hold on one booking keep another", async () => {
    const { bookingId } = await confirmedBooking();
    const other = await newMember("Sigga");
    const theirs = await booked(other.accessToken, airport, { fromStop: 0, toStop: 1 });
    await paid(other.accessToken, theirs.id);
    const now = await yearAfterTrip();
    await hold("booking", bookingId, new Date(now.getTime() + day));

    await run(now);

    const left = await api.connection.db
      .select({ bookingId: schema.conversations.bookingId })
      .from(schema.conversations);
    expect(left).toEqual([{ bookingId }]);
  });

  it("lets go when the hold reaches its end", async () => {
    const { bookingId } = await confirmedBooking();
    const now = await yearAfterTrip();
    await hold("booking", bookingId, now);

    await run(now);

    expect(await countOf("conversations")).toBe(0);
  });

  it("keeps what the clean-up deletes about a held person: ended sessions, notifications, console sessions", async () => {
    const held = await newMember("Gunna");
    const free = await newMember("Sigga");
    const { db } = api.connection;
    const longAgo = new Date(api.now().getTime() - 200 * day);
    for (const member of [held, free]) {
      await db
        .update(schema.sessions)
        .set({ endedAt: longAgo, endReason: "signed_out" })
        .where(eq(schema.sessions.userId, member.userId));
      await db.insert(schema.notifications).values({
        recipientId: member.userId,
        kind: "account_deletion_scheduled",
        uniqueKey: `retention-test:${member.userId}`,
        createdAt: longAgo,
        updatedAt: longAgo,
      });
      await db.insert(schema.operatorSessions).values({
        userId: member.userId,
        tokenHash: randomBytes(16).toString("hex"),
        endedAt: longAgo,
        endReason: "signed_out",
      });
    }
    await hold("user", held.userId, new Date(api.now().getTime() + day));

    await run();

    const both = [held.userId, free.userId];
    for (const table of [schema.sessions, schema.operatorSessions]) {
      const left = await db
        .select({ userId: table.userId })
        .from(table)
        .where(inArray(table.userId, both));
      expect(left.map((row) => row.userId)).toEqual([held.userId]);
    }
    const notices = await db
      .select({ recipientId: schema.notifications.recipientId })
      .from(schema.notifications)
      .where(inArray(schema.notifications.recipientId, both));
    expect(notices).toEqual([{ recipientId: held.userId }]);
  });

  it.each([
    ["the draft", "trip"],
    ["its driver", "user"],
  ] as const)(
    "keeps a draft past its date while %s is held, and lets go after",
    async (_name, kind) => {
      const { db } = api.connection;
      const anna = await newMember("Anna");
      const drafts = await db
        .update(schema.trips)
        .set({ status: "draft", driverId: anna.userId, publishedAt: null })
        .where(inArray(schema.trips.id, [sampleTrip.vik, sampleTrip.north]))
        .returning({ id: schema.trips.id, departsAt: schema.trips.departsAt });
      // Anna's other draft has another driver, whom nothing holds.
      const free = await newMember("Siggi");
      await db
        .update(schema.trips)
        .set({ driverId: free.userId })
        .where(eq(schema.trips.id, sampleTrip.north));
      const latest = Math.max(...drafts.map((draft) => draft.departsAt?.getTime() ?? 0));
      const after = new Date(latest + day);
      const held = await hold(
        kind,
        kind === "trip" ? sampleTrip.vik : anna.userId,
        new Date(after.getTime() + day),
      );
      const left = async () =>
        (
          await db
            .select({ id: schema.trips.id })
            .from(schema.trips)
            .where(inArray(schema.trips.id, [sampleTrip.vik, sampleTrip.north]))
        ).map((row) => row.id);

      await run(after);
      expect(await left()).toEqual([sampleTrip.vik]);

      await endHold(held, after);
      await run(after);
      expect(await left()).toEqual([]);
    },
  );

  it.each([
    ["the booking", "booking"],
    ["the trip", "trip"],
    ["the passenger", "passenger"],
    ["the driver", "driver"],
  ] as const)(
    "keeps a booking's notifications past their date while %s is held",
    async (_name, which) => {
      const { jon, gunna, bookingId } = await confirmedBooking();
      const { db } = api.connection;
      const at = new Date(api.now().getTime() - 100 * day);
      // As the worker writes them: the booking only, no trip.
      for (const [recipientId, kind] of [
        [gunna.userId, "booking_confirmed"],
        [jon.userId, "booking_confirmed_driver"],
      ] as const) {
        await db.insert(schema.notifications).values({
          recipientId,
          kind,
          bookingId,
          uniqueKey: `retention-test:${kind}:${bookingId}`,
          createdAt: at,
          updatedAt: at,
        });
      }
      const subject: [HoldSubjectKind, string] =
        which === "booking"
          ? ["booking", bookingId]
          : which === "trip"
            ? ["trip", airport]
            : ["user", which === "passenger" ? gunna.userId : jon.userId];
      const held = await hold(...subject, new Date(api.now().getTime() + day));
      const left = () =>
        db
          .select({ id: schema.notifications.id })
          .from(schema.notifications)
          .where(eq(schema.notifications.bookingId, bookingId));

      await run();
      expect(await left()).toHaveLength(2);

      await endHold(held, api.now());
      await run();
      expect(await left()).toHaveLength(0);
    },
  );

  it("does not erase a held account until the hold ends", async () => {
    const gunna = await newMember("Gunna");
    await waitEnded(gunna);
    const held = await hold("user", gunna.userId, new Date(api.now().getTime() + day));

    expect(await erasure().eraseDue()).toEqual({ erased: 0, failed: 0 });
    expect(await userExists(gunna.userId)).toBe(true);
    expect(logLines.join("")).toContain("account erasure waits: held");

    await endHold(held, api.now());
    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });
  });

  it.each([
    ["the passenger, while their booking is held", "passenger", "booking"],
    ["the passenger, while the trip is held", "passenger", "trip"],
    ["the driver, while a booking on their trip is held", "driver", "booking"],
    ["the driver, while their trip is held", "driver", "trip"],
  ] as const)("does not erase %s", async (_name, who, held) => {
    const { jon, gunna, bookingId } = await confirmedBooking();
    await cancelled(bookingId);
    // Jón's trip is over too, so nothing is open for either of them.
    await api.connection.db
      .update(schema.trips)
      .set({ status: "cancelled", cancelledAt: api.now(), cancelReason: "other" })
      .where(eq(schema.trips.id, airport));
    const member = who === "driver" ? jon : gunna;
    await waitEnded(member);
    await hold(held, held === "booking" ? bookingId : airport, new Date(api.now().getTime() + day));

    expect(await erasure().eraseDue()).toEqual({ erased: 0, failed: 0 });
    expect(await userExists(member.userId)).toBe(true);

    await api.connection.db.update(schema.holds).set({ endedAt: api.now() });
    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });
  });

  it("erases an account while holds cover only other people's trips and bookings", async () => {
    const { bookingId } = await confirmedBooking();
    const sigga = await newMember("Sigga");
    await waitEnded(sigga);
    await hold("trip", airport, new Date(api.now().getTime() + day));
    await hold("booking", bookingId, new Date(api.now().getTime() + day));

    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });
    expect(await userExists(sigga.userId)).toBe(false);
  });

  it("deletes a held person's expired export as usual: it is a copy of what is kept", async () => {
    const gunna = await newMember("Gunna");
    const now = api.now();
    await api.connection.db.insert(schema.dataExports).values({
      userId: gunna.userId,
      askedAt: new Date(now.getTime() - 40 * day),
      readyAt: new Date(now.getTime() - 40 * day),
      expiresAt: new Date(now.getTime() - 33 * day),
      file: Buffer.from("sealed"),
    });
    await hold("user", gunna.userId, new Date(now.getTime() + day));

    await run(now);

    expect(await countOf("data_exports")).toBe(0);
  });
});

describe("the privacy command: runs and holds", () => {
  async function command(...args: string[]) {
    const lines: string[] = [];
    const exitCode = await runPrivacyCommand(args, {
      db: api.connection.db,
      clock: () => api.now(),
      erasure: erasure(),
      before: undefined,
      write: (line) => lines.push(line),
    });
    return { exitCode, output: lines.join("\n") };
  }

  async function auditEntries(subjectId: string) {
    return api.connection.db
      .select({
        action: schema.auditLog.action,
        operatorUserId: schema.auditLog.operatorUserId,
        operatorSessionId: schema.auditLog.operatorSessionId,
        subjectType: schema.auditLog.subjectType,
        before: schema.auditLog.before,
        after: schema.auditLog.after,
      })
      .from(schema.auditLog)
      .where(
        and(eq(schema.auditLog.subjectId, subjectId), sql`${schema.auditLog.action} like 'hold.%'`),
      )
      .orderBy(schema.auditLog.createdAt);
  }

  it("shows the last run of each rule, in Iceland time, and the rules never run", async () => {
    await api.connection.db.insert(schema.retentionRuns).values([
      { rule: "accounts", ranAt: new Date("2026-11-13T11:00:00Z"), erased: 2 },
      { rule: "conversations", ranAt: new Date("2026-11-13T11:00:00Z"), erased: 0 },
    ]);

    const { exitCode, output } = await command("runs");

    expect(exitCode).toBe(0);
    const lines = output.split("\n");
    expect(lines[0]).toBe("The last run of each retention rule (Iceland time):");
    expect(lines).toHaveLength(retentionRules.length + 1);
    expect(lines.find((line) => line.startsWith("accounts "))).toMatch(
      /^accounts +13 Nov 2026, 11:00 +erased 2$/,
    );
    expect(lines.find((line) => line.startsWith("holds "))).toMatch(/^holds +never run$/);
  });

  it("holds a booking's records through the day given, in the audit log", async () => {
    const operator = await api.signInOperator();
    const { bookingId } = await confirmedBooking();

    const { exitCode, output } = await command(
      "hold",
      "booking",
      bookingId,
      "--until",
      "2027-03-01",
      "--reason",
      "Chargeback 4411",
      "--by",
      operator.userId,
    );

    expect(exitCode).toBe(0);
    const [row] = await api.connection.db.select().from(schema.holds);
    expect(row).toMatchObject({
      subjectType: "booking",
      subjectId: bookingId,
      reason: "Chargeback 4411",
      endsAt: holdEndsAt("2027-03-01"),
      setBy: operator.userId,
      endedAt: null,
    });
    expect(output).toBe(
      `Hold ${row?.id ?? ""} keeps the records of booking ${bookingId} until 2 Mar 2027, 00:00 (Iceland time).`,
    );
    expect(await auditEntries(bookingId)).toEqual([
      {
        action: "hold.set",
        operatorUserId: operator.userId,
        operatorSessionId: null,
        subjectType: "booking",
        before: null,
        after: { hold: row?.id, endsAt: "2027-03-02T00:00:00.000Z" },
      },
    ]);
  });

  it("waits for an erasure under way, then finds the account gone", async () => {
    const operator = await api.signInOperator();
    const gunna = await newMember("Gunna");
    const erasing = await api.connection.pool.connect();
    try {
      // As an erasure does: the account's row first.
      await erasing.query("BEGIN");
      await erasing.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [gunna.userId]);
      const setting = command(
        "hold",
        "user",
        gunna.userId,
        "--until",
        "2027-03-01",
        "--reason",
        "Claim",
        "--by",
        operator.userId,
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      await erasing.query("DELETE FROM users WHERE id = $1", [gunna.userId]);
      await erasing.query("COMMIT");

      expect(await setting).toEqual({ exitCode: 1, output: "No user has that ID." });
      expect(await countOf("holds")).toBe(0);
    } finally {
      erasing.release();
    }
  });

  it("takes an operator by phone number too", async () => {
    const operator = await api.signInOperator();
    const [user] = await api.connection.db
      .select({ phone: schema.users.phoneE164 })
      .from(schema.users)
      .where(eq(schema.users.id, operator.userId));
    const gunna = await newMember("Gunna");

    const { exitCode } = await command(
      "hold",
      "user",
      gunna.userId,
      "--until",
      "2027-01-31",
      "--reason",
      "Claim",
      "--by",
      user?.phone ?? "",
    );

    expect(exitCode).toBe(0);
    expect(await countOf("holds")).toBe(1);
  });

  it.each([
    ["no reason", ["--reason", "   "], "A hold needs a reason."],
    ["a day gone by", ["--until", "2026-11-12"], "That day has passed."],
    [
      "nothing with that ID",
      ["id:0190f0a0-0000-7000-8000-000000000009"],
      "No booking has that ID.",
    ],
    ["someone who is not an operator", ["by:member"], "That account is not an operator."],
  ])("refuses a hold with %s", async (_name, change, message) => {
    const operator = await api.signInOperator();
    const gunna = await newMember("Gunna");
    const { bookingId } = await confirmedBooking();
    const options: Record<string, string> = {
      id: bookingId,
      "--until": "2027-03-01",
      "--reason": "Chargeback",
      "--by": operator.userId,
    };
    for (let index = 0; index < change.length; index += 1) {
      const item = change[index] ?? "";
      if (item.startsWith("id:")) options["id"] = item.slice(3);
      else if (item === "by:member") options["--by"] = gunna.userId;
      else options[item] = change[(index += 1)] ?? "";
    }

    const { exitCode, output } = await command(
      "hold",
      "booking",
      options["id"] ?? "",
      "--until",
      options["--until"] ?? "",
      "--reason",
      options["--reason"] ?? "",
      "--by",
      options["--by"] ?? "",
    );

    expect({ exitCode, output }).toEqual({ exitCode: 1, output: message });
    expect(await countOf("holds")).toBe(0);
  });

  it("lists the holds in force, nearest end first", async () => {
    const operator = await api.signInOperator();
    const later = await hold("trip", airport, new Date("2027-06-01T00:00:00Z"));
    const sooner = await hold("user", operator.userId, new Date("2027-01-01T00:00:00Z"));
    const ended = await hold("trip", airport, new Date("2027-02-01T00:00:00Z"));
    await endHold(ended, api.now());

    const { exitCode, output } = await command("holds");

    expect(exitCode).toBe(0);
    const lines = output.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(
      new RegExp(`^${sooner}  user ${operator.userId}  until 1 Jan 2027, 00:00  Chargeback$`),
    );
    expect(lines[1]).toContain(later);
  });

  it("says when no hold is in force", async () => {
    expect(await command("holds")).toEqual({ exitCode: 0, output: "No hold is in force." });
  });

  it("ends a hold early, once, in the audit log", async () => {
    const operator = await api.signInOperator();
    const held = await hold("trip", airport, new Date("2027-06-01T00:00:00Z"));

    expect(await command("end-hold", held, "--by", operator.userId)).toEqual({
      exitCode: 0,
      output: `Hold ${held} has ended. Its records go once their own dates have passed.`,
    });
    const [row] = await api.connection.db.select().from(schema.holds);
    expect(row?.endedAt).toEqual(api.now());
    expect(await auditEntries(airport)).toEqual([
      {
        action: "hold.ended",
        operatorUserId: operator.userId,
        operatorSessionId: null,
        subjectType: "trip",
        before: { endedAt: null },
        after: { hold: held, endedAt: api.now().toISOString() },
      },
    ]);

    expect(await command("end-hold", held, "--by", operator.userId)).toEqual({
      exitCode: 1,
      output: "That hold has already ended.",
    });
    expect(
      await command("end-hold", "0190f0a0-0000-7000-8000-000000000009", "--by", operator.userId),
    ).toEqual({ exitCode: 1, output: "No hold has that ID." });
  });

  it("shows how to use it", async () => {
    for (const args of [
      ["runs", "now"],
      ["hold", "booking"],
      ["hold", "car", airport, "--until", "2027-03-01", "--reason", "Claim", "--by", airport],
      ["hold", "trip", airport, "--until", "1 March", "--reason", "Claim", "--by", airport],
      ["hold", "trip", airport, "--reason", "Claim", "--by", airport],
      ["end-hold", airport],
      ["end-hold", airport, "--by"],
    ]) {
      const { exitCode, output } = await command(...args);
      expect(exitCode).toBe(2);
      expect(output).toContain("privacy hold <user|trip|booking> <ID>");
    }
  });
});
