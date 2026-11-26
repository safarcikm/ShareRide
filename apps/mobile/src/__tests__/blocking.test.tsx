import { fireEvent, screen } from "expo-router/testing-library";
import type { BlockedPerson, Booking, CancelBookingBody } from "@shareride/contracts";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import {
  bookingApi,
  cancellationPreview,
  cancelledBooking,
  northStop,
  paidBooking,
  requestToDrive,
} from "@/testing/bookings";
import { callsTo, chatServer } from "@/testing/chat";
import { failure, ok, type FakeClient } from "@/testing/fake-client";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
// Saturday 14 November 2026, noon in Iceland: the trip is on Sunday.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));

/** How a booking or request on the north trip is named on the block screen. */
const part = "Sunday 15 November, Borgarnes → Blönduós";
/** Another request the two have together, on the same trip. */
const otherRequest: Booking = {
  ...paidBooking,
  id: "0190a1d6-0000-7000-8000-0000000000b9",
  status: "requested",
  confirmed: null,
};

/**
 * The conversation of `booking`. Blocking answers `together`, closes the
 * chat and marks it as blocked by me; `answers` can add or replace answers.
 */
async function openConversation(
  booking: Booking,
  together: readonly Booking[],
  answers: (client: FakeClient) => void = () => undefined,
) {
  let server: ReturnType<typeof chatServer> | undefined;
  const app = await renderApp(`/messages/${booking.id}`, {
    me: completeMe,
    setUp: (client) => {
      const chat = chatServer(client, { booking });
      server = chat;
      bookingApi(client, () => booking);
      client.answer("/v1/bookings/{id}/cancellation-preview", () =>
        ok(200, cancellationPreview(booking.total, true, "passenger")),
      );
      client.answer(
        "/v1/bookings/{id}/block",
        () => {
          chat.canWrite = false;
          chat.blockedByMe = true;
          return ok(200, { together });
        },
        "post",
      );
      answers(client);
    },
  });
  if (server === undefined) throw new Error("No chat server.");
  return { ...app, server };
}

/** Opens Block from the conversation and confirms it. */
async function blockFromChat(name: string) {
  await fireEvent.press(await screen.findByRole("button", { name: `Block ${name}` }));
  expect(await screen.findByRole("header", { name: `Block ${name}?` })).toBeVisible();
  await fireEvent.press(screen.getByRole("button", { name: `Block ${name}` }));
}

describe("Blocking from a conversation (spec 9, 3.2)", () => {
  it("asks first, then blocks, and offers to cancel the booking we share", async () => {
    const { client } = await openConversation(paidBooking, [paidBooking]);
    await fireEvent.press(await screen.findByRole("button", { name: "Block Anna" }));

    expect(await screen.findByRole("header", { name: "Block Anna?" })).toBeVisible();
    expect(
      screen.getByText(
        "You won't see each other's rides, your chat becomes read-only, and they won't be told.",
      ),
    ).toBeVisible();
    expect(callsTo(client, "/v1/bookings/{id}/block", () => true)).toHaveLength(0);

    await fireEvent.press(screen.getByRole("button", { name: "Block Anna" }));
    expect(await screen.findByRole("header", { name: "Anna is blocked." })).toBeVisible();
    expect(
      callsTo(client, "/v1/bookings/{id}/block", (input) => {
        return (input as { params: { id: string } }).params.id === paidBooking.id;
      }),
    ).toHaveLength(1);
    expect(
      screen.getByText(
        "You still have a booking together. You can cancel it under the usual rules.",
      ),
    ).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: `Cancel booking, ${part}` }));
    expect(screen).toHavePathname(`/bookings/${paidBooking.id}/cancel`);
  });

  it("comes back to the list after cancelling one of two bookings, showing it cancelled", async () => {
    const later: Booking = {
      ...paidBooking,
      id: "0190a1d6-0000-7000-8000-0000000000b8",
      board: northStop(2),
      alight: northStop(3),
    };
    const laterPart = "Sunday 15 November, Blönduós → Hof, Akureyri";
    let first: Booking = paidBooking;
    await openConversation(paidBooking, [paidBooking, later], (client) => {
      client.answer(
        "/v1/bookings/{id}",
        (input) => {
          const { id } = (input as { params: { id: string } }).params;
          return ok(200, id === later.id ? later : first);
        },
        "get",
      );
      client.answer("/v1/bookings/{id}/cancel", (input) => {
        const { reason, terms } = (input as { body: CancelBookingBody }).body;
        first = {
          ...cancelledBooking,
          cancellation: { by: "passenger", reason, note: "", wholeTrip: false, ...terms },
        };
        return ok(200, first);
      });
    });
    await blockFromChat("Anna");
    await fireEvent.press(await screen.findByRole("button", { name: `Cancel booking, ${part}` }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Plans changed" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Cancel booking" }));
    expect(screen).toHavePathname(`/bookings/${paidBooking.id}`);

    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    expect(await screen.findByText("Cancelled")).toBeVisible();
    expect(screen.queryByRole("button", { name: `Cancel booking, ${part}` })).toBeNull();
    expect(screen.getByRole("button", { name: `Cancel booking, ${laterPart}` })).toBeVisible();
  });

  it("withdraws a request we share, there and then", async () => {
    const withdrawn = { ...otherRequest, status: "cancelled", withdrawn: true } as const;
    const { client } = await openConversation(paidBooking, [otherRequest], (fake) => {
      fake.answer("/v1/bookings/{id}/withdraw", () => ok(200, withdrawn), "post");
    });
    await blockFromChat("Anna");

    await fireEvent.press(await screen.findByRole("button", { name: `Withdraw request, ${part}` }));
    expect(await screen.findByText("Withdrawn")).toBeVisible();
    expect(screen.queryByRole("button", { name: `Withdraw request, ${part}` })).toBeNull();
    expect(
      callsTo(client, "/v1/bookings/{id}/withdraw", (input) => {
        return (input as { params: { id: string } }).params.id === otherRequest.id;
      }),
    ).toHaveLength(1);
  });

  it("lets the driver decline a request from the person blocked", async () => {
    const asDriver: Booking = { ...paidBooking, viewer: "driver" };
    const request: Booking = { ...requestToDrive, id: otherRequest.id };
    const { client } = await openConversation(asDriver, [request], (fake) => {
      fake.answer(
        "/v1/bookings/{id}/decline",
        () => ok(200, { ...request, status: "declined" }),
        "post",
      );
    });
    await blockFromChat("Gunna");

    await fireEvent.press(await screen.findByRole("button", { name: `Decline request, ${part}` }));
    expect(await screen.findByText("Declined")).toBeVisible();
    expect(
      callsTo(client, "/v1/bookings/{id}/decline", (input) => {
        const { params, body } = input as {
          params: { id: string };
          body: { reason: string | null };
        };
        return params.id === request.id && body.reason === null;
      }),
    ).toHaveLength(1);
  });

  it("goes back to a read-only conversation that says who blocked whom, to me only", async () => {
    const ridden: Booking = { ...paidBooking, status: "completed" };
    await openConversation(ridden, []);
    await blockFromChat("Anna");

    expect(await screen.findByRole("header", { name: "Anna is blocked." })).toBeVisible();
    expect(screen.queryByText(/together/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Back to the conversation" }));

    expect(screen).toHavePathname(`/messages/${paidBooking.id}`);
    expect(await screen.findByText("This chat is closed. You can still read it.")).toBeVisible();
    expect(
      screen.getByText("You blocked Anna. You can unblock them in Settings, under Safety."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Block Anna" })).toBeNull();
  });

  it("says so when blocking fails, and blocks on a second try", async () => {
    let attempts = 0;
    await openConversation(paidBooking, [], (client) => {
      client.answer(
        "/v1/bookings/{id}/block",
        () => {
          attempts += 1;
          return attempts === 1 ? failure(500, "internal_error") : ok(200, { together: [] });
        },
        "post",
      );
    });
    await blockFromChat("Anna");
    expect(await screen.findByText("We couldn't block this person. Try again.")).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: "Block Anna" }));
    expect(await screen.findByRole("header", { name: "Anna is blocked." })).toBeVisible();
  });
});

describe("Blocked people in Settings (spec 9, 3.2, item 4)", () => {
  // The block's own ID: never Anna's.
  const blockedAnna: BlockedPerson = {
    id: "0190a1d6-0000-7000-8000-0000000000c1",
    firstName: "Anna",
    colour: 1,
    blockedAt: "2026-11-12T09:00:00.000Z",
  };

  async function openBlocked(
    blocked: BlockedPerson[],
    answers: (client: FakeClient) => void = () => undefined,
  ) {
    let list = [...blocked];
    const app = await renderApp("/settings", {
      me: completeMe,
      setUp: (client) => {
        client.answer("/v1/me/blocks", () => ok(200, { blocked: list }), "get");
        client.answer(
          "/v1/me/blocks/{id}",
          (input) => {
            const { id } = (input as { params: { id: string } }).params;
            list = list.filter((person) => person.id !== id);
            return ok(204);
          },
          "delete",
        );
        answers(client);
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Blocked people" }));
    return app;
  }

  it("lists the people I blocked, with the year, and unblocks them", async () => {
    const { client } = await openBlocked([blockedAnna]);
    expect(await screen.findByText("Anna")).toBeVisible();
    expect(screen.getByText("Since 12 November 2026")).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: "Unblock Anna" }));
    expect(await screen.findByText("Anna is unblocked.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Unblock Anna" })).toBeNull();
    expect(screen.getByText("You haven't blocked anyone.")).toBeVisible();
    expect(
      callsTo(
        client,
        "/v1/me/blocks/{id}",
        (input) => (input as { params: { id: string } }).params.id === blockedAnna.id,
      ),
    ).toHaveLength(1);
  });

  it("keeps the person listed when unblocking fails", async () => {
    await openBlocked([blockedAnna], (client) => {
      client.answer("/v1/me/blocks/{id}", () => failure(500, "internal_error"), "delete");
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Unblock Anna" }));

    expect(await screen.findByText("We couldn't unblock Anna. Try again.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Unblock Anna" })).toBeVisible();
  });

  it("says when nobody is blocked", async () => {
    await openBlocked([]);
    expect(await screen.findByText("You haven't blocked anyone.")).toBeVisible();
  });

  it("offers to try again when the list can't be loaded", async () => {
    let attempts = 0;
    await openBlocked([], (client) => {
      client.answer(
        "/v1/me/blocks",
        () => {
          attempts += 1;
          return attempts === 1 ? failure(500, "internal_error") : ok(200, { blocked: [] });
        },
        "get",
      );
    });
    expect(await screen.findByText("The list could not be loaded.")).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("You haven't blocked anyone.")).toBeVisible();
  });
});
