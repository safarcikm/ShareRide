import type { Me } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  checkAcceptance,
  err,
  missingSteps,
  ok,
  validateProfileChanges,
  type AcceptanceError,
  type DocumentVersion,
  type ProfileChanges,
  type ProfileError,
  type Result,
} from "@shareride/domain";
import type { Locale } from "@shareride/i18n";
import { eq } from "drizzle-orm";
import type { LegalService } from "../legal/index.ts";

const { legalAcceptances, legalDocuments, users } = schema;

export interface Acceptance {
  readonly ageConfirmed?: true | undefined;
  readonly documents: readonly DocumentVersion[];
  readonly locale: Locale;
}

export interface AccountService {
  me(userId: string): Promise<Me>;
  updateMe(
    userId: string,
    changes: ProfileChanges & { readonly locale?: Locale | undefined },
  ): Promise<Result<Me, ProfileError>>;
  accept(userId: string, acceptance: Acceptance): Promise<Result<Me, AcceptanceError>>;
}

export function createAccountService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly legal: LegalService;
}): AccountService {
  const { db, clock, legal } = dependencies;

  async function me(userId: string): Promise<Me> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (user === undefined) throw new Error("The signed-in user does not exist.");
    const acceptances = await db
      .select({ type: legalDocuments.type, version: legalAcceptances.version })
      .from(legalAcceptances)
      .innerJoin(legalDocuments, eq(legalDocuments.id, legalAcceptances.documentId))
      .where(eq(legalAcceptances.userId, userId));
    const steps = missingSteps({ ...user, acceptances }, await legal.currentMaterialVersions());
    return {
      id: user.id,
      phoneNumber: user.phoneE164,
      firstName: user.firstName,
      about: user.about,
      languages: user.languages,
      locale: user.locale === "is" ? "is" : "en",
      email: user.email,
      ageConfirmed: user.ageConfirmedAt !== null,
      memberSince: user.createdAt.toISOString(),
      missingSteps: steps,
    };
  }

  return {
    me,

    async updateMe(userId, changes) {
      const valid = validateProfileChanges(changes);
      if (!valid.ok) return valid;
      const { firstName, about, languages } = valid.value;
      await db
        .update(users)
        .set({
          ...(firstName === undefined ? {} : { firstName }),
          ...(about === undefined ? {} : { about }),
          ...(languages === undefined ? {} : { languages: [...languages] }),
          ...(changes.locale === undefined ? {} : { locale: changes.locale }),
          updatedAt: clock(),
        })
        .where(eq(users.id, userId));
      return ok(await me(userId));
    },

    async accept(userId, acceptance) {
      const current = await legal.currentDocuments();
      const check = checkAcceptance(acceptance.documents, current);
      if (!check.ok) return err(check.error);
      const now = clock();
      await db.transaction(async (tx) => {
        await tx
          .insert(legalAcceptances)
          .values(
            acceptance.documents.map((document) => {
              const row = current.find((candidate) => candidate.type === document.type);
              if (row === undefined)
                throw new Error("checkAcceptance let an unknown type through.");
              return {
                userId,
                documentId: row.id,
                version: row.version,
                locale: acceptance.locale,
                acceptedAt: now,
                createdAt: now,
                updatedAt: now,
              };
            }),
          )
          .onConflictDoNothing();
        if (acceptance.ageConfirmed === true) {
          const [user] = await tx
            .select({ ageConfirmedAt: users.ageConfirmedAt })
            .from(users)
            .where(eq(users.id, userId));
          if (user?.ageConfirmedAt === null) {
            await tx
              .update(users)
              .set({ ageConfirmedAt: now, updatedAt: now })
              .where(eq(users.id, userId));
          }
        }
      });
      return ok(await me(userId));
    },
  };
}
