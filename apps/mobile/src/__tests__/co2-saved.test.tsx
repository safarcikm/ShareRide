import { act, fireEvent, screen, within } from "expo-router/testing-library";
import { Dimensions } from "react-native";
import type { Booking } from "@shareride/contracts";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { bookingApi, cancelledBooking, northBooking, paidBooking } from "@/testing/bookings";
import { ok } from "@/testing/fake-client";
import { completedBooking } from "@/testing/reviews";
import { northCo2, northResult, northTrip, tripDetailsApi } from "@/testing/search";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/lib/app-data", () => ({
  readAppData: jest.fn(() => Promise.resolve(null)),
  writeAppData: jest.fn(() => Promise.resolve()),
}));
// Saturday 14 November 2026, noon in Iceland.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));

// The CO2 a shared ride saves, on the screens that show it (spec 34,
// 3.5 to 3.8): one folded card, in the main column.

const id = northResult.tripId;
const how = "Estimated from the road distance and an average car in Iceland.";
const card = () => screen.queryByTestId("co2-card");
const row = (kg: number) =>
  screen.getByRole("button", { name: `CO2 saved, about ${String(kg)} kilograms, estimated` });

/** The screen's parts, in the order they show. */
const parts = () =>
  screen
    .getAllByTestId(/^(part-ticket|driver-card|where-you-sit|whole-route|co2-card|action-rows)$/)
    .map((part) => String(part.props.testID));

/** The north trip for the part asked for, with its CO2 as the API gives it. */
function withCo2(query: Record<string, unknown>) {
  const board = Number(query["fromStop"] ?? 0);
  const alight = Number(query["toStop"] ?? 3);
  return ok(
    200,
    northTrip(
      { board, alight, seats: Number(query["seats"] ?? 1) },
      { part: northCo2(board, alight) },
    ),
  );
}

describe("a ride's details (spec 34, 3.5)", () => {
  it("show the part's figure between the whole route and the rows, for a visitor too", async () => {
    await renderApp(`/trips/${id}?from=0&to=3`, {
      setUp: (client) => {
        tripDetailsApi(client, withCo2);
      },
    });
    expect(await screen.findByText("About 58 kg, estimated")).toBeVisible();
    expect(screen.getByText("CO₂ saved")).toBeVisible();
    expect(parts()).toEqual([
      "part-ticket",
      "driver-card",
      "where-you-sit",
      "whole-route",
      "co2-card",
      "action-rows",
    ]);
    await fireEvent.press(row(58));
    expect(
      screen.getByText(
        "One car fewer on the road for 389 km: about 58 kg less CO₂ than driving alone.",
      ),
    ).toBeVisible();
    expect(screen.getByText(how)).toBeVisible();
    expect(screen.getByRole("link", { name: "How we estimate it" })).toBeVisible();
  });

  it("follow the part chosen, and not the seats", async () => {
    await renderApp(`/trips/${id}?from=1&to=2`, {
      setUp: (client) => {
        tripDetailsApi(client, withCo2);
      },
    });
    // Borgarnes to Blönduós, 170 km: 25.5 kg.
    expect(await screen.findByText("About 25 kg, estimated")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "One seat more" }));
    expect(screen).toHaveSearchParams({ id, from: "1", to: "2", seats: "2" });
    expect(await screen.findByText("About 25 kg, estimated")).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: "Change where you get out" }));
    await fireEvent.press(screen.getByRole("radio", { name: "14:00, Hof, Akureyri" }));
    // Borgarnes to Hof, 315 km: 47.25 kg.
    expect(await screen.findByText("About 47 kg, estimated")).toBeVisible();
  });

  it("show nothing for a cancelled ride, or without a figure", async () => {
    await renderApp(`/trips/${id}?from=0&to=3`, {
      setUp: (client) => {
        tripDetailsApi(client, () =>
          ok(
            200,
            northTrip({ board: 0, alight: 3 }, { part: { ...northCo2(0, 3), state: "cancelled" } }),
          ),
        );
      },
    });
    expect(await screen.findByTestId("part-ticket")).toBeVisible();
    expect(card()).toBeNull();
  });

  it("show nothing while the operator's value is 0", async () => {
    await renderApp(`/trips/${id}?from=0&to=3`, {
      setUp: (client) => {
        tripDetailsApi(client, () =>
          ok(
            200,
            northTrip({ board: 0, alight: 3 }, { part: { distanceM: 389_000, co2Grams: null } }),
          ),
        );
      },
    });
    expect(await screen.findByTestId("part-ticket")).toBeVisible();
    expect(card()).toBeNull();
  });
});

describe("a booked seat (3.6)", () => {
  // Borgarnes to Blönduós.
  const figure = { distanceM: 170_000, grams: 25_500 };

  async function open(booking: Booking) {
    await renderApp(`/bookings/${booking.id}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => booking);
      },
    });
  }

  it("shows the estimate while confirmed, right before the rows", async () => {
    await open({ ...paidBooking, co2: figure });
    expect(await screen.findByText("About 25 kg, estimated")).toBeVisible();
    const order = screen
      .getAllByTestId(/^(co2-card|action-rows)$/)
      .map((part) => String(part.props.testID));
    expect(order).toEqual(["co2-card", "action-rows"]);
    await fireEvent.press(row(25));
    expect(
      within(screen.getByTestId("co2-card")).getByText(
        "One car fewer on the road for 170 km: about 25 kg less CO₂ than driving alone.",
      ),
    ).toBeVisible();
  });

  it("shows the grams the booking kept once completed", async () => {
    await open({ ...completedBooking(), co2: { distanceM: 170_000, grams: 31_000 } });
    expect(await screen.findByText("About 31 kg, estimated")).toBeVisible();
  });

  it("shows nothing for a booking that ended another way", async () => {
    for (const booking of [
      cancelledBooking,
      northBooking({ ...cancelledBooking, status: "expired", cancellation: null }),
    ]) {
      await open({ ...booking, co2: null });
      expect(await screen.findByTestId("screen-scroll")).toBeVisible();
      expect(card()).toBeNull();
    }
  });
});

describe("on a laptop (3.4, item 6)", () => {
  const phone = { width: 750, height: 1334, scale: 2, fontScale: 2 };
  const laptop = { width: 1280, height: 800, scale: 1, fontScale: 1 };
  beforeEach(() => {
    Dimensions.set({ window: laptop });
  });
  afterEach(async () => {
    await act(() => {
      Dimensions.set({ window: phone });
    });
  });
  const main = () => within(screen.getByTestId("columns-main"));
  const side = () => within(screen.getByTestId("columns-side"));

  it("stands in a ride's main column, under where you sit, and never beside it", async () => {
    await renderApp(`/trips/${id}?from=0&to=3`, {
      setUp: (client) => {
        tripDetailsApi(client, withCo2);
      },
    });
    expect(await main().findByTestId("co2-card")).toBeVisible();
    expect(side().queryByTestId("co2-card")).toBeNull();
    expect(screen.getAllByTestId("co2-card")).toHaveLength(1);
    expect(
      main()
        .getAllByTestId(/^(where-you-sit|co2-card|action-rows)$/)
        .map((part) => String(part.props.testID)),
    ).toEqual(["where-you-sit", "co2-card", "action-rows"]);
  });

  it("stands in a booked seat's main column, under the driver and where to stand", async () => {
    await renderApp(`/bookings/${paidBooking.id}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => ({ ...paidBooking, co2: { distanceM: 170_000, grams: 25_500 } }));
      },
    });
    expect(await main().findByTestId("co2-card")).toBeVisible();
    expect(side().queryByTestId("co2-card")).toBeNull();
    expect(
      main()
        .getAllByTestId(/^(driver-card|where-to-stand|co2-card)$/)
        .map((part) => String(part.props.testID)),
    ).toEqual(["driver-card", "where-to-stand", "co2-card"]);
  });
});
