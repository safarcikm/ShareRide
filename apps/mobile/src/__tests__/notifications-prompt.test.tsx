import type { Booking } from "@shareride/contracts";
import { fireEvent, screen, waitFor } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { bookingApi, northBooking, paidBooking, unpaidBooking } from "@/testing/bookings";
import { ok, type FakeClient } from "@/testing/fake-client";
import { mockNotifications } from "@/testing/notifications";
import { plannedDraft, tripsApi } from "@/testing/trips";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: () => Promise.resolve(null),
  writePreference: () => Promise.resolve(),
}));
const mockStored = new Map<string, string>();
jest.mock("@/lib/app-data", () => ({
  readAppData: (key: string) => Promise.resolve(mockStored.get(key) ?? null),
  writeAppData: (key: string, value: string) => {
    mockStored.set(key, value);
    return Promise.resolve();
  },
}));
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));
const mockProject = { id: "test-project" as string | undefined };
jest.mock("@/notifications/project-id", () => ({ projectId: () => mockProject.id }));

const turnOn = "Turn on notifications so you hear at once if your trip changes.";
const addEmail = "Add an email so we can reach you if your trip changes.";

// Each test posts its own trip, so each is a new occasion.
let trips = 0;
function postedTrip() {
  trips += 1;
  return plannedDraft({
    id: `0190a1d6-0000-7000-8000-0000000003${String(trips).padStart(2, "0")}`,
    status: "published",
  });
}

const answered = () => JSON.parse(mockStored.get("notificationsPromptAnswered") ?? "[]") as unknown;

const registered = (client: FakeClient) =>
  client.calls
    .filter((call) => call.path === "/v1/me/sessions/current/push-token")
    .map((call) => (call.input["body"] as { token: string | null }).token);

async function openPosted(me = completeMe) {
  const trip = postedTrip();
  const app = await renderApp(`/drive/trips/${trip.id}/published`, {
    me,
    setUp: (client) => {
      tripsApi(client, [trip]);
      client.answer("/v1/me/sessions/current/push-token", () => ok(204), "put");
    },
  });
  expect(await screen.findByRole("header", { name: "Your trip is published" })).toBeVisible();
  return { ...app, trip };
}

/** Lets the prompt finish asking the phone and the device's storage. */
async function settled(button = "See my trips") {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: button })).toBeVisible();
  });
  for (let tick = 0; tick < 10; tick++) await Promise.resolve();
}

// Each booking test has its own booking, so each is a new occasion.
let bookings = 0;
function aBooking(booking: Booking): Booking {
  bookings += 1;
  return {
    ...booking,
    id: `0190a1d6-0000-7000-8000-0000000004${String(bookings).padStart(2, "0")}`,
  };
}

async function openBooking(booking: Booking, page: "booked" | "booking") {
  const app = await renderApp(
    page === "booked" ? `/bookings/${booking.id}/booked` : `/bookings/${booking.id}`,
    {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => booking);
        client.answer("/v1/me/sessions/current/push-token", () => ok(204), "put");
      },
    },
  );
  return app;
}

/** A request the driver said yes to, waiting for payment until 12:30. */
const acceptedRequest = northBooking({
  status: "accepted",
  paymentDueAt: "2026-11-14T12:30:00.000Z",
});

beforeEach(() => {
  mockNotifications.reset();
  mockProject.id = "test-project";
  mockStored.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("The prompt to turn on notifications (spec 7, 3.6.2)", () => {
  it("asks someone this phone cannot reach yet, after posting a trip, and registers the phone once allowed", async () => {
    const { client, trip } = await openPosted();
    expect(await screen.findByText(turnOn)).toBeVisible();
    expect(screen.getByRole("button", { name: "Add an email" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Turn on notifications" }));
    await waitFor(() => {
      expect(registered(client)).toEqual(["ExponentPushToken[test-device]"]);
    });
    expect(mockNotifications.permissionRequests).toBe(1);
    expect(screen.queryByText(turnOn)).toBeNull();
    await waitFor(() => {
      expect(answered()).toEqual([`posted:${trip.id}`]);
    });
  });

  it("counts turning them on as an answer even when the phone cannot give its token yet", async () => {
    mockNotifications.deviceFailure = new Error("SERVICE_NOT_AVAILABLE");
    const { trip } = await openPosted();
    await fireEvent.press(await screen.findByRole("button", { name: "Turn on notifications" }));
    await waitFor(() => {
      expect(screen.queryByText(turnOn)).toBeNull();
    });
    expect(answered()).toEqual([`posted:${trip.id}`]);
  });

  it("offers an email instead once the phone was told no, and says so", async () => {
    mockNotifications.answer = "denied";
    const announced = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const { trip } = await openPosted();
    await fireEvent.press(await screen.findByRole("button", { name: "Turn on notifications" }));
    expect(await screen.findByText(addEmail)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Turn on notifications" })).toBeNull();
    expect(announced).toHaveBeenCalledWith(addEmail);
    await fireEvent.press(screen.getByRole("button", { name: "Add an email" }));
    expect(await screen.findByRole("header", { name: "Your email" })).toBeVisible();
    expect(answered()).toEqual([`posted:${trip.id}`]);
  });

  it("takes the first no, as on Android where the phone could ask again", async () => {
    mockNotifications.answer = "denied";
    mockNotifications.asksAgainAfterNo = true;
    await openPosted();
    await fireEvent.press(await screen.findByRole("button", { name: "Turn on notifications" }));
    expect(await screen.findByText(addEmail)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Turn on notifications" })).toBeNull();
  });

  it("offers only an email when the phone was told no before", async () => {
    mockNotifications.permission = "denied";
    await openPosted();
    expect(await screen.findByText(addEmail)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Turn on notifications" })).toBeNull();
    expect(mockNotifications.permissionRequests).toBe(0);
  });

  it("offers only an email where push cannot reach, as before the app has its project", async () => {
    mockProject.id = undefined;
    await openPosted();
    expect(await screen.findByText(addEmail)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Turn on notifications" })).toBeNull();
    expect(mockNotifications.permissionRequests).toBe(0);
  });

  it("closes with Not now, and is not asked again for the same trip", async () => {
    const { trip } = await openPosted();
    await fireEvent.press(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByText(turnOn)).toBeNull();
    await waitFor(() => {
      expect(answered()).toEqual([`posted:${trip.id}`]);
    });
    expect(mockNotifications.permissionRequests).toBe(0);
  });

  it("is not asked for an occasion already answered", async () => {
    const trip = postedTrip();
    mockStored.set(
      "notificationsPromptAnswered",
      JSON.stringify(["posted:other", `posted:${trip.id}`]),
    );
    await renderApp(`/drive/trips/${trip.id}/published`, {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client, [trip]);
      },
    });
    expect(await screen.findByRole("header", { name: "Your trip is published" })).toBeVisible();
    await settled();
    expect(screen.queryByText(turnOn)).toBeNull();
  });

  it("is not shown to someone with a verified email", async () => {
    await openPosted({ ...completeMe, email: "anna-prompt@example.com" });
    await settled();
    expect(screen.queryByText(turnOn)).toBeNull();
    expect(screen.queryByText(addEmail)).toBeNull();
  });

  it("is not shown when another of my phones gets push", async () => {
    await openPosted({ ...completeMe, pushOn: true });
    await settled();
    expect(screen.queryByText(turnOn)).toBeNull();
    expect(screen.queryByText(addEmail)).toBeNull();
  });

  it("is not shown when this phone already has notifications on", async () => {
    mockNotifications.permission = "granted";
    await openPosted();
    await settled();
    expect(screen.queryByText(turnOn)).toBeNull();
    expect(screen.queryByText(addEmail)).toBeNull();
  });
});

describe("The prompt after booking and being accepted (spec 7, 3.6.2)", () => {
  it("asks after booking", async () => {
    const booking = aBooking(paidBooking);
    await openBooking(booking, "booked");
    expect(await screen.findByRole("header", { name: "You're booked!" })).toBeVisible();
    expect(await screen.findByText(turnOn)).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByText(turnOn)).toBeNull();
    await waitFor(() => {
      expect(answered()).toEqual([`booked:${booking.id}`]);
    });
  });

  it("asks after a request is sent", async () => {
    const booking = aBooking(northBooking());
    await openBooking(booking, "booked");
    expect(await screen.findByRole("header", { name: "Request sent" })).toBeVisible();
    expect(await screen.findByText(turnOn)).toBeVisible();
  });

  it("asks once a request is accepted, under paying, and registers the phone once allowed", async () => {
    const booking = aBooking(acceptedRequest);
    const { client } = await openBooking(booking, "booking");
    expect(await screen.findByText("Pay 2,900 ISK to confirm your seat")).toBeVisible();
    await fireEvent.press(await screen.findByRole("button", { name: "Turn on notifications" }));
    await waitFor(() => {
      expect(registered(client)).toEqual(["ExponentPushToken[test-device]"]);
    });
    expect(screen.queryByText(turnOn)).toBeNull();
    await waitFor(() => {
      expect(answered()).toEqual([`accepted:${booking.id}`]);
    });
  });

  it("asks once a free request is accepted, as it is confirmed at once", async () => {
    const booking = aBooking(
      northBooking({
        status: "confirmed",
        total: { amount: 0, currency: "ISK" },
        confirmed: { registration: "AB 123", whereToStand: null },
      }),
    );
    await openBooking(booking, "booking");
    expect(await screen.findByText("Your seat is confirmed")).toBeVisible();
    expect(await screen.findByText(turnOn)).toBeVisible();
  });

  it("asks on the booking once an instant booking is paid there, as after leaving Check and pay", async () => {
    let booking = aBooking(unpaidBooking);
    const paid = { ...paidBooking, id: booking.id };
    await renderApp(`/bookings/${booking.id}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => booking);
        client.answer("/v1/bookings/{id}/payment", () =>
          ok(200, {
            paymentId: "0190a1d6-0000-7000-8000-0000000000e1",
            provider: "test",
            amount: unpaidBooking.total,
            dueAt: unpaidBooking.paymentDueAt,
          }),
        );
        client.answer("/v1/test-payments/{id}", () => {
          booking = paid;
          return ok(200, paid);
        });
      },
    });
    await settled("Pay 2,900 ISK");
    // Not booked until paid.
    expect(screen.queryByText(turnOn)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Pay 2,900 ISK" }));
    await screen.findByRole("header", { name: "Test payment: no money moves" });
    await fireEvent.press(screen.getByRole("button", { name: "Pay 2,900 ISK" }));
    expect(await screen.findByText("Your seat is confirmed")).toBeVisible();
    expect(await screen.findByText(turnOn)).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => {
      expect(answered()).toEqual([`booked:${booking.id}`]);
    });
  });

  it("is not asked again on the booking once answered after booking", async () => {
    const booking = aBooking(paidBooking);
    mockStored.set("notificationsPromptAnswered", JSON.stringify([`booked:${booking.id}`]));
    await openBooking(booking, "booking");
    await settled("Message Anna");
    expect(screen.queryByText(turnOn)).toBeNull();
  });

  it.each([
    ["an instant booking waiting for payment", unpaidBooking, "Pay 2,900 ISK"],
    ["a request still waiting for the driver", northBooking(), "Withdraw request"],
    ["the driver", northBooking({ ...acceptedRequest, viewer: "driver" }), "Back"],
  ])("is not asked on the booking page for %s", async (_, booking, button) => {
    await openBooking(aBooking(booking), "booking");
    await settled(button);
    expect(screen.queryByText(turnOn)).toBeNull();
    expect(screen.queryByText(addEmail)).toBeNull();
  });
});
