import { schema, type Database } from "@shareride/db";
import { isAcceptableDocumentType, type DocumentVersion } from "@shareride/domain";
import { and, desc, eq, lte } from "drizzle-orm";

const { legalDocuments } = schema;

export type LegalDocumentRow = typeof legalDocuments.$inferSelect;

export interface LegalService {
  /** The latest published version of each document type. */
  currentDocuments(): Promise<LegalDocumentRow[]>;
  /** The latest published version of one document type, if any. */
  currentDocument(type: string): Promise<LegalDocumentRow | undefined>;
  /**
   * Per document that people accept, the latest version with a material
   * change: what they must have accepted (spec 1, section 3.4).
   */
  currentMaterialVersions(): Promise<DocumentVersion[]>;
}

export function createLegalService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
}): LegalService {
  const { db, clock } = dependencies;

  async function latest(materialOnly: boolean): Promise<LegalDocumentRow[]> {
    const published = lte(legalDocuments.publishedAt, clock());
    return db
      .selectDistinctOn([legalDocuments.type])
      .from(legalDocuments)
      .where(materialOnly ? and(published, eq(legalDocuments.material, true)) : published)
      .orderBy(legalDocuments.type, desc(legalDocuments.version));
  }

  return {
    currentDocuments: () => latest(false),

    async currentDocument(type) {
      const [row] = await db
        .select()
        .from(legalDocuments)
        .where(and(eq(legalDocuments.type, type), lte(legalDocuments.publishedAt, clock())))
        .orderBy(desc(legalDocuments.version))
        .limit(1);
      return row;
    },

    async currentMaterialVersions() {
      const rows = await latest(true);
      return rows
        .filter((row) => isAcceptableDocumentType(row.type))
        .map((row) => ({ type: row.type, version: row.version }));
    },
  };
}
