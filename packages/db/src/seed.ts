import type { Database } from "./index.ts";
import { legalDocuments, type LegalText } from "./schema/index.ts";

const draftNotice = {
  en: "**Draft.** This placeholder is for development and the closed beta. The final text will be written with a lawyer before the beta opens.",
  is: "**Drög.** Þessi texti er staðgengill fyrir þróun og lokaða beta-prófun. Endanlegur texti verður saminn með lögfræðingi áður en beta-prófun hefst.",
};

const drafts: { type: string; en: string; is: string }[] = [
  { type: "terms", en: "Terms of Service", is: "Notendaskilmálar" },
  { type: "community-rules", en: "Community Rules", is: "Samfélagsreglur" },
  { type: "privacy", en: "Privacy Policy", is: "Persónuverndarstefna" },
];

function text(title: string, language: "en" | "is"): LegalText {
  return {
    title,
    summary: language === "en" ? "First version." : "Fyrsta útgáfa.",
    body: draftNotice[language],
  };
}

/**
 * Adds version 1 of the Terms, Community Rules and Privacy Policy as drafts,
 * so sign-up works locally and in tests. Existing documents are left alone.
 */
export async function seedDraftLegalDocuments(db: Database, now: Date): Promise<void> {
  await db
    .insert(legalDocuments)
    .values(
      drafts.map((draft) => ({
        type: draft.type,
        version: 1,
        material: true,
        texts: { en: text(draft.en, "en"), is: text(draft.is, "is") },
        publishedAt: now,
      })),
    )
    .onConflictDoNothing();
}
