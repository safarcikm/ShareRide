import { err, ok, type Result } from "../result.ts";
import type { DocumentVersion } from "./onboarding.ts";

/** Legal documents the app shows (spec 1, section 3.4). */
export const legalDocumentTypes = ["terms", "community-rules", "privacy"] as const;

export type LegalDocumentType = (typeof legalDocumentTypes)[number];

/**
 * Documents people accept. The Privacy Policy must be shown, but it is
 * information, not something to accept.
 */
export const acceptableDocumentTypes = ["terms", "community-rules"] as const;

export type AcceptableDocumentType = (typeof acceptableDocumentTypes)[number];

export function isAcceptableDocumentType(type: string): type is AcceptableDocumentType {
  return (acceptableDocumentTypes as readonly string[]).includes(type);
}

export type AcceptanceError =
  | { readonly code: "legal_document_not_acceptable"; readonly type: string }
  | { readonly code: "legal_version_outdated"; readonly type: string };

/**
 * Whether these acceptances can be recorded: each names a document people
 * accept, at most once, at its current version (`current`, one entry per
 * type), so people accept exactly what they were shown.
 */
export function checkAcceptance(
  accepted: readonly DocumentVersion[],
  current: readonly DocumentVersion[],
): Result<undefined, AcceptanceError> {
  const seen = new Set<string>();
  for (const document of accepted) {
    if (!isAcceptableDocumentType(document.type) || seen.has(document.type)) {
      return err({ code: "legal_document_not_acceptable", type: document.type });
    }
    seen.add(document.type);
    const latest = current.find((candidate) => candidate.type === document.type);
    if (latest?.version !== document.version) {
      return err({ code: "legal_version_outdated", type: document.type });
    }
  }
  return ok(undefined);
}
