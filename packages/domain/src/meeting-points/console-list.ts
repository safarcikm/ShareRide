// The operator console's list and map of meeting points (spec 2, 3.6.1):
// every point, drafts and retired ones too, with filters.
import {
  isInSeason,
  type MeetingPointStatus,
  type MeetingPointType,
  type Region,
} from "./catalogue.ts";
import { normaliseSearchText } from "./search.ts";

/** What the list filters on. */
export interface ListedMeetingPoint {
  readonly status: string;
  readonly region: string;
  readonly type: string;
  readonly seasonStartMonth: number | null;
  readonly seasonEndMonth: number | null;
  readonly reviewDueOn: string | null;
  /** Problem reports about it still open, each a mark that it needs review (spec 2, 3.5). */
  readonly openIssues: number;
  /** The names and aliases, normalised (`searchTextFor`). */
  readonly searchText: string;
}

/** In use all year, in season this month, or out of season this month. */
export const seasonFilters = ["all-year", "in-season", "out-of-season"] as const;
export type SeasonFilter = (typeof seasonFilters)[number];

export interface ConsoleFilters {
  readonly status?: MeetingPointStatus;
  readonly region?: Region;
  readonly type?: MeetingPointType;
  readonly season?: SeasonFilter;
  readonly reviewOverdue?: boolean;
  /** Only points with an open problem report. */
  readonly openIssues?: boolean;
  /** Part of a name or alias, as typed (R2.6). */
  readonly q?: string;
}

/** Overdue from the day after its yearly review was due (R2.9); a draft has no date. */
export function isReviewOverdue(reviewDueOn: string | null, today: string): boolean {
  return reviewDueOn !== null && reviewDueOn < today;
}

function matchesSeason(point: ListedMeetingPoint, filter: SeasonFilter, month: number): boolean {
  if (filter === "all-year") return point.seasonStartMonth === null;
  return isInSeason(point, month) === (filter === "in-season");
}

/**
 * Whether a point matches every filter given. `month` (1 to 12) and
 * `today` are now in Iceland.
 */
export function matchesConsoleFilters(
  point: ListedMeetingPoint,
  filters: ConsoleFilters,
  now: { readonly month: number; readonly today: string },
): boolean {
  const query = normaliseSearchText(filters.q ?? "");
  return (
    (filters.status === undefined || point.status === filters.status) &&
    (filters.region === undefined || point.region === filters.region) &&
    (filters.type === undefined || point.type === filters.type) &&
    (filters.season === undefined || matchesSeason(point, filters.season, now.month)) &&
    (filters.reviewOverdue !== true || isReviewOverdue(point.reviewDueOn, now.today)) &&
    (filters.openIssues !== true || point.openIssues > 0) &&
    (query === "" || point.searchText.includes(query))
  );
}
