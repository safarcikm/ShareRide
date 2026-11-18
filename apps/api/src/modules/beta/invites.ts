import { schema, type Database } from "@shareride/db";
import {
  checkGroupCode,
  checkInviteCode,
  err,
  inviteCodeWorks,
  isInviteCodeShaped,
  newInviteCode,
  normaliseInviteCode,
  ok,
  placesLeft,
  type GroupCodeDraft,
  type GroupCodeProblem,
  type InviteCodeProblem,
  type Result,
} from "@shareride/domain";
import { count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { recordAudit, type AuditEntry } from "../admin/audit.ts";
import type { SettingsService } from "../settings/index.ts";

// Invite codes and the closed beta's gate (spec 12, 3.2; R12.1 to R12.3):
// who may create an account while `invite_code_required` is on, and the
// operator's group codes.

const { inviteCodes, users } = schema;

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

export type SignUpRefusal =
  | { readonly code: "invite_required" }
  /** The operator paused new accounts (spec 10, 3.3). */
  | { readonly code: "signups_paused" }
  | InviteCodeProblem;

/**
 * Decides, inside the sign-up's transaction, whether a new account can be
 * made, and uses the code up. The answer's `inviteCodeId` goes on the
 * account; it is null while no code is needed.
 */
export type SignUpGate = (
  tx: Transaction,
  inviteCode: string | undefined,
  now: Date,
) => Promise<Result<{ readonly inviteCodeId: string | null }, SignUpRefusal>>;

type StoredCode = typeof inviteCodes.$inferSelect;

export interface InviteCodeView {
  readonly id: string;
  readonly code: string;
  readonly kind: "group" | "personal";
  readonly name: string;
  readonly usesAllowed: number;
  readonly uses: number;
  readonly expiresAt: Date;
  readonly endedAt: Date | null;
  readonly works: boolean;
  readonly createdAt: Date;
}

export interface InviteCodesOverview {
  readonly required: boolean;
  readonly testers: number;
  readonly maxTesters: number;
  readonly placesLeft: number;
  readonly codes: readonly InviteCodeView[];
}

export interface InviteService {
  readonly gate: SignUpGate;
  /** Whether a code would work now, without using it; true while none is needed. */
  check(code: string): Promise<Result<void, InviteCodeProblem>>;
  /** Every code, newest first, with the testers and the places left. */
  overview(): Promise<InviteCodesOverview>;
  /** Makes a group code. `by` is left out for the command on the server. */
  create(
    draft: GroupCodeDraft,
    by?: Pick<AuditEntry, "operator" | "request">,
  ): Promise<Result<InviteCodeView, GroupCodeProblem>>;
  /** Ends a code now; the accounts made with it stay. */
  end(
    id: string,
    by: Pick<AuditEntry, "operator" | "request">,
  ): Promise<Result<InviteCodeView, { readonly code: "not_found" | "already_ended" }>>;
}

export interface InviteServiceDependencies {
  readonly db: Database;
  readonly clock: () => Date;
  readonly settings: Pick<SettingsService, "current" | "latest">;
  /** A cryptographically secure random integer in [0, max). */
  readonly randomInt: (max: number) => number;
}

/**
 * One lock for every sign-up through the gate, held to the end of its
 * transaction: the testers are counted and the account is made with nobody
 * else in between, so the cap is never passed (R12.3).
 */
const gateLock = sql`select pg_advisory_xact_lock(hashtext('shareride.invite_gate'))`;

const countTesters = async (q: Executor): Promise<number> => {
  const [row] = await q
    .select({ testers: count() })
    .from(users)
    .where(isNotNull(users.inviteCodeId));
  return row?.testers ?? 0;
};

const viewOf = (row: StoredCode, now: Date): InviteCodeView => ({
  id: row.id,
  code: row.code,
  kind: row.kind === "personal" ? "personal" : "group",
  name: row.name,
  usesAllowed: row.usesAllowed,
  uses: row.uses,
  expiresAt: row.expiresAt,
  endedAt: row.endedAt,
  works: inviteCodeWorks(row, now),
  createdAt: row.createdAt,
});

/** How often a new code is picked again when it is already taken. */
const codeTries = 5;

export function createInviteService(dependencies: InviteServiceDependencies): InviteService {
  const { db, clock, settings, randomInt } = dependencies;

  return {
    async gate(tx, inviteCode, now) {
      const { values } = await settings.current();
      // Paused: nobody new, with a code or without; nothing is counted or used.
      if (values.signups_open === 0) return err({ code: "signups_paused" });
      if (values.invite_code_required === 0) return ok({ inviteCodeId: null });
      if (inviteCode === undefined) return err({ code: "invite_required" });
      const code = normaliseInviteCode(inviteCode);
      if (!isInviteCodeShaped(code)) return err({ code: "invite_invalid" });

      await tx.execute(gateLock);
      const [stored] = await tx
        .select()
        .from(inviteCodes)
        .where(eq(inviteCodes.code, code))
        .for("update");
      const checked = checkInviteCode(stored, await countTesters(tx), values.beta_max_testers, now);
      if (!checked.ok) return checked;
      if (stored === undefined) throw new Error("A code that works is stored.");
      await tx
        .update(inviteCodes)
        .set({ uses: sql`${inviteCodes.uses} + 1`, updatedAt: now })
        .where(eq(inviteCodes.id, stored.id));
      return ok({ inviteCodeId: stored.id });
    },

    async check(text) {
      const { values } = await settings.current();
      if (values.invite_code_required === 0) return ok(undefined);
      const code = normaliseInviteCode(text);
      if (!isInviteCodeShaped(code)) return err({ code: "invite_invalid" });
      const [stored] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code));
      return checkInviteCode(stored, await countTesters(db), values.beta_max_testers, clock());
    },

    async overview() {
      const now = clock();
      const { values } = await settings.latest();
      const testers = await countTesters(db);
      const rows = await db.select().from(inviteCodes).orderBy(desc(inviteCodes.id));
      return {
        required: values.invite_code_required !== 0,
        testers,
        maxTesters: values.beta_max_testers,
        placesLeft: placesLeft(values.beta_max_testers, testers),
        codes: rows.map((row) => viewOf(row, now)),
      };
    },

    async create(draft, by) {
      const now = clock();
      const checked = checkGroupCode(draft, now);
      if (!checked.ok) return checked;
      const { name, uses, expiresAt } = checked.value;
      for (let attempt = 1; ; attempt += 1) {
        const made = await db.transaction(async (tx) => {
          const [row] = await tx
            .insert(inviteCodes)
            .values({
              code: newInviteCode(randomInt),
              kind: "group",
              name,
              usesAllowed: uses,
              expiresAt,
              createdBy: by?.operator.userId ?? null,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing({ target: inviteCodes.code })
            .returning();
          if (row !== undefined && by !== undefined) {
            await recordAudit(tx, {
              ...by,
              action: "invite_code.created",
              subjectType: "invite_code",
              subjectId: row.id,
              after: { name, usesAllowed: uses, expiresAt: expiresAt.toISOString() },
            });
          }
          return row;
        });
        if (made !== undefined) return ok(viewOf(made, now));
        if (attempt === codeTries) throw new Error("No free invite code was found.");
      }
    },

    async end(id, by) {
      const now = clock();
      return db.transaction(async (tx) => {
        const [stored] = await tx
          .select()
          .from(inviteCodes)
          .where(eq(inviteCodes.id, id))
          .for("update");
        if (stored === undefined) return err({ code: "not_found" as const });
        if (stored.endedAt !== null) return err({ code: "already_ended" as const });
        const [ended] = await tx
          .update(inviteCodes)
          .set({ endedAt: now, updatedAt: now })
          .where(eq(inviteCodes.id, id))
          .returning();
        if (ended === undefined) throw new Error("The code was not stored.");
        await recordAudit(tx, {
          ...by,
          action: "invite_code.ended",
          subjectType: "invite_code",
          subjectId: id,
          before: { endedAt: null },
          after: { endedAt: now.toISOString() },
        });
        return ok(viewOf(ended, now));
      });
    },
  };
}
