import {
  adminMetricsCsvPath,
  adminMetricsRoute,
  type AdminMetrics,
  type AdminMetricsWeek,
} from "@shareride/contracts";
import {
  addIsoWeeks,
  formatIsoWeek,
  isoWeekOf,
  metricKeys,
  parseIsoWeek,
  type MetricKey,
  type MetricValue,
} from "@shareride/domain";
import { formatCount, formatDate, formatMoney, type Locale } from "@shareride/i18n";
import { useCallback, useEffect, useId, useState } from "react";
import { useConsole } from "../../console.tsx";

type Loaded =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly metrics: AdminMetrics };

type Translate = ReturnType<typeof useConsole>["t"];

const weekChoices = [8, 13, 26] as const;

/** How a metric reads: a count, a share, or one of those with a unit of their own. */
const kindOf = (
  metric: MetricKey,
): "count" | "share" | "per_thousand" | "hours" | "money" | "kilograms" => {
  switch (metric) {
    case "searches":
    case "trips_posted":
    case "seats_offered":
    case "bookings_confirmed":
    case "seats_booked":
    case "active_drivers":
    case "active_passengers":
    case "car_km_saved":
      return "count";
    case "co2_saved_grams":
      return "kilograms";
    case "reports_per_trip":
      return "per_thousand";
    case "report_answer_minutes":
      return "hours";
    case "money_paid":
    case "money_refunded":
      return "money";
    default:
      return "share";
  }
};

/** The number a metric shows and is drawn by; null while there is nothing to divide by. */
function numberOf(metric: MetricKey, { numerator, denominator }: MetricValue): number | null {
  const kind = kindOf(metric);
  if (kind === "count" || kind === "money") return numerator;
  // Whole kilograms, rounded down, as the apps show them (spec 34, R34.7).
  if (kind === "kilograms") return Math.floor(numerator / 1000);
  if (denominator === null || denominator === 0) return null;
  if (kind === "share") return Math.round((numerator / denominator) * 100);
  if (kind === "per_thousand") return Math.round((numerator / denominator) * 1000);
  return Math.round((numerator / denominator / 60) * 10) / 10;
}

function shown(metric: MetricKey, value: MetricValue, locale: Locale, t: Translate): string {
  const number = numberOf(metric, value);
  if (number === null) return t("admin.metrics.nothing");
  switch (kindOf(metric)) {
    case "share":
      return t("admin.metrics.percent", { value: formatCount(number, locale) });
    case "hours":
      return t("admin.metrics.hours", {
        value: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(number),
      });
    case "money":
      return formatMoney({ amount: number, currency: "ISK" }, locale);
    default:
      return formatCount(number, locale);
  }
}

const weekNumber = (week: string) => parseIsoWeek(week)?.week ?? 0;

/**
 * Metrics (spec 10, 3.4 and screen 4): the beta's exit criteria, and the
 * weekly figures for everything or one corridor, as a table, as bars per
 * week for one metric, and as a CSV file.
 */
export function MetricsPage() {
  const { t, locale, call } = useConsole();
  const [corridor, setCorridor] = useState("");
  const [weeks, setWeeks] = useState<number>(weekChoices[0]);
  const [drawn, setDrawn] = useState<MetricKey>("searches");
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const ids = { corridor: useId(), weeks: useId(), drawn: useId(), table: useId() };

  const [to] = useState(() => isoWeekOf(new Date()));
  const query = {
    from: formatIsoWeek(addIsoWeeks(to, -(weeks - 1))),
    to: formatIsoWeek(to),
    ...(corridor === "" ? {} : { corridor }),
  };
  const { from } = query;
  const until = query.to;

  const load = useCallback(async () => {
    const result = await call(adminMetricsRoute, {
      query: { from, to: until, ...(corridor === "" ? {} : { corridor }) },
    });
    setLoaded(result.ok ? { state: "ready", metrics: result.data } : { state: "failed" });
  }, [call, from, until, corridor]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loaded.state !== "ready") {
    return (
      <section className="stack">
        <h1 className="type-title">{t("admin.metrics.title")}</h1>
        {loaded.state === "loading" ? (
          <p className="type-body" role="status">
            {t("common.loading")}
          </p>
        ) : (
          <div className="stack">
            <p className="problem type-body" role="alert">
              {t("admin.metrics.loadFailed")}
            </p>
            <button
              type="button"
              className="button-secondary type-label"
              onClick={() => {
                setLoaded({ state: "loading" });
                void load();
              }}
            >
              {t("admin.retry")}
            </button>
          </div>
        )}
      </section>
    );
  }

  const { metrics } = loaded;
  const counted = metrics.weeks.some((week) => week.metrics !== null);
  return (
    <section className="stack">
      <h1 className="type-title">{t("admin.metrics.title")}</h1>
      <p className="type-body muted">{t("admin.metrics.intro")}</p>
      <ExitCriteria exit={metrics.exitCriteria} />

      <h2 className="type-heading">{t("admin.metrics.weeklyTitle")}</h2>
      <div className="card stack">
        <div className="field">
          <label htmlFor={ids.corridor} className="type-label">
            {t("admin.metrics.corridor")}
          </label>
          <select
            id={ids.corridor}
            className="input type-body"
            value={corridor}
            onChange={(event) => {
              setCorridor(event.target.value);
            }}
          >
            <option value="">{t("admin.metrics.everything")}</option>
            {metrics.corridors.map((row) => (
              <option key={row.id} value={row.id}>
                {row.active ? row.name : t("admin.metrics.notCounted", { name: row.name })}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={ids.weeks} className="type-label">
            {t("admin.metrics.weeks")}
          </label>
          <select
            id={ids.weeks}
            className="input type-body"
            value={weeks}
            onChange={(event) => {
              setWeeks(Number(event.target.value));
            }}
          >
            {weekChoices.map((count) => (
              <option key={count} value={count}>
                {t("admin.metrics.lastWeeks", { count })}
              </option>
            ))}
          </select>
        </div>
        <div className="actions">
          <a
            className="button-secondary type-label"
            href={`${adminMetricsCsvPath}?${new URLSearchParams(query).toString()}`}
            download
          >
            {t("admin.metrics.download")}
          </a>
        </div>
        <p className="type-small muted">{t("admin.metrics.downloadNote")}</p>
      </div>

      {counted ? null : <p className="notice type-body">{t("admin.metrics.notCountedYet")}</p>}

      <div className="field">
        <label htmlFor={ids.drawn} className="type-label">
          {t("admin.metrics.drawn")}
        </label>
        <select
          id={ids.drawn}
          className="input type-body"
          value={drawn}
          onChange={(event) => {
            setDrawn(event.target.value as MetricKey);
          }}
        >
          {metricKeys.map((metric) => (
            <option key={metric} value={metric}>
              {t(`admin.metrics.metric.${metric}`)}
            </option>
          ))}
        </select>
      </div>
      <Bars metric={drawn} weeks={metrics.weeks} />

      <div className="table-scroll">
        <table className="changes metrics type-small">
          <caption id={ids.table} className="type-label">
            {t("admin.metrics.tableCaption")}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t("admin.metrics.metricColumn")}</th>
              {metrics.weeks.map((week) => (
                <th key={week.week} scope="col">
                  <abbr
                    title={t("admin.metrics.weekFrom", {
                      week: weekNumber(week.week),
                      date: formatDate(week.startsOn, locale),
                    })}
                  >
                    {t("admin.metrics.weekShort", { week: weekNumber(week.week) })}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricKeys.map((metric) => (
              <tr key={metric}>
                <th scope="row">{t(`admin.metrics.metric.${metric}`)}</th>
                {metrics.weeks.map((week) => (
                  <td key={week.week}>
                    {week.metrics === null
                      ? t("admin.metrics.nothing")
                      : shown(metric, week.metrics[metric], locale, t)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="type-small muted">{t("admin.metrics.tableNote")}</p>
    </section>
  );
}

function ExitCriteria({ exit }: { readonly exit: AdminMetrics["exitCriteria"] }) {
  const { t, locale } = useConsole();
  const titleId = useId();
  return (
    <section className="card stack" aria-labelledby={titleId}>
      <h2 id={titleId} className="type-heading">
        {t("admin.metrics.exitTitle")}
      </h2>
      <p className="type-body muted">
        {t("admin.metrics.exitIntro", {
          from: weekNumber(exit.from),
          to: weekNumber(exit.to),
        })}
      </p>
      <ul className="stack exit-criteria">
        {exit.criteria.map((criterion) => (
          <li key={criterion.key} className="type-body">
            <span className={`tag type-small exit-${criterion.status}`}>
              {t(`admin.metrics.status.${criterion.status}`)}
            </span>{" "}
            {t(`admin.metrics.criterion.${criterion.key}`)}{" "}
            {criterion.status === "no_data" ? null : (
              <span className="muted">
                {criterion.key === "seat_fill"
                  ? shown(criterion.key, criterion, locale, t)
                  : t("admin.metrics.share", {
                      percent: shown(criterion.key, criterion, locale, t),
                      numerator: formatCount(criterion.numerator, locale),
                      denominator: formatCount(criterion.denominator, locale),
                    })}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const barWidth = 28;
const barGap = 12;
const chartHeight = 120;
const labelHeight = 18;
const valueHeight = 16;

/** One bar per week for a metric, drawn here: the table below has the same figures. */
function Bars({
  metric,
  weeks,
}: {
  readonly metric: MetricKey;
  readonly weeks: readonly AdminMetricsWeek[];
}) {
  const { t, locale } = useConsole();
  const values = weeks.map((week) =>
    week.metrics === null ? null : numberOf(metric, week.metrics[metric]),
  );
  const most = Math.max(1, ...values.map((value) => value ?? 0));
  const width = weeks.length * (barWidth + barGap) + barGap;
  const height = valueHeight + chartHeight + labelHeight;
  return (
    <svg
      className="metric-bars"
      role="img"
      aria-label={t("admin.metrics.barsLabel", { metric: t(`admin.metrics.metric.${metric}`) })}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
    >
      <line
        className="metric-axis"
        x1={0}
        x2={width}
        y1={valueHeight + chartHeight}
        y2={valueHeight + chartHeight}
      />
      {weeks.map((week, index) => {
        const value = values[index] ?? null;
        const tall = value === null ? 0 : Math.round((value / most) * chartHeight);
        const x = barGap + index * (barWidth + barGap);
        const text =
          week.metrics === null
            ? t("admin.metrics.nothing")
            : shown(metric, week.metrics[metric], locale, t);
        return (
          <g key={week.week}>
            <title>
              {t("admin.metrics.barTitle", { week: weekNumber(week.week), value: text })}
            </title>
            {tall === 0 ? null : (
              <rect
                className="metric-bar"
                x={x}
                y={valueHeight + chartHeight - tall}
                width={barWidth}
                height={tall}
              />
            )}
            <text
              className="metric-bar-label type-small"
              x={x + barWidth / 2}
              y={height - 4}
              textAnchor="middle"
            >
              {weekNumber(week.week)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
