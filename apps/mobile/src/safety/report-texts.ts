import type { ReportCategory } from "@shareride/domain";
import type { MessageKey } from "@shareride/i18n";

/** The categories as spec 9's texts name them (3.1.2). */
export const categoryKeys = {
  safety: "report.category.safety",
  harassment: "report.category.harassment",
  discrimination: "report.category.discrimination",
  scam: "report.category.scam",
  false_info: "report.category.false",
  offensive: "report.category.offensive",
  not_as_listed: "report.category.notAsListed",
  other: "report.category.other",
} as const satisfies Record<ReportCategory, MessageKey>;
