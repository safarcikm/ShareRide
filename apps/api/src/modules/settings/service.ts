import { schema, type Database } from "@shareride/db";
import {
  checkSettingChange,
  err,
  isSwitchKey,
  ok,
  switchKeys,
  valuesAt,
  type Result,
  type SettingChangeProblem,
  type SettingKey,
  type SettingValues,
  type StoredSettingChange,
  type SwitchKey,
} from "@shareride/domain";
import { desc, eq, lt, sql } from "drizzle-orm";
import { recordAudit, type AuditEntry } from "../admin/audit.ts";

// The settings store (spec 10, 3.2; R10.1 to R10.3; ADR 0032): the values
// are the defaults with the history laid over them, so there is one record
// of what they are and how they came to be.

const { settingChanges, users } = schema;

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** The values of one settings version. */
export interface SettingsSnapshot {
  /** 0 is the defaults; each change is the next. */
  readonly version: number;
  readonly values: SettingValues;
}

/** Each switch for emergencies (spec 10, 3.3): on or off, and since when; null when never changed. */
export type SwitchStates = Readonly<
  Record<SwitchKey, { readonly on: boolean; readonly since: Date | null }>
>;

/** One setting changed, as the code that must follow it in the same transaction sees it. */
export interface SettingChanged {
  readonly key: SettingKey;
  readonly oldValue: number;
  readonly newValue: number;
}

export interface SettingChangeInput {
  readonly key: string;
  readonly value: number;
  readonly reason: string;
  /** The version the operator saw. */
  readonly version: number;
}

export type SettingChangeError = SettingChangeProblem | { readonly code: "settings_changed" };

export interface SettingHistoryEntry {
  readonly version: number;
  readonly key: string;
  readonly oldValue: number;
  readonly newValue: number;
  readonly reason: string;
  readonly changedBy: { readonly userId: string; readonly firstName: string | null } | null;
  readonly changedAt: Date;
}

/** Changes per page of the console's history. */
export const settingHistoryPageSize = 50;

/** How long the current values are kept before they are read again. */
export const settingsCacheMs = 5000;

export interface SettingsService {
  /**
   * The values now. Read from the database at most every 5 seconds, and at
   * once after a change made through this service: a change made by another
   * process is seen within 5 seconds.
   */
  current(): Promise<SettingsSnapshot>;
  /** The values now, read from the database whatever is cached. */
  latest(): Promise<SettingsSnapshot>;
  /** The switches now, as old as `current()` at most. */
  switches(): Promise<SwitchStates>;
  /** The values as they were at a version (R10.3); a version never changes. */
  at(version: number): Promise<SettingValues>;
  /** Changes one setting, as the next version, with its audit entry (R10.2, R10.8). */
  change(
    input: SettingChangeInput,
    by: Pick<AuditEntry, "operator" | "request">,
  ): Promise<Result<SettingsSnapshot, SettingChangeError>>;
  /** A page of the history, newest first, and the version to ask the next page before. */
  history(before?: number): Promise<{
    readonly changes: readonly SettingHistoryEntry[];
    readonly next: number | null;
  }>;
}

export interface SettingsServiceDependencies {
  readonly db: Database;
  readonly clock: () => Date;
  /**
   * Values `current()` gives whatever is stored, for tests and the browser
   * tests' server, which run with the closed beta's gate off. Never set on
   * a real server. The console still shows and changes the stored values.
   */
  readonly fixedSettings?: Partial<SettingValues>;
  /**
   * What must happen with a change, in its transaction: when bookings are
   * paused or open again, the payment deadlines move (spec 10, 3.3).
   */
  readonly onChange?: (tx: Transaction, change: SettingChanged, now: Date) => Promise<void>;
}

const stored = {
  version: settingChanges.version,
  key: settingChanges.key,
  newValue: settingChanges.newValue,
  createdAt: settingChanges.createdAt,
};

type StoredChange = StoredSettingChange & { readonly createdAt: Date };

interface Read {
  readonly snapshot: SettingsSnapshot;
  /** When each switch was last changed. */
  readonly switchedAt: ReadonlyMap<SwitchKey, Date>;
}

const readOf = (changes: readonly StoredChange[]): Read => {
  const version = Math.max(0, ...changes.map((change) => change.version));
  const switchedAt = new Map<SwitchKey, Date>();
  for (const change of [...changes].sort((a, b) => a.version - b.version)) {
    if (isSwitchKey(change.key)) switchedAt.set(change.key, change.createdAt);
  }
  return { snapshot: { version, values: valuesAt(version, changes) }, switchedAt };
};

export function createSettingsService({
  db,
  clock,
  fixedSettings,
  onChange,
}: SettingsServiceDependencies): SettingsService {
  let cached: (Read & { readonly readAt: number }) | undefined;
  const versions = new Map<number, SettingValues>();

  const remember = (read: Read) => {
    cached = { ...read, readAt: clock().getTime() };
    versions.set(read.snapshot.version, read.snapshot.values);
    return read;
  };

  const read = async (q: Database | Transaction) =>
    readOf(await q.select(stored).from(settingChanges));

  /** What is cached, or read again once it is 5 seconds old. */
  const recent = async (): Promise<Read> => {
    const age = cached === undefined ? Infinity : clock().getTime() - cached.readAt;
    // A clock moved back, as tests do, reads again too.
    if (cached !== undefined && age >= 0 && age < settingsCacheMs) return cached;
    return remember(await read(db));
  };

  const fixed = (snapshot: SettingsSnapshot): SettingsSnapshot =>
    fixedSettings === undefined
      ? snapshot
      : { ...snapshot, values: { ...snapshot.values, ...fixedSettings } };

  return {
    current: async () => fixed((await recent()).snapshot),

    latest: async () => remember(await read(db)).snapshot,

    async switches() {
      const { snapshot, switchedAt } = await recent();
      const { values } = fixed(snapshot);
      return Object.fromEntries(
        switchKeys.map((key) => [
          key,
          // A fixed value was never changed by anyone.
          fixedSettings?.[key] === undefined
            ? { on: values[key] === 1, since: switchedAt.get(key) ?? null }
            : { on: values[key] === 1, since: null },
        ]),
      ) as SwitchStates;
    },

    async at(version) {
      const known = versions.get(version);
      if (known !== undefined) return known;
      const changes = await db
        .select(stored)
        .from(settingChanges)
        .where(sql`${settingChanges.version} <= ${version}`);
      // Only a version that exists is kept: one still to come would be wrong later.
      const values = valuesAt(version, changes);
      if (version === 0 || changes.some((change) => change.version === version)) {
        versions.set(version, values);
      }
      return values;
    },

    async change(input, by) {
      const now = clock();
      const result = await db.transaction(async (tx): Promise<Result<Read, SettingChangeError>> => {
        // One change at a time, so versions never repeat or skip.
        await tx.execute(sql`lock table ${settingChanges} in exclusive mode`);
        const before = await read(tx);
        if (before.snapshot.version !== input.version) return err({ code: "settings_changed" });
        const { values } = before.snapshot;
        const checked = checkSettingChange(input.key, input.value, input.reason, values);
        if (!checked.ok) return checked;
        const { key, oldValue, newValue, reason } = checked.value;
        const version = before.snapshot.version + 1;
        await tx.insert(settingChanges).values({
          version,
          key,
          oldValue,
          newValue,
          reason,
          changedBy: by.operator.userId,
          createdAt: now,
          updatedAt: now,
        });
        await recordAudit(tx, {
          ...by,
          // A switch for emergencies has its own name in the log (spec 10, 3.3).
          action: isSwitchKey(key) ? "switch.changed" : "setting.changed",
          subjectType: "setting",
          subjectId: key,
          before: { value: oldValue },
          after: { value: newValue, version, reason },
        });
        await onChange?.(tx, { key, oldValue, newValue }, now);
        const switchedAt = new Map(before.switchedAt);
        if (isSwitchKey(key)) switchedAt.set(key, now);
        return ok({ snapshot: { version, values: { ...values, [key]: newValue } }, switchedAt });
      });
      if (!result.ok) return result;
      return ok(remember(result.value).snapshot);
    },

    async history(before) {
      const rows = await db
        .select({
          version: settingChanges.version,
          key: settingChanges.key,
          oldValue: settingChanges.oldValue,
          newValue: settingChanges.newValue,
          reason: settingChanges.reason,
          changedBy: settingChanges.changedBy,
          firstName: users.firstName,
          userId: users.id,
          changedAt: settingChanges.createdAt,
        })
        .from(settingChanges)
        .leftJoin(users, eq(users.id, settingChanges.changedBy))
        .where(before === undefined ? undefined : lt(settingChanges.version, before))
        .orderBy(desc(settingChanges.version))
        .limit(settingHistoryPageSize + 1);
      const page = rows.slice(0, settingHistoryPageSize);
      return {
        changes: page.map(({ changedBy, firstName, userId, ...change }) => ({
          ...change,
          // An operator whose account is gone leaves the ID, as in the audit log.
          changedBy:
            changedBy === null ? null : { userId: changedBy, firstName: userId ? firstName : null },
        })),
        next: rows.length > settingHistoryPageSize ? (page.at(-1)?.version ?? null) : null,
      };
    },
  };
}
