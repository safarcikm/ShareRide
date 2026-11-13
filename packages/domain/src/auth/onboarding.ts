/** A legal document that people must accept: its type and version. */
export interface DocumentVersion {
  readonly type: string;
  readonly version: number;
}

export interface AccountState {
  readonly phoneVerifiedAt: Date | null;
  readonly ageConfirmedAt: Date | null;
  readonly firstName: string | null;
  /** The versions this person has accepted, of any document type. */
  readonly acceptances: readonly DocumentVersion[];
}

/** What a person still has to do before the account is complete. */
export type OnboardingStep = "phone" | "legal" | "profile";

function hasAcceptedCurrent(
  acceptances: readonly DocumentVersion[],
  currentMaterial: readonly DocumentVersion[],
): boolean {
  return currentMaterial.every((document) =>
    acceptances.some(
      (accepted) => accepted.type === document.type && accepted.version >= document.version,
    ),
  );
}

/**
 * The steps still missing, in the order the app asks for them (spec 1,
 * sections 3.2 to 3.5). `currentMaterial` lists, per document that must be
 * accepted, the latest version with a material change (section 3.4).
 */
export function missingSteps(
  account: AccountState,
  currentMaterial: readonly DocumentVersion[],
): OnboardingStep[] {
  const steps: OnboardingStep[] = [];
  if (account.phoneVerifiedAt === null) steps.push("phone");
  if (
    account.ageConfirmedAt === null ||
    !hasAcceptedCurrent(account.acceptances, currentMaterial)
  ) {
    steps.push("legal");
  }
  if (account.firstName === null) steps.push("profile");
  return steps;
}

/**
 * Booking, posting a trip and chatting need a verified phone number, the age
 * confirmation and the current Terms and Community Rules (rules R1.6, R1.7).
 */
export function canUseMemberFeatures(
  account: AccountState,
  currentMaterial: readonly DocumentVersion[],
): boolean {
  return (
    account.phoneVerifiedAt !== null &&
    account.ageConfirmedAt !== null &&
    hasAcceptedCurrent(account.acceptances, currentMaterial)
  );
}
