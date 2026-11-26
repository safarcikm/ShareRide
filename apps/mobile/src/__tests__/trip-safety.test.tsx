import { fireEvent, screen } from "expo-router/testing-library";
import { getLocales } from "expo-localization";
import { Linking } from "react-native";
import type { Booking } from "@shareride/contracts";
import { shareText } from "@/lib/share";
import { renderApp, completeMe } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import {
  bookingApi,
  driverApi,
  northBooking,
  northMyTrip,
  northStop,
  paidBooking,
} from "@/testing/bookings";
import { northResult, tripDetailsApi } from "@/testing/search";
import { tripsApi } from "@/testing/trips";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({
  getLocales: jest.fn(() => [{ languageTag: "en-GB" }]),
}));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
// Saturday 14 November 2026, noon in Iceland, unless a test moves on.
const saturdayNoon = new Date("2026-11-14T12:00:00Z");
let mockNow = saturdayNoon;
jest.mock("@/lib/clock", () => ({ now: () => mockNow }));
jest.mock("@/lib/share", () => ({
  ...jest.requireActual<object>("@/lib/share"),
  shareText: jest.fn(() => Promise.resolve("shared")),
}));

const mockedShare = shareText as jest.Mock;

/** Two stops inside the capital area. */
const inTown = northBooking({
  ...paidBooking,
  board: { ...northStop(0), meetingPoint: { ...northStop(0).meetingPoint, region: "capital" } },
  alight: {
    ...northStop(1),
    meetingPoint: {
      ...northStop(1).meetingPoint,
      name: { is: "Mjódd", en: "Mjódd" },
      region: "capital",
    },
  },
});

async function openBooking(booking: Booking) {
  return renderApp(`/bookings/${booking.id}`, {
    me: completeMe,
    setUp: (client) => {
      bookingApi(client, () => booking);
    },
  });
}

async function openDriverTrip() {
  return renderApp(`/drive/trips/${northMyTrip.id}`, {
    me: completeMe,
    setUp: (client) => {
      tripsApi(client, [northMyTrip]);
      driverApi(client, [northBooking({ viewer: "driver", status: "confirmed" })]);
    },
  });
}

let open: jest.SpiedFunction<typeof Linking.openURL>;

beforeEach(() => {
  open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  mockedShare.mockClear();
});

afterEach(() => {
  mockNow = saturdayNoon;
  open.mockRestore();
  (getLocales as jest.Mock).mockReturnValue([{ languageTag: "en-GB" }]);
});

describe("Safety on a trip (spec 9, 3.3)", () => {
  // People dial 112 themselves: the app has no button for it (Martin, 2026-11-18).
  const call = /112/;

  it("has no 112 button on the booking, trip details or the driver's trip page", async () => {
    await openBooking(paidBooking);
    expect(await screen.findByRole("button", { name: "Share the ride's details" })).toBeVisible();
    expect(screen.queryByRole("button", { name: call })).toBeNull();

    await renderApp(`/trips/${northResult.tripId}?from=1&to=2`, {
      setUp: (client) => {
        tripDetailsApi(client);
      },
    });
    expect(await screen.findByRole("link", { name: "Weather (vedur.is)" })).toBeVisible();
    expect(screen.queryByRole("button", { name: call })).toBeNull();

    await openDriverTrip();
    expect(await screen.findByRole("button", { name: "Share the ride's details" })).toBeVisible();
    expect(screen.queryByRole("button", { name: call })).toBeNull();
  });

  it("shows nothing when there is nothing to check or share", async () => {
    // Within the capital area, and a request has no trip details to share yet.
    await openBooking({ ...inTown, status: "requested" });
    expect(await screen.findByText("Request sent")).toBeVisible();
    expect(screen.queryByRole("header", { name: "Safety" })).toBeNull();
  });

  it("leaves the booking once the passenger has got out", async () => {
    // Monday: the Sunday trip is over, though nothing marks it completed yet.
    mockNow = new Date("2026-11-16T12:00:00Z");
    await openBooking(paidBooking);
    expect(await screen.findByText("Your seat is confirmed")).toBeVisible();
    expect(screen.queryByRole("header", { name: "Safety" })).toBeNull();
  });

  it("leaves the driver's trip page once the trip has arrived", async () => {
    mockNow = new Date("2026-11-16T12:00:00Z");
    await openDriverTrip();
    expect(await screen.findByText("BSÍ bus terminal → Hof, Akureyri")).toBeVisible();
    expect(screen.queryByRole("header", { name: "Safety" })).toBeNull();
  });
});

describe("Before you go (spec 9, 3.3.2)", () => {
  it("links to the weather, road conditions and SafeTravel on a trip out of the capital area", async () => {
    await openBooking(paidBooking);
    expect(
      await screen.findByText("Before you go: check the weather, road conditions and SafeTravel."),
    ).toBeVisible();
    for (const [name, url] of [
      ["Weather (vedur.is)", "https://en.vedur.is/"],
      ["Road conditions (umferdin.is)", "https://umferdin.is/en"],
      ["SafeTravel (safetravel.is)", "https://safetravel.is/"],
    ] as const) {
      await fireEvent.press(screen.getByRole("link", { name }));
      expect(open).toHaveBeenLastCalledWith(url);
    }
  });

  it("opens the Icelandic pages in Icelandic", async () => {
    (getLocales as jest.Mock).mockReturnValue([{ languageTag: "is-IS" }]);
    await openBooking(paidBooking);
    await fireEvent.press(await screen.findByRole("link", { name: "Veður (vedur.is)" }));
    expect(open).toHaveBeenLastCalledWith("https://www.vedur.is/");
    await fireEvent.press(screen.getByRole("link", { name: "Færð á vegum (umferdin.is)" }));
    expect(open).toHaveBeenLastCalledWith("https://umferdin.is/");
  });

  it("shows them on the driver's trip page, from all of its stops", async () => {
    await openDriverTrip();
    expect(await screen.findByRole("link", { name: "Weather (vedur.is)" })).toBeVisible();
  });

  it("says so when a page cannot be opened", async () => {
    open.mockRejectedValueOnce(new Error("No browser"));
    await openBooking(paidBooking);
    await fireEvent.press(await screen.findByRole("link", { name: "Weather (vedur.is)" }));
    expect(await screen.findByText("We couldn't open that page on this device.")).toBeVisible();
  });

  it("leaves them out of a trip within the capital area", async () => {
    await openBooking(inTown);
    expect(await screen.findByRole("button", { name: "Share the ride's details" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Weather (vedur.is)" })).toBeNull();
  });
});

describe("Share trip details (spec 9, 3.3.3, R9.8)", () => {
  it("shares a confirmed booking's date, place, driver and car with its plate", async () => {
    await openBooking(paidBooking);
    await fireEvent.press(await screen.findByRole("button", { name: "Share the ride's details" }));
    expect(mockedShare).toHaveBeenCalledWith(
      "My ride: Sunday 15 November at 10:00 · Borgarnes → Blönduós · " +
        "Meeting point: Borgarnes (By the petrol pumps) · Driver: Anna · " +
        "Car: White Toyota Yaris, AB 123 · Booked on PuffinRide",
    );
  });

  it("says when the details were copied instead", async () => {
    mockedShare.mockResolvedValueOnce("copied");
    await openBooking(paidBooking);
    await fireEvent.press(await screen.findByRole("button", { name: "Share the ride's details" }));
    expect(
      await screen.findByText("Ride details copied. Paste them into a message to share them."),
    ).toBeVisible();
  });

  it("shows the details to copy when the device can neither share nor copy them", async () => {
    mockedShare.mockResolvedValueOnce("failed");
    await openBooking(paidBooking);
    await fireEvent.press(await screen.findByRole("button", { name: "Share the ride's details" }));
    expect(
      await screen.findByText(
        "The ride details could not be shared. Here they are to copy: My ride: " +
          "Sunday 15 November at 10:00 · Borgarnes → Blönduós · " +
          "Meeting point: Borgarnes (By the petrol pumps) · Driver: Anna · " +
          "Car: White Toyota Yaris, AB 123 · Booked on PuffinRide",
      ),
    ).toBeVisible();
  });

  it("waits for the booking to be confirmed", async () => {
    await openBooking(northBooking());
    expect(await screen.findByRole("link", { name: "Weather (vedur.is)" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Share the ride's details" })).toBeNull();
  });

  it("shares the driver's trip without the passengers' names", async () => {
    await openDriverTrip();
    await fireEvent.press(await screen.findByRole("button", { name: "Share the ride's details" }));
    expect(mockedShare).toHaveBeenCalledWith(
      "My ride: Sunday 15 November at 09:00 · BSÍ bus terminal → Hof, Akureyri · " +
        "Offered on PuffinRide",
    );
    expect(mockedShare).not.toHaveBeenCalledWith(expect.stringContaining("Gunna"));
  });

  it("is not offered on trip details, which shares its link", async () => {
    await renderApp(`/trips/${northResult.tripId}?from=1&to=2`, {
      setUp: (client) => {
        tripDetailsApi(client);
      },
    });
    expect(await screen.findByRole("link", { name: "Weather (vedur.is)" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Share the ride's details" })).toBeNull();
  });
});
