// The legal documents people see and accept, published from the repository
// (ADR 0043). Each version is a pair of Markdown files in ./texts, one per
// language, listed below with what it is. The migration command publishes
// every listed version the database does not have yet, in every environment,
// before a deploy takes traffic. A published text never changes: a change is
// a new version, so what someone accepted stays what they read.
//
// Version 1 of each document is the placeholder draft that local development,
// tests and staging seed (`seedDraftLegalDocuments`), so versions here start
// at 2, the same number in every environment.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { LegalDocumentType } from "@shareride/domain";
import type { Database } from "../index.ts";
import { legalDocuments, type LegalText } from "../schema/index.ts";

export const languages = ["is", "en"] as const;

export type Language = (typeof languages)[number];

/** One published version of a legal document. */
export interface PublishedVersion {
  readonly type: LegalDocumentType;
  readonly version: number;
  /** A material change: everyone accepts it again (spec 1, 3.4). */
  readonly material: boolean;
  /**
   * When it takes effect, for a change announced ahead (ISO 8601, UTC).
   * Unset: from the deploy that first carries it.
   */
  readonly takesEffect?: string;
  readonly title: Readonly<Record<Language, string>>;
  /** What changed, shown before people accept it again. */
  readonly summary: Readonly<Record<Language, string>>;
  /** SHA-256 of each language's file: a test fails if the text changes. */
  readonly sha256: Readonly<Record<Language, string>>;
}

export const publishedVersions: readonly PublishedVersion[] = [
  {
    type: "terms",
    version: 2,
    material: true,
    title: { en: "Terms of Service", is: "Notendaskilmálar" },
    summary: {
      en: "The full terms for the open beta, in place of the draft.",
      is: "Fullir skilmálar fyrir opnu beta-prófunina, í stað draganna.",
    },
    sha256: {
      en: "b7d40b2e66f677718df501a6f0b21cccc05145cfe9aa26151de93263a7ff02c2",
      is: "034546830777344715173bfb97a703ca97dbaa55217f38af15b25c01c8dcfefa",
    },
  },
  {
    type: "community-rules",
    version: 2,
    material: true,
    title: { en: "Community Rules", is: "Samfélagsreglur" },
    summary: {
      en: "The full rules for the open beta, in place of the draft.",
      is: "Fullar reglur fyrir opnu beta-prófunina, í stað draganna.",
    },
    sha256: {
      en: "344ddff6c45a6aae80666368265cf9af3b1539e11b768ee587a37b4ca10adf65",
      is: "4b20558806b85aa63e02631bfa5392c6e814eacbfa701ce731af882cb3cb881a",
    },
  },
  {
    type: "privacy",
    version: 2,
    material: true,
    title: { en: "Privacy Policy", is: "Persónuverndarstefna" },
    summary: {
      en: "The full policy for the open beta, in place of the draft.",
      is: "Full stefna fyrir opnu beta-prófunina, í stað draganna.",
    },
    sha256: {
      en: "510af2787cc6140d382630e20896c85bdb9049148039243d605d586f76ca0c08",
      is: "f7b068060c037a8e588c2e7ee37540379f34ca607a3b077b666a6872ba8e1d94",
    },
  },
];

/** A version ready to store, its texts read and checked. */
export interface PublishedDocument {
  readonly type: LegalDocumentType;
  readonly version: number;
  readonly material: boolean;
  readonly takesEffect?: Date;
  readonly texts: { readonly is: LegalText; readonly en: LegalText };
}

const fileOf = (version: PublishedVersion, language: Language): URL =>
  new URL(`./texts/${version.type}-v${String(version.version)}.${language}.md`, import.meta.url);

/** A version's text in one language, with Unix line ends whatever the checkout has. */
export const bodyOf = (version: PublishedVersion, language: Language): string =>
  readFileSync(fileOf(version, language), "utf8").replaceAll("\r\n", "\n");

export const sha256Of = (text: string): string => createHash("sha256").update(text).digest("hex");

/** Every listed version, read from its files; throws if a published text has changed. */
export function publishedDocuments(): PublishedDocument[] {
  return publishedVersions.map((version) => {
    const textIn = (language: Language): LegalText => {
      const body = bodyOf(version, language);
      if (sha256Of(body) !== version.sha256[language]) {
        throw new Error(
          `${fileOf(version, language).pathname} has changed since it was published: ` +
            "publish a new version instead.",
        );
      }
      return {
        title: version.title[language],
        summary: version.summary[language],
        body: body.trim(),
      };
    };
    return {
      type: version.type,
      version: version.version,
      material: version.material,
      ...(version.takesEffect === undefined ? {} : { takesEffect: new Date(version.takesEffect) }),
      texts: { is: textIn("is"), en: textIn("en") },
    };
  });
}

/**
 * Publishes the versions the database does not have yet, and returns how
 * many. A version it has is left exactly as it is.
 */
export async function publishLegalDocuments(
  db: Database,
  now: Date,
  documents: readonly PublishedDocument[] = publishedDocuments(),
): Promise<number> {
  if (documents.length === 0) return 0;
  const inserted = await db
    .insert(legalDocuments)
    .values(
      documents.map((document) => ({
        type: document.type,
        version: document.version,
        material: document.material,
        texts: document.texts,
        publishedAt: document.takesEffect ?? now,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: legalDocuments.id });
  return inserted.length;
}
