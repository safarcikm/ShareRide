import { addIsoWeeks, formatIsoWeek, isoWeekOf, isoWeeksBetween } from "@shareride/domain";
import type { WeeklyMetricsService } from "./weekly.ts";

export interface MetricsCommandDependencies {
  readonly metrics: Pick<WeeklyMetricsService, "compute">;
  readonly clock: () => Date;
  readonly write: (line: string) => void;
}

const usage = [
  "Usage:",
  "  metrics recompute <weeks>  count the weekly figures again, for this week and the ones before it (1 to 53 weeks)",
].join("\n");

/**
 * The `metrics` command: counts more weeks again than the nightly run's
 * three, such as after a corridor is added or changed (spec 10, 3.4.4).
 * Returns the exit code.
 */
export async function runMetricsCommand(
  args: readonly string[],
  { metrics, clock, write }: MetricsCommandDependencies,
): Promise<number> {
  const [command, count, ...rest] = args;
  const weeks = Number(count);
  if (
    command !== "recompute" ||
    count === undefined ||
    !/^\d{1,2}$/.test(count) ||
    weeks < 1 ||
    weeks > 53 ||
    rest.length > 0
  ) {
    write(usage);
    return 1;
  }
  const last = isoWeekOf(clock());
  const first = addIsoWeeks(last, -(weeks - 1));
  await metrics.compute(isoWeeksBetween(first, last));
  write(`Counted ${formatIsoWeek(first)} to ${formatIsoWeek(last)}.`);
  return 0;
}
