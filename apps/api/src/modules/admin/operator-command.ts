import { schema, type Database } from "@shareride/db";
import { icelandTimeZone, normalisePhoneNumber, operatorRole } from "@shareride/domain";
import { asc, count, eq, sql } from "drizzle-orm";
import { recordAudit } from "./audit.ts";
import { passkeyCount, type PasskeyService } from "./passkeys.ts";
import type { OperatorSessionService } from "./sessions.ts";

const { operatorPasskeys, operatorSetupLinks, users } = schema;

export interface OperatorCommandDependencies {
  readonly db: Database;
  /** The console's origin, which setup links point to; `add` needs it. */
  readonly adminOrigin: string | undefined;
  readonly passkeys: PasskeyService;
  readonly sessions: OperatorSessionService;
  readonly write: (line: string) => void;
}

const usage = [
  "Usage:",
  "  operator add <user ID or phone number>     give the role and print a setup link",
  "  operator remove <user ID or phone number>  take the role away",
  "  operator list                              list operators",
].join("\n");

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const icelandTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: icelandTimeZone,
  dateStyle: "medium",
  timeStyle: "short",
});

/** The account with this user ID or phone number, or null. */
export async function findAccount(db: Database, who: string) {
  let condition;
  if (uuidPattern.test(who)) {
    condition = eq(users.id, who.toLowerCase());
  } else {
    const phone = normalisePhoneNumber(who);
    if (!phone.ok) return null;
    condition = eq(users.phoneE164, phone.value.e164);
  }
  const [user] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      roles: users.roles,
      status: users.status,
      deleteAfter: users.deleteAfter,
    })
    .from(users)
    .where(condition);
  return user ?? null;
}

/**
 * The `operator` command (ADR 0028): the only way to give or take away the
 * operator role. Its audit entries name the account itself, with no
 * console session and no request, because it runs on the server.
 * Answers the exit code: 0 done, 1 refused, 2 used wrongly.
 */
export async function runOperatorCommand(
  args: readonly string[],
  dependencies: OperatorCommandDependencies,
): Promise<number> {
  const { db, adminOrigin, passkeys, sessions, write } = dependencies;
  const [action, who, ...rest] = args;

  if (action === "list" && who === undefined) {
    const rows = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        status: users.status,
        passkeys: count(operatorPasskeys.id),
      })
      .from(users)
      .leftJoin(operatorPasskeys, eq(operatorPasskeys.userId, users.id))
      .where(sql`${operatorRole} = any(${users.roles})`)
      .groupBy(users.id)
      .orderBy(asc(users.createdAt));
    if (rows.length === 0) write("No operators yet.");
    for (const row of rows) {
      const suspended = row.status === "active" ? "" : "  (suspended)";
      write(
        `${row.id}  ${row.firstName ?? "(no name)"}  ${String(row.passkeys)} passkeys${suspended}`,
      );
    }
    return 0;
  }

  if ((action !== "add" && action !== "remove") || who === undefined || rest.length > 0) {
    write(usage);
    return 2;
  }

  const account = await findAccount(db, who);
  if (account === null) {
    write("No account has that user ID or phone number.");
    return 1;
  }
  const operator = { userId: account.id, sessionId: null };

  if (action === "add") {
    if (adminOrigin === undefined) {
      write("ADMIN_ORIGIN is not set, so the console's sign-in is off.");
      return 1;
    }
    if (account.status !== "active") {
      write("This account is suspended, so it cannot use the console.");
      return 1;
    }
    if (account.deleteAfter !== null) {
      write("This account waits to be deleted, so it cannot use the console.");
      return 1;
    }
    if (!account.roles.includes(operatorRole)) {
      const roles = [...account.roles, operatorRole];
      await db.transaction(async (tx) => {
        await tx.update(users).set({ roles }).where(eq(users.id, account.id));
        await recordAudit(tx, {
          operator,
          action: "operator.role_given",
          subjectType: "user",
          subjectId: account.id,
          before: { roles: account.roles },
          after: { roles },
          request: null,
        });
      });
    }
    const existing = await passkeyCount(db, account.id);
    const { token, expiresAt } = await passkeys.createSetupLink(account.id);
    write(`${account.id} is an operator.`);
    if (existing > 0) {
      write("The account already has passkeys; this link adds another.");
    }
    write(
      `Open this link to save a passkey. It works once, until ${icelandTime.format(expiresAt)} (Iceland time):`,
    );
    write(`${adminOrigin}/admin/setup#${token}`);
    return 0;
  }

  if (!account.roles.includes(operatorRole)) {
    write("That account is not an operator.");
    return 1;
  }
  const roles = account.roles.filter((role) => role !== operatorRole);
  const counts = await db.transaction(async (tx) => {
    // Waits for any setup, sign-in or added passkey of the account still
    // running, and keeps new ones out until the role is gone.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, account.id)).for("update");
    await tx.update(users).set({ roles }).where(eq(users.id, account.id));
    const ended = await sessions.endAllOf(account.id, "role_removed", tx);
    const deleted = await tx
      .delete(operatorPasskeys)
      .where(eq(operatorPasskeys.userId, account.id))
      .returning({ id: operatorPasskeys.id });
    await tx.delete(operatorSetupLinks).where(eq(operatorSetupLinks.userId, account.id));
    await recordAudit(tx, {
      operator,
      action: "operator.role_removed",
      subjectType: "user",
      subjectId: account.id,
      before: { roles: account.roles },
      after: { roles },
      request: null,
    });
    return { ended, deleted: deleted.length };
  });
  write(
    `${account.id} is no longer an operator. Ended ${String(counts.ended)} console sessions and deleted ${String(counts.deleted)} passkeys.`,
  );
  return 0;
}
