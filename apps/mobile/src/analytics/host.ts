import type { AnalyticsHost } from "./google-tag";

/** The phone apps have no analytics (spec 23, decision 2). The web's is host.web.ts. */
export const analyticsHost: AnalyticsHost | null = null;
