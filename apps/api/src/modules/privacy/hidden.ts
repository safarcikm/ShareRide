import { schema } from "@shareride/db";
import { sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

// Who nobody sees, books or messages any more (spec 11, 3.4.3 and 3.5): a
// person deleting their account, and the one shared former member that
// erased accounts' trips and bookings move to.

const { formerMemberId } = schema;

interface PersonColumns {
  readonly id: PgColumn;
  readonly deleteAfter: PgColumn;
}

/** Whether the person is hidden from everyone. */
export function isHidden(person: {
  readonly id: string;
  readonly deleteAfter: Date | null;
}): boolean {
  return person.deleteAfter !== null || person.id === formerMemberId;
}

/** The users rows (or an alias of them) of people hidden from everyone. */
export function hidden(person: PersonColumns): SQL {
  return sql`(${person.deleteAfter} is not null or ${person.id} = ${formerMemberId})`;
}

/** The users rows (or an alias of them) of people everyone can see. */
export function shown(person: PersonColumns): SQL {
  return sql`(${person.deleteAfter} is null and ${person.id} <> ${formerMemberId})`;
}
