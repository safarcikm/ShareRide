import type { Database } from "@shareride/db";
import {
  holdEndsAt,
  holdSubjectKinds,
  icelandTimeZone,
  retentionRules,
  type HoldSubjectKind,
} from "@shareride/domain";
import { findAccount } from "../admin/operator-command.ts";
import type { BeforeRestore, Erasure } from "./erasure.ts";
import { createHolds, type EndHoldError, type SetHoldError } from "./holds.ts";
import { createPrivacyRequests, type AnswerError } from "./requests.ts";
import { lastRuns } from "./retention.ts";

/** Reads the database in use before the restore. */
export type ReadBeforeRestore = () => Promise<BeforeRestore>;

export interface PrivacyCommandDependencies {
  readonly db: Database;
  readonly clock: () => Date;
  readonly erasure: Pick<Erasure, "reapply">;
  /** Undefined when the old database is not given (or lost). */
  readonly before: ReadBeforeRestore | undefined;
  readonly write: (line: string) => void;
}

const usage = [
  "Usage:",
  "  privacy runs                 the last run of each retention rule",
  "  privacy holds                the holds in force, nearest end first",
  '  privacy hold <user|trip|booking> <ID> --until <YYYY-MM-DD> --reason "<why>" --by <operator>',
  "                               keep its records past their date, through that day (Iceland time)",
  "  privacy end-hold <hold ID> --by <operator>",
  "                               end a hold before its day",
  "  privacy requests             the requests about people's data waiting for an answer, nearest due first",
  '  privacy answer <request ID> --text "<answer>" --by <operator>',
  "                               answer a request: the answer goes to the person by email",
  "  privacy reapply-erasures     after a restore, erase again every erased account that came back",
  "                               (PREVIOUS_DATABASE_URL: the old database, for what changed there since)",
  "<operator> is the operator's user ID or phone number, for the audit log.",
].join("\n");

const counted = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const icelandTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: icelandTimeZone,
  dateStyle: "medium",
  timeStyle: "short",
});

const icelandDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: icelandTimeZone,
  dateStyle: "medium",
});

// Control characters and direction marks, other than a tab: in a terminal
// they could move the cursor, rewrite lines or turn text around.
const steering =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

/** A person's text as the terminal should show it: each such character as its code. */
const shown = (line: string) =>
  line.replace(
    steering,
    (char) => `\\u${(char.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`,
  );

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `--name value` pairs, each of `names` once; null when anything else is there. */
function options<Name extends string>(
  args: readonly string[],
  names: readonly Name[],
): Record<Name, string> | null {
  const found: Partial<Record<Name, string>> = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]?.replace(/^--/, "") as Name | undefined;
    const value = args[index + 1];
    if (name === undefined || !args[index]?.startsWith("--") || !names.includes(name)) return null;
    if (value === undefined || name in found) return null;
    found[name] = value;
  }
  return names.every((name) => name in found) ? (found as Record<Name, string>) : null;
}

const setHoldMessages = (kind: HoldSubjectKind) =>
  ({
    hold_reason_required: "A hold needs a reason.",
    hold_end_not_future: "That day has passed.",
    subject_not_found: `No ${kind} has that ID.`,
    not_an_operator: "That account is not an operator.",
  }) satisfies Record<SetHoldError["code"], string>;

const endHoldMessages = {
  hold_not_found: "No hold has that ID.",
  hold_already_ended: "That hold has already ended.",
  not_an_operator: "That account is not an operator.",
} satisfies Record<EndHoldError["code"], string>;

const answerMessages = {
  request_answer_invalid: "An answer needs some text.",
  request_not_found: "No request has that ID.",
  request_already_answered: "That request has already been answered.",
  not_an_operator: "That account is not an operator.",
} satisfies Record<AnswerError["code"], string>;

/**
 * The `privacy` command (plan, decision 3), for the operator until the
 * console has privacy pages. Answers the exit code: 0 done, 1 refused or
 * an account failed, 2 used wrongly.
 */
export async function runPrivacyCommand(
  args: readonly string[],
  dependencies: PrivacyCommandDependencies,
): Promise<number> {
  const { db, clock, write } = dependencies;
  const [action, ...rest] = args;
  const holds = createHolds({ db, clock });
  const requests = createPrivacyRequests({ db, clock });

  /** The operator named by `--by`, or null once it has said why not. */
  const operatorOf = async (who: string) => {
    const account = await findAccount(db, who);
    if (account === null) write("No account has that user ID or phone number.");
    return account?.id ?? null;
  };

  switch (action) {
    case "reapply-erasures":
      if (rest.length > 0) break;
      return reapplyErasures(dependencies);

    case "runs": {
      if (rest.length > 0) break;
      const last = new Map((await lastRuns(db)).map((run) => [run.rule, run]));
      const width = Math.max(...retentionRules.map((rule) => rule.length));
      write("The last run of each retention rule (Iceland time):");
      for (const rule of retentionRules) {
        const run = last.get(rule);
        const anonymised =
          run === undefined || run.anonymised === 0 ? "" : `, anonymised ${String(run.anonymised)}`;
        write(
          run === undefined
            ? `${rule.padEnd(width)}  never run`
            : `${rule.padEnd(width)}  ${icelandTime.format(run.ranAt)}  erased ${String(run.erased)}${anonymised}`,
        );
      }
      return 0;
    }

    case "holds": {
      if (rest.length > 0) break;
      const inForce = await holds.inForce();
      if (inForce.length === 0) write("No hold is in force.");
      for (const hold of inForce) {
        write(
          `${hold.id}  ${hold.subject.kind} ${hold.subject.id}  until ${icelandTime.format(hold.endsAt)}  ${hold.reason}`,
        );
      }
      return 0;
    }

    case "hold": {
      const [kind, id, ...flags] = rest;
      const given = options(flags, ["until", "reason", "by"]);
      const endsAt = given === null ? null : holdEndsAt(given.until);
      if (
        !holdSubjectKinds.some((known) => known === kind) ||
        id === undefined ||
        given === null ||
        endsAt === null
      ) {
        break;
      }
      const subjectKind = kind as HoldSubjectKind;
      const operatorUserId = await operatorOf(given.by);
      if (operatorUserId === null) return 1;
      if (!uuidPattern.test(id)) {
        write(setHoldMessages(subjectKind).subject_not_found);
        return 1;
      }
      const result = await holds.set({
        subject: { kind: subjectKind, id: id.toLowerCase() },
        reason: given.reason,
        endsAt,
        operatorUserId,
      });
      if (!result.ok) {
        write(setHoldMessages(subjectKind)[result.error.code]);
        return 1;
      }
      const hold = result.value;
      write(
        `Hold ${hold.id} keeps the records of ${hold.subject.kind} ${hold.subject.id} until ${icelandTime.format(hold.endsAt)} (Iceland time).`,
      );
      return 0;
    }

    case "requests": {
      if (rest.length > 0) break;
      const waiting = await requests.waiting();
      if (waiting.length === 0) write("No request is waiting for an answer.");
      const now = clock();
      for (const request of waiting) {
        const overdue = request.dueAt <= now ? "  overdue" : "";
        write(
          `${request.id}  ${request.kind}  received ${icelandDay.format(request.receivedAt)}  due ${icelandDay.format(request.dueAt)}  user ${request.userId}${overdue}`,
        );
        for (const line of request.text.split("\n")) write(`    ${shown(line)}`);
      }
      return 0;
    }

    case "answer": {
      const [requestId, ...flags] = rest;
      const given = options(flags, ["text", "by"]);
      if (requestId === undefined || given === null) break;
      const operatorUserId = await operatorOf(given.by);
      if (operatorUserId === null) return 1;
      if (!uuidPattern.test(requestId)) {
        write(answerMessages.request_not_found);
        return 1;
      }
      const result = await requests.answer({
        requestId: requestId.toLowerCase(),
        answer: given.text,
        operatorUserId,
      });
      if (!result.ok) {
        write(answerMessages[result.error.code]);
        return 1;
      }
      write(
        result.value.emailed
          ? `Answered request ${result.value.request.id}. The email goes out within a minute.`
          : `Answered request ${result.value.request.id}. No email: the account has been deleted.`,
      );
      return 0;
    }

    case "end-hold": {
      const [holdId, ...flags] = rest;
      const given = options(flags, ["by"]);
      if (holdId === undefined || given === null) break;
      const operatorUserId = await operatorOf(given.by);
      if (operatorUserId === null) return 1;
      if (!uuidPattern.test(holdId)) {
        write(endHoldMessages.hold_not_found);
        return 1;
      }
      const result = await holds.end({ holdId: holdId.toLowerCase(), operatorUserId });
      if (!result.ok) {
        write(endHoldMessages[result.error.code]);
        return 1;
      }
      write(`Hold ${result.value.id} has ended. Its records go once their own dates have passed.`);
      return 0;
    }
  }
  write(usage);
  return 2;
}

async function reapplyErasures({
  erasure,
  before,
  write,
}: PrivacyCommandDependencies): Promise<number> {
  let read: BeforeRestore | undefined;
  if (before !== undefined) {
    read = await before();
    write(
      `The old database lists ${counted(read.erasures.length, "erased account", "erased accounts")}.`,
    );
  }
  const counts = await erasure.reapply(read);
  if (read !== undefined) {
    write(`Deletion dates taken from the old database: ${String(counts.datesTaken)}.`);
  }
  write(
    counts.erased === 0
      ? "No erased account came back with the restore."
      : `Erased again: ${counted(counts.erased, "account", "accounts")} that came back with the restore.`,
  );
  if (counts.failed === 0) return 0;
  write(
    `Failed: ${counted(counts.failed, "account", "accounts")}, each in the log. Fix it and run this again before the services use this database.`,
  );
  return 1;
}
