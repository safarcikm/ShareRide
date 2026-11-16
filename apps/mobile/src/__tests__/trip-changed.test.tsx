import type { Booking } from "@shareride/contracts";
import { AccessibilityInfo } from "react-native";
import { fireEvent, screen } from "expo-router/testing-library";
import { readAppData, writeAppData } from "@/lib/app-data";
import { readPreference } from "@/lib/preferences";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import {
  bookingApi,
  cancellationPreview,
  northStop,
  paidBooking,
  unpaidBooking,
} from "@/testing/bookings";
import { ok } from "@/testing/fake-client";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
// "Keep my booking" is kept in the app's own storage on this device.
jest.mock("@/lib/app-data", () => ({
  readAppData: jest.fn(() => Promise.resolve(null)),
  writeAppData: jest.fn(() => Promise.resolve()),
}));
// Saturday 14 November 2026, noon in Iceland: Gunna boards in Borgarnes tomorrow.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));

const mockedRead = readAppData as jest.Mock;
const mockedWrite = writeAppData as jest.Mock;

const boardsAt = "2026-11-15T10:45:00.000Z";
const movedAt = "2026-11-14T11:00:00.000Z";

/** Gunna's paid booking once Anna moved the trip 45 minutes later. */
const moved: Booking = {
  ...paidBooking,
  board: { ...northStop(1), plannedAt: boardsAt },
  alight: { ...northStop(2), plannedAt: "2026-11-15T12:50:00.000Z" },
  changes: [
    {
      kind: "departure",
      from: "2026-11-15T10:00:00.000Z",
      to: boardsAt,
      changedAt: movedAt,
    },
  ],
  movedFar: true,
};

async function openBooking(booking: Booking) {
  return renderApp(`/bookings/${booking.id}`, {
    me: completeMe,
    setUp: (client) => {
      bookingApi(client, () => booking);
      client.answer("/v1/bookings/{id}/cancellation-preview", () =>
        ok(200, cancellationPreview(booking.total, false)),
      );
    },
  });
}

const keep = "Keep my booking";
const cancelFree = "Cancel with full refund";

beforeEach(() => {
  mockedRead.mockClear();
  mockedWrite.mockClear();
  mockedRead.mockImplementation(() => Promise.resolve(null));
});

describe("A trip that changed, as its passenger sees it (spec 6, 3.2; screen 7)", () => {
  it("shows each change since booking, and after a move of more than 30 minutes offers to keep it or cancel with a full refund", async () => {
    await openBooking(moved);
    expect(await screen.findByRole("header", { name: "Changes since you booked" })).toBeVisible();
    // The time at Gunna's own stop.
    expect(screen.getByText("Departure changed from 10:00 to 10:45")).toBeVisible();
    expect(
      screen.getByText(
        "The departure moved more than 30 minutes, so you can cancel with a full refund, without it counting against you.",
      ),
    ).toBeVisible();
    expect(await screen.findByRole("button", { name: keep })).toBeVisible();
    // The offer takes the place of Cancel booking.
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: cancelFree }));
    expect(await screen.findByRole("header", { name: "Cancel your booking" })).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${moved.id}/cancel`);
    expect(screen.getByRole("radio", { name: "The trip changed" })).toBeChecked();
  });

  it("hides the offer on this device with Keep my booking, moving focus to the changes", async () => {
    await openBooking(moved);
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    focusMoves.mockClear();
    await fireEvent.press(await screen.findByRole("button", { name: keep }));
    expect(mockedWrite).toHaveBeenCalledWith(`kept-booking-${moved.id}`, movedAt);
    expect(screen.queryByRole("button", { name: keep })).toBeNull();
    expect(screen.queryByRole("button", { name: cancelFree })).toBeNull();
    expect(focusMoves).toHaveBeenCalledTimes(1);
    focusMoves.mockRestore();
    expect(screen.getByText("Departure changed from 10:00 to 10:45")).toBeVisible();
    expect(screen.queryByText(/^The departure moved more than 30 minutes/)).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel booking" })).toBeVisible();
  });

  it("stays hidden once kept, until the trip moves again", async () => {
    mockedRead.mockImplementation(() => Promise.resolve(movedAt));
    await openBooking(moved);
    expect(await screen.findByRole("button", { name: "Cancel booking" })).toBeVisible();
    expect(mockedRead).toHaveBeenCalledWith(`kept-booking-${moved.id}`);
    expect(screen.queryByRole("button", { name: keep })).toBeNull();
    expect(screen.getByText("Departure changed from 10:00 to 10:45")).toBeVisible();
  });

  it("shows neither the choice nor Cancel booking until what this device kept is read", async () => {
    mockedRead.mockImplementation(() => new Promise(() => undefined));
    await openBooking(moved);
    expect(await screen.findByText("Departure changed from 10:00 to 10:45")).toBeVisible();
    expect(screen.queryByRole("button", { name: keep })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
  });

  it("offers it again after another move, even back to the time kept", async () => {
    mockedRead.mockImplementation(() => Promise.resolve(movedAt));
    const back = {
      kind: "departure" as const,
      from: boardsAt,
      to: "2026-11-15T11:10:00.000Z",
      changedAt: "2026-11-14T11:30:00.000Z",
    };
    const again = {
      kind: "departure" as const,
      from: "2026-11-15T11:10:00.000Z",
      to: boardsAt,
      changedAt: "2026-11-14T11:45:00.000Z",
    };
    await openBooking({ ...moved, changes: [...moved.changes, back, again] });
    expect(await screen.findByRole("button", { name: keep })).toBeVisible();
  });

  it("shows a new car, which does not bring back the offer once kept", async () => {
    mockedRead.mockImplementation(() => Promise.resolve(movedAt));
    const newCar = {
      kind: "vehicle" as const,
      car: { make: "Volvo", model: "XC40", colour: "red" as const },
      changedAt: "2026-11-14T11:30:00.000Z",
    };
    await openBooking({ ...moved, changes: [...moved.changes, newCar] });
    expect(await screen.findByRole("button", { name: "Cancel booking" })).toBeVisible();
    expect(screen.getByText("Departure changed from 10:00 to 10:45")).toBeVisible();
    expect(screen.getByText("New car: Red Volvo XC40")).toBeVisible();
    expect(screen.queryByRole("button", { name: keep })).toBeNull();
  });

  it("shows a new stop by its name and time, which does not bring back the offer once kept", async () => {
    mockedRead.mockImplementation(() => Promise.resolve(movedAt));
    const newStop = {
      kind: "addStop" as const,
      stop: { is: "N1 Mosfellsbæ", en: "N1 Mosfellsbær" },
      plannedAt: "2026-11-15T10:20:00.000Z",
      changedAt: "2026-11-14T11:30:00.000Z",
    };
    await openBooking({ ...moved, changes: [...moved.changes, newStop] });
    expect(await screen.findByRole("button", { name: "Cancel booking" })).toBeVisible();
    expect(screen.getByText("New stop: N1 Mosfellsbær at 10:20")).toBeVisible();
    expect(screen.queryByRole("button", { name: keep })).toBeNull();
  });

  it("names a new stop in the app's language", async () => {
    jest
      .mocked(readPreference)
      .mockImplementation((key) => Promise.resolve(key === "language" ? "is" : null));
    try {
      const newStop = {
        kind: "addStop" as const,
        stop: { is: "N1 Mosfellsbæ", en: "N1 Mosfellsbær" },
        plannedAt: "2026-11-15T10:20:00.000Z",
        changedAt: "2026-11-14T11:30:00.000Z",
      };
      await openBooking({ ...moved, changes: [newStop] });
      expect(await screen.findByText("Nýr viðkomustaður: N1 Mosfellsbæ kl. 10:20")).toBeVisible();
    } finally {
      jest.mocked(readPreference).mockImplementation(() => Promise.resolve(null));
    }
  });

  const removedStop = {
    kind: "removeStop" as const,
    stop: { is: "N1 Borgarnesi", en: "N1 Borgarnes" },
    changedAt: "2026-11-14T11:30:00.000Z",
  };

  it("shows a stop removed by its name, which does not bring back the offer once kept", async () => {
    mockedRead.mockImplementation(() => Promise.resolve(movedAt));
    await openBooking({ ...moved, changes: [...moved.changes, removedStop] });
    expect(await screen.findByRole("button", { name: "Cancel booking" })).toBeVisible();
    expect(screen.getByText("Stop removed: N1 Borgarnes")).toBeVisible();
    expect(screen.queryByRole("button", { name: keep })).toBeNull();
  });

  it("names a stop removed in the app's language", async () => {
    jest
      .mocked(readPreference)
      .mockImplementation((key) => Promise.resolve(key === "language" ? "is" : null));
    try {
      await openBooking({ ...moved, changes: [removedStop] });
      expect(await screen.findByText("Viðkomustaður felldur niður: N1 Borgarnesi")).toBeVisible();
    } finally {
      jest.mocked(readPreference).mockImplementation(() => Promise.resolve(null));
    }
  });

  it("only shows a move of 30 minutes or less", async () => {
    await openBooking({ ...moved, movedFar: false });
    expect(await screen.findByText("Departure changed from 10:00 to 10:45")).toBeVisible();
    expect(await screen.findByRole("button", { name: "Cancel booking" })).toBeVisible();
    expect(screen.queryByRole("button", { name: keep })).toBeNull();
  });

  it("offers a free ride's passenger to cancel without promising a refund (R5.11)", async () => {
    await openBooking({ ...moved, total: { amount: 0, currency: "ISK" } });
    expect(
      await screen.findByText(
        "The departure moved more than 30 minutes, so you can cancel without it counting against you.",
      ),
    ).toBeVisible();
    expect(await screen.findByRole("button", { name: keep })).toBeVisible();
    expect(screen.queryByText(/full refund/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel booking" }));
    expect(await screen.findByRole("radio", { name: "The trip changed" })).toBeChecked();
  });

  it("offers nothing to a booking not yet paid, which costs nothing to cancel", async () => {
    await openBooking({ ...unpaidBooking, changes: moved.changes, movedFar: true });
    expect(await screen.findByText("Departure changed from 10:00 to 10:45")).toBeVisible();
    expect(screen.queryByRole("button", { name: keep })).toBeNull();
  });

  it("shows nothing of changes when there are none", async () => {
    await openBooking(paidBooking);
    expect(await screen.findByRole("button", { name: "Cancel booking" })).toBeVisible();
    expect(screen.queryByRole("header", { name: "Changes since you booked" })).toBeNull();
  });
});
