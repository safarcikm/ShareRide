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
  {
    // Google Analytics on the website, only after the visitor accepts (spec
    // 23, ADR 0045). Not material: nobody has to accept anything new.
    type: "privacy",
    version: 3,
    material: false,
    title: { en: "Privacy Policy", is: "Persónuverndarstefna" },
    summary: {
      en: "The website can count visits with Google Analytics, only if you accept, and you can turn it off on the Cookies page.",
      is: "Vefurinn getur talið heimsóknir með Google Analytics, aðeins ef þú samþykkir, og þú getur slökkt á því á síðunni Vafrakökur.",
    },
    sha256: {
      en: "d5bcddb792c41aad628bd8c86d0e593186c83491b52c6910a391e32d34aba853",
      is: "5667071cec558d164f11dd18ddc5c0e72bde60ce429c765b26e245bb32d2553d",
    },
  },
  {
    // Settings went with spec 31: its pages are under Profile. The two
    // sentences that said "in Settings" name the page now. Not material:
    // no rule changes, only where a thing is done.
    type: "terms",
    version: 3,
    material: false,
    title: { en: "Terms of Service", is: "Notendaskilmálar" },
    summary: {
      en: 'Where the terms said "in Settings", they name the page in Profile. Nothing else changed.',
      is: "Þar sem áður stóð „í Stillingum“ nefna skilmálarnir nú síðuna í Prófílnum. Annað breyttist ekki.",
    },
    sha256: {
      en: "d09e06652c6cbe772051d61b3187adec388b2ba2b2d90289151619a48152e426",
      is: "6e35bf4787a6095d197664df9bbfa58371e47895c3d17189c3b392aafe2f1b18",
    },
  },
  {
    // The pages under Profile where it said "in Settings" (spec 31) and
    // About PuffinRide where it said "Terms, rules and privacy" (spec 30),
    // and what the phone apps add: Expo's check for an update, the two
    // stores and their testing (spec 32, section 7). Not material: nobody
    // has to accept anything new, and testers are invited one by one.
    type: "privacy",
    version: 4,
    material: false,
    title: { en: "Privacy Policy", is: "Persónuverndarstefna" },
    summary: {
      en: 'It names the pages in Profile where it said "in Settings", and the Cookies page under About PuffinRide. It also says what the phone apps add: the app asks Expo whether there is an update, Google Play and the App Store handle downloads, ratings and crash reports, and people who test the app before release are invited by email.',
      is: "Hún nefnir síðurnar í Prófílnum þar sem áður stóð „í stillingum“, og síðuna Vafrakökur undir Um PuffinRide. Hún segir einnig hvað símaöppin bæta við: appið spyr Expo hvort uppfærsla sé til, Google Play og App Store sjá um niðurhal, einkunnir og hrunskýrslur, og þeim sem prófa appið fyrir útgáfu er boðið með tölvupósti.",
    },
    sha256: {
      en: "6f12c97e7e1fb2f65eaf6819ec0570eb5047abe779ad447ed6317a93bd53718d",
      is: "4aafc96a7dc40388e20ef67746347aa5eea74b21f80247a6883da66c004e2d77",
    },
  },
  {
    // How people sign in since specs 26 and 27: a code by email, Google or
    // Apple, a password, Face ID or fingerprint, and a text message only
    // to check a phone number. The terms said "a code sent to your phone".
    // Not material: no rule changes and no new duty (3.2 still asks people
    // to keep the phone and the sign-in methods secure, as version 3 did);
    // the text catches up with the app.
    type: "terms",
    version: 4,
    material: false,
    title: { en: "Terms of Service", is: "Notendaskilmálar" },
    summary: {
      en: "The terms say how you sign in now: with a code by email, with Google or Apple, with a password or with Face ID or fingerprint. A text message checks your phone number and never signs you in by itself. Nothing else changed.",
      is: "Skilmálarnir segja nú hvernig þú skráir þig inn: með kóða í tölvupósti, með Google eða Apple, með lykilorði eða með Face ID eða fingrafari. SMS staðfestir símanúmerið þitt og skráir þig aldrei inn eitt og sér. Annað breyttist ekki.",
    },
    sha256: {
      en: "7bc2e0413ad8f434c5b0ea78b0ecac14e1e44c7a05b0b4211ff61106b61689ba",
      is: "f81a4853b850895f6ee2a0b38c90f8ce06173098b618361acbfe8cde52c77f24",
    },
  },
  {
    // The same for the Privacy Policy, with what is kept of a password
    // (a hash, never the password) and of Face ID or fingerprint (a
    // passkey's public key, never anything biometric), specs 26, 27 and
    // 29. Not material: the register already lists it, and nobody has to
    // accept anything new.
    type: "privacy",
    version: 5,
    material: false,
    title: { en: "Privacy Policy", is: "Persónuverndarstefna" },
    summary: {
      en: "It says what we keep if you set a password (never the password itself) or set up Face ID or fingerprint (a passkey's public key, never your face or fingerprint), that we may ask your browser to save such a passkey after you sign in with a password, and where you remove them. It also says which codes come by email and which by text message, and that the record of an ended sign-in is kept 30 days.",
      is: "Hún segir hvað við geymum ef þú velur þér lykilorð (aldrei lykilorðið sjálft) eða setur upp Face ID eða fingrafar (opinberan lykil aðgangslykils, aldrei andlit þitt eða fingrafar), að við getum beðið vafrann þinn að vista slíkan aðgangslykil eftir að þú skráir þig inn með lykilorði, og hvar þú fjarlægir þau. Hún segir einnig hvaða kóðar koma í tölvupósti og hvaða með SMS, og að skrá um innskráningu sem er lokið er geymd í 30 daga.",
    },
    sha256: {
      en: "ca51eec2a3234d0abeb408da37313f754e6847ced007a94831f2cf8850f7d959",
      is: "8d280e26fd747e61fbc6083f2d9ebbeba22ab03f2d05b057ac05c39410f8136b",
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
