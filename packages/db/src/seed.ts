import type { Database } from "./index.ts";
import { seedSampleMeetingPoints } from "./sample/seed.ts";
import { seedSampleTrips } from "./sample/trips.ts";
import { inviteCodes, legalDocuments, type LegalText } from "./schema/index.ts";

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

export { samplePoints } from "./sample/meeting-points.ts";
export { sampleId, sampleLegSource, seedSampleMeetingPoints } from "./sample/seed.ts";
export { sampleTrips, seedSampleTrips } from "./sample/trips.ts";

/**
 * The invite code of local development, to sign up with while the beta is
 * closed. It is public, so it is seeded by the local seed command alone
 * (`seed-cli.ts`): never by `seedDevelopmentData`, which staging runs on
 * every deploy and where it would let anyone past the gate.
 */
export const developmentInviteCode = "BETA2345";

/** Makes the development invite code once; one that is there, ended or not, is left alone. */
export async function seedDevelopmentInviteCode(db: Database, now: Date): Promise<void> {
  await db
    .insert(inviteCodes)
    .values({
      code: developmentInviteCode,
      kind: "group",
      name: "Development",
      usesAllowed: 500,
      expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: inviteCodes.code });
}

/**
 * What local development and staging start with: the draft legal documents,
 * the sample meeting points, places and legs (milestone 3, decision 1) and
 * sample trips in the next days.
 */
export async function seedDevelopmentData(db: Database, now: Date): Promise<void> {
  await seedDraftLegalDocuments(db, now);
  await seedSampleMeetingPoints(db, now);
  await seedSampleTrips(db, now);
}
