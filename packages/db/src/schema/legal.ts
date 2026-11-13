import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { at, id, timestamps } from "./columns.ts";
import { users } from "./users.ts";

/** One language's text of a legal document. */
export interface LegalText {
  readonly title: string;
  /** What changed, shown before asking for acceptance again (spec 1, 3.4). */
  readonly summary: string;
  /** Markdown. */
  readonly body: string;
}

/** Versions of the Terms, Community Rules and Privacy Policy. */
export const legalDocuments = pgTable(
  "legal_documents",
  {
    id: id(),
    type: text().notNull(),
    version: integer().notNull(),
    /** A material change asks everyone to accept again (spec 1, 3.4). */
    material: boolean().notNull(),
    texts: jsonb().$type<{ is: LegalText; en: LegalText }>().notNull(),
    publishedAt: at().notNull(),
    ...timestamps,
  },
  (table) => [
    unique("legal_documents_type_version_unique").on(table.type, table.version),
    check(
      "legal_documents_type_check",
      sql`${table.type} in ('terms', 'community-rules', 'privacy')`,
    ),
  ],
);

/** Who accepted which version, when and in which language (spec 1, 3.4). */
export const legalAcceptances = pgTable(
  "legal_acceptances",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    documentId: uuid()
      .notNull()
      .references(() => legalDocuments.id),
    version: integer().notNull(),
    locale: text().notNull(),
    acceptedAt: at().notNull(),
    ...timestamps,
  },
  (table) => [unique("legal_acceptances_user_document_unique").on(table.userId, table.documentId)],
);
