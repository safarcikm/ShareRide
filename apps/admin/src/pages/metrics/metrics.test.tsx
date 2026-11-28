import {
  adminMeRoute,
  adminMetricsRoute,
  type AdminMe,
  type AdminMetrics,
  type AdminMetricsWeek,
} from "@shareride/contracts";
import {
  addIsoWeeks,
  emptyWeekMetrics,
  formatIsoWeek,
  isoWeekOf,
  isoWeeksBetween,
  parseIsoWeek,
  startOfIsoWeek,
  type WeekMetrics,
} from "@shareride/domain";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsoleApp } from "../../app.tsx";
import { createFakeApi, createFakePasskeys } from "../../testing/fake-api.ts";

const anna: AdminMe = {
  userId: "0196f000-0000-7000-8000-000000000001",
  firstName: "Anna",
  locale: "en",
  sessionEndsAt: "2026-11-18T23:00:00.000Z",
};

const south = "0196f000-0000-7000-8000-0000000000c1";
const corridors = [
  { id: south, name: "Reykjavík – Selfoss", active: true },
  { id: "0196f000-0000-7000-8000-0000000000c2", name: "West", active: false },
];

const figures: WeekMetrics = {
  ...emptyWeekMetrics,
  searches: { numerator: 1240, denominator: null },
  searches_with_result: { numerator: 31, denominator: 50 },
  seat_fill: { numerator: 250_000, denominator: 1_000_000 },
  reports_per_trip: { numerator: 2, denominator: 400 },
  report_answer_minutes: { numerator: 630, denominator: 3 },
  money_paid: { numerator: 125_000, denominator: null },
  car_km_saved: { numerator: 634, denominator: null },
  co2_saved_grams: { numerator: 95_900, denominator: null },
};

/** What the API would answer: the weeks asked for, the last one counted. */
function answer(query: { from?: string; to?: string; corridor?: string }): AdminMetrics {
  const to = parseIsoWeek(query.to ?? "") ?? isoWeekOf(new Date());
  const from = parseIsoWeek(query.from ?? "") ?? addIsoWeeks(to, -7);
  const weeks = isoWeeksBetween(from, to).map((week, index, all): AdminMetricsWeek => ({
    week: formatIsoWeek(week),
    startsOn: startOfIsoWeek(week).toISOString().slice(0, 10),
    metrics:
      index === all.length - 1
        ? query.corridor === south
          ? { ...figures, searches: { numerator: 77, denominator: null } }
          : figures
        : index === all.length - 2
          ? { ...emptyWeekMetrics, searches: { numerator: 620, denominator: null } }
          : null,
    computedAt: index >= all.length - 2 ? "2026-11-18T03:00:10.000Z" : null,
  }));
  return {
    corridorId: query.corridor ?? null,
    weeks,
    exitCriteria: {
      from: "2026-W43",
      to: "2026-W46",
      criteria: [
        { key: "searches_with_result", status: "met", numerator: 31, denominator: 50 },
        {
          key: "requests_per_search_with_result",
          status: "not_met",
          numerator: 3,
          denominator: 31,
        },
        { key: "driver_cancellations", status: "met", numerator: 0, denominator: 12 },
        { key: "seat_fill", status: "not_met", numerator: 250_000, denominator: 1_000_000 },
        { key: "repeat_passengers", status: "no_data", numerator: 0, denominator: 0 },
        { key: "reports_answered_late", status: "no_data", numerator: 0, denominator: 0 },
      ],
    },
    corridors,
  };
}

function start(path = "/admin/metrics") {
  window.history.replaceState(null, "", path);
  const api = createFakeApi();
  api.on(adminMeRoute, { status: 200, data: anna });
  api.on(adminMetricsRoute, (input) => ({
    status: 200,
    data: answer(input["query"] as Parameters<typeof answer>[0]),
  }));
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  return { api };
}

const row = async (name: string) => {
  const header = await screen.findByRole("rowheader", { name });
  const found = header.closest("tr");
  if (found === null) throw new Error(`"${name}" is not in a row.`);
  return within(found)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);
};

describe("the Metrics page", () => {
  it("is in the menu", async () => {
    start("/admin");
    const menu = await screen.findByRole("navigation", { name: "Console menu" });
    fireEvent.click(within(menu).getByRole("link", { name: "Metrics" }));
    expect(await screen.findByRole("heading", { name: "Metrics", level: 1 })).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/metrics");
  });

  it("asks for the last 8 weeks of everything", async () => {
    const { api } = start();
    await screen.findByRole("heading", { name: "Week by week" });
    const to = isoWeekOf(new Date());
    expect(api.called(adminMetricsRoute).at(-1)?.input).toEqual({
      query: { from: formatIsoWeek(addIsoWeeks(to, -7)), to: formatIsoWeek(to) },
    });
  });

  it("shows each exit criterion with its status in words and its share", async () => {
    start();
    const panel = within(await screen.findByRole("region", { name: "Exit criteria of the beta" }));
    expect(
      panel.getByText(
        "Weeks 43 to 46, the last four complete ones, on the corridors that are counted.",
      ),
    ).toBeTruthy();
    const items = panel.getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual([
      "Met At least half of searches show a trip. 62% (31 of 50)",
      "Not met At least 1 in 5 searches with a result leads to a request. 10% (3 of 31)",
      "Met Drivers cancel under 10% of trips with passengers, weather aside. 0% (0 of 12)",
      "Not met At least 30% of offered seat-kilometres are booked. 25%",
      "No data yet At least 30% of passengers had booked within the 60 days before. ",
      "No data yet No report waits more than 24 hours. ",
    ]);
  });

  it("shows every figure week by week: counts, shares, hours and krónur, and a dash for nothing", async () => {
    start();
    const dashes = Array.from({ length: 6 }, () => "–");
    expect(await row("Searches")).toEqual([...dashes, "620", "1,240"]);
    expect(await row("Searches that showed a trip")).toEqual([...dashes, "–", "62%"]);
    expect(await row("Seat fill on completed trips")).toEqual([...dashes, "–", "25%"]);
    expect(await row("Reports per 1,000 trips")).toEqual([...dashes, "–", "5"]);
    expect(await row("Time to answer a report, on average")).toEqual([...dashes, "–", "3.5 h"]);
    expect(await row("Paid by passengers")).toEqual([...dashes, "0 ISK", "125,000 ISK"]);
    expect(screen.getAllByRole("columnheader")).toHaveLength(9);
    const week = isoWeekOf(new Date()).week;
    expect(screen.getByRole("columnheader", { name: `W${String(week)}` })).toBeTruthy();
  });

  it("shows the car km and the CO2 saved, the CO2 in whole kilograms (spec 34, 3.10)", async () => {
    start();
    const dashes = Array.from({ length: 6 }, () => "–");
    expect(await row("Car km saved")).toEqual([...dashes, "0", "634"]);
    expect(await row("CO2 saved (kg)")).toEqual([...dashes, "0", "95"]);
  });

  it("draws the chosen figure as a bar per counted week", async () => {
    start();
    const bars = await screen.findByRole("img", { name: "Bars per week: Searches" });
    expect(bars.querySelectorAll("rect")).toHaveLength(2);
    const week = isoWeekOf(new Date()).week;
    expect(within(bars).getByText(`Week ${String(week)}: 1,240`)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Figure drawn as bars"), {
      target: { value: "searches_with_result" },
    });
    const shares = await screen.findByRole("img", {
      name: "Bars per week: Searches that showed a trip",
    });
    expect(shares.querySelectorAll("rect")).toHaveLength(1);
    expect(within(shares).getByText(`Week ${String(week)}: 62%`)).toBeTruthy();
  });

  it("shows one corridor, more weeks, and offers the same as a CSV file", async () => {
    const { api } = start();
    const picker = await screen.findByLabelText<HTMLSelectElement>("Corridor");
    expect(Array.from(picker.options).map((option) => option.textContent)).toEqual([
      "Everything",
      "Reykjavík – Selfoss",
      "West (not counted now)",
    ]);
    fireEvent.change(picker, { target: { value: south } });
    await waitFor(async () => {
      expect((await row("Searches")).at(-1)).toBe("77");
    });
    fireEvent.change(screen.getByLabelText("Weeks shown"), { target: { value: "13" } });
    await waitFor(() => {
      expect(screen.getAllByRole("columnheader")).toHaveLength(14);
    });
    const to = isoWeekOf(new Date());
    const from = formatIsoWeek(addIsoWeeks(to, -12));
    expect(api.called(adminMetricsRoute).at(-1)?.input).toEqual({
      query: { from, to: formatIsoWeek(to), corridor: south },
    });
    const link = screen.getByRole<HTMLAnchorElement>("link", { name: "Download CSV" });
    expect(link.getAttribute("href")).toBe(
      `/admin/v1/metrics.csv?from=${from}&to=${formatIsoWeek(to)}&corridor=${south}`,
    );
    expect(link.hasAttribute("download")).toBe(true);
  });

  it("says when no week has been counted yet", async () => {
    window.history.replaceState(null, "", "/admin/metrics");
    const api = createFakeApi();
    api.on(adminMeRoute, { status: 200, data: anna });
    api.on(adminMetricsRoute, () => {
      const all = answer({});
      return {
        status: 200,
        data: {
          ...all,
          weeks: all.weeks.map((week) => ({ ...week, metrics: null, computedAt: null })),
        },
      };
    });
    render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
    expect(await screen.findByText(/None of these weeks has been counted yet/)).toBeTruthy();
  });

  it("says when the metrics cannot be loaded, and tries again", async () => {
    window.history.replaceState(null, "", "/admin/metrics");
    const api = createFakeApi();
    api.on(adminMeRoute, { status: 200, data: anna });
    api.on(adminMetricsRoute, { status: 500, error: { code: "internal" } });
    render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
    expect(
      (await screen.findByText("The metrics could not be loaded.")).closest('[role="alert"]'),
    ).not.toBeNull();
    api.on(adminMetricsRoute, () => ({ status: 200, data: answer({}) }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Week by week" })).toBeTruthy();
  });
});
