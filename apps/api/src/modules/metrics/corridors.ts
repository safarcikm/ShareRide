import { schema, type Database } from "@shareride/db";
import { checkCorridor, err, ok, type CorridorProblem, type Result } from "@shareride/domain";
import { asc, eq, inArray } from "drizzle-orm";
import { recordAudit, type AuditEntry } from "../admin/audit.ts";

const { corridors, places } = schema;

// The operator's corridors (spec 10, 3.4.1): a name and the places along
// a road. The weekly figures are counted for each active one.

export interface CorridorPlace {
  readonly id: string;
  /** The Icelandic name; empty for a place that is gone. */
  readonly name: string;
}

export interface CorridorView {
  readonly id: string;
  readonly name: string;
  readonly places: readonly CorridorPlace[];
  readonly active: boolean;
  readonly updatedAt: Date;
}

export type CorridorError = CorridorProblem | { readonly code: "place_unknown" };

type By = Pick<AuditEntry, "operator" | "request">;

export interface CorridorService {
  /** The corridors by name, and every place by name. */
  overview(): Promise<{
    readonly corridors: readonly CorridorView[];
    readonly places: readonly CorridorPlace[];
  }>;
  create(
    draft: { readonly name: string; readonly placeIds: readonly string[] },
    by: By,
  ): Promise<Result<CorridorView, CorridorError>>;
  update(
    id: string,
    changes: {
      readonly name?: string | undefined;
      readonly placeIds?: readonly string[] | undefined;
      readonly active?: boolean | undefined;
    },
    by: By,
  ): Promise<Result<CorridorView, CorridorError | { readonly code: "not_found" }>>;
}

type Stored = typeof corridors.$inferSelect;

export function createCorridorService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
}): CorridorService {
  const { db, clock } = dependencies;

  type Executor = Pick<Database, "select">;

  const namesOf = async (executor: Executor, ids: readonly string[]) => {
    if (ids.length === 0) return new Map<string, string>();
    const rows = await executor
      .select({ id: places.id, name: places.nameIs })
      .from(places)
      .where(inArray(places.id, [...ids]));
    return new Map(rows.map((row) => [row.id, row.name]));
  };

  const viewOf = (row: Stored, names: ReadonlyMap<string, string>): CorridorView => ({
    id: row.id,
    name: row.name,
    places: row.placeIds.map((id) => ({ id, name: names.get(id) ?? "" })),
    active: row.active,
    updatedAt: row.updatedAt,
  });

  const audited = (row: Stored) => ({
    name: row.name,
    placeIds: row.placeIds,
    active: row.active,
  });

  return {
    async overview() {
      const [rows, all] = await Promise.all([
        db.select().from(corridors).orderBy(asc(corridors.name), asc(corridors.id)),
        db
          .select({ id: places.id, name: places.nameIs })
          .from(places)
          .orderBy(asc(places.nameIs), asc(places.id)),
      ]);
      const names = new Map(all.map((place) => [place.id, place.name]));
      return { corridors: rows.map((row) => viewOf(row, names)), places: all };
    },

    async create(draft, by) {
      const checked = checkCorridor(draft);
      if (!checked.ok) return checked;
      const now = clock();
      return db.transaction(async (tx) => {
        const names = await namesOf(tx, checked.value.placeIds);
        if (names.size !== checked.value.placeIds.length) return err({ code: "place_unknown" });
        const [row] = await tx
          .insert(corridors)
          .values({
            name: checked.value.name,
            placeIds: [...checked.value.placeIds],
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (row === undefined) throw new Error("The corridor was not stored.");
        await recordAudit(tx, {
          ...by,
          action: "corridor.created",
          subjectType: "corridor",
          subjectId: row.id,
          after: audited(row),
        });
        return ok(viewOf(row, names));
      });
    },

    async update(id, changes, by) {
      const now = clock();
      return db.transaction(async (tx) => {
        const [stored] = await tx
          .select()
          .from(corridors)
          .where(eq(corridors.id, id))
          .for("update");
        if (stored === undefined) return err({ code: "not_found" });
        const checked = checkCorridor({
          name: changes.name ?? stored.name,
          placeIds: changes.placeIds ?? stored.placeIds,
        });
        if (!checked.ok) return checked;
        const names = await namesOf(tx, checked.value.placeIds);
        // Only places newly put on it must exist: one that went stays until taken off.
        if (changes.placeIds !== undefined && names.size !== checked.value.placeIds.length) {
          return err({ code: "place_unknown" });
        }
        const [row] = await tx
          .update(corridors)
          .set({
            name: checked.value.name,
            placeIds: [...checked.value.placeIds],
            active: changes.active ?? stored.active,
            updatedAt: now,
          })
          .where(eq(corridors.id, id))
          .returning();
        if (row === undefined) throw new Error("The corridor was not stored.");
        await recordAudit(tx, {
          ...by,
          action: "corridor.changed",
          subjectType: "corridor",
          subjectId: id,
          before: audited(stored),
          after: audited(row),
        });
        return ok(viewOf(row, names));
      });
    },
  };
}
