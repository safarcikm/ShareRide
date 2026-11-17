import type { ReportCategory, ReportOutcome } from "@shareride/domain";
import type { MessageKey, Translate } from "./translator.ts";

// Reports are stored as codes and put into words in the reader's language:
// by the app, and by the API for "Download my data".

const reportCategoryKeys: Readonly<Record<ReportCategory, MessageKey>> = {
  safety: "report.category.safety",
  harassment: "report.category.harassment",
  discrimination: "report.category.discrimination",
  scam: "report.category.scam",
  false_info: "report.category.false",
  offensive: "report.category.offensive",
  not_as_listed: "report.category.notAsListed",
  other: "report.category.other",
};

/** What happened, as spec 9's texts name the categories (3.1.2). */
export function reportCategoryText(t: Translate, category: ReportCategory): string {
  return t(reportCategoryKeys[category]);
}

const reportOutcomeKeys: Readonly<Record<ReportOutcome, MessageKey>> = {
  action_taken: "report.outcomeAction",
  no_breach: "report.outcomeNone",
};

/** What a closed report found, in general terms (3.1.7). */
export function reportOutcomeText(t: Translate, outcome: ReportOutcome): string {
  return t(reportOutcomeKeys[outcome]);
}
