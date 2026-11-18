import {
  fewerThanFive,
  metricKeys,
  peopleMetrics,
  type MetricKey,
  type WeekMetrics,
} from "./weekly.ts";
import { formatIsoWeek, startOfIsoWeek, type IsoWeek } from "./weeks.ts";

// The figures as a CSV file (spec 10, 3.4.4). The file leaves the console,
// so a figure about fewer than 5 people reads "<5" in it (section 7).

export const metricsCsvHeader = "week,starts_on,corridor,metric,numerator,denominator";

const quoted = (text: string) => `"${text.replaceAll('"', '""')}"`;

const shown = (metric: MetricKey, value: number | null): string => {
  if (value === null) return "";
  return peopleMetrics.includes(metric) && fewerThanFive(value) ? "<5" : String(value);
};

/**
 * One line per week and metric, oldest week first, under the header.
 * `corridor` is the corridor's name, or "all". A week not counted yet has
 * no lines.
 */
export function metricsCsv(
  corridor: string,
  weeks: readonly { readonly week: IsoWeek; readonly metrics: WeekMetrics | null }[],
): string {
  const lines = weeks.flatMap(({ week, metrics }) =>
    metrics === null
      ? []
      : metricKeys.map((metric) =>
          [
            formatIsoWeek(week),
            startOfIsoWeek(week).toISOString().slice(0, 10),
            quoted(corridor),
            metric,
            shown(metric, metrics[metric].numerator),
            shown(metric, metrics[metric].denominator),
          ].join(","),
        ),
  );
  return `${[metricsCsvHeader, ...lines].join("\r\n")}\r\n`;
}
