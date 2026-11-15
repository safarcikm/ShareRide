import type { Booking } from "@shareride/contracts";
import { fireEvent, screen } from "expo-router/testing-library";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { bookingApi, northBooking, paidBooking, unpaidBooking } from "@/testing/bookings";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { searchApi } from "@/testing/search";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
// Saturday 14 November 2026, noon in Iceland.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));

const bookingId = northBooking().id;
const declinedId = "0190a1d6-0000-7000-8000-0000000000b2";
const withdrawnId = "0190a1d6-0000-7000-8000-0000000000b3";
/** A request the driver declined: the deadline is gone, as the server sends it. */
const declined = northBooking({ id: declinedId, status: "declined", requestExpiresAt: null });
/** A request withdrawn before the driver answered, as the server sends it. */
const withdrawn = northBooking({ id: withdrawnId, status: "cancelled", withdrawn: true });
/** The open request once withdrawn, as the server answers. */
const withdrawnHere = northBooking({ status: "cancelled", withdrawn: true });

function myBookingsApi(client: FakeClient, lists: { upcoming?: Booking[]; past?: Booking[] } = {}) {
  client.answer("/v1/me/bookings", (input) => {
    const { when } = input["query"] as { when: "upcoming" | "past" };
    return ok(200, { bookings: lists[when] ?? [] });
  });
}

describe("My bookings (spec 5, 3.6)", () => {
  it("opens from the profile, lists upcoming bookings and opens one", async () => {
    await renderApp("/profile", {
      me: completeMe,
      setUp: (client) => {
        myBookingsApi(client, {
          upcoming: [
            northBooking(),
            { ...paidBooking, id: "0190a1d6-0000-7000-8000-0000000000b4" },
          ],
        });
        bookingApi(client, () => northBooking());
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "My bookings" }));
    expect(await screen.findByRole("header", { name: "My bookings" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Upcoming" })).toBeChecked();
    const card = await screen.findByRole("button", {
      name: "Sunday 15 November, Borgarnes → Blönduós, 10:00 to 12:05, Request sent, Anna, White Toyota Yaris, 1 seat, 2,900 ISK",
    });
    expect(screen.getAllByText("Confirmed")).toHaveLength(1);
    await fireEvent.press(card);
    expect(await screen.findByText("Request sent. Anna has until 22:00 to answer.")).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${bookingId}`);
  });

  it("shows past bookings, and says when a list is empty", async () => {
    await renderApp("/bookings", {
      me: completeMe,
      setUp: (client) => {
        myBookingsApi(client, { past: [withdrawn, declined] });
      },
    });
    expect(await screen.findByText("No rides coming up. Find one and book a seat.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Find a ride" })).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: "Past" }));
    expect(await screen.findByText("Withdrawn")).toBeVisible();
    expect(screen.getByText("Declined")).toBeVisible();
    expect(screen).toHaveSearchParams({ when: "past" });
  });

  it("says when the bookings could not be loaded, with a retry", async () => {
    let tries = 0;
    await renderApp("/bookings?when=past", {
      me: completeMe,
      setUp: (client) => {
        client.answer("/v1/me/bookings", () => {
          tries += 1;
          return tries === 1 ? failure(500, "internal_error") : ok(200, { bookings: [] });
        });
      },
    });
    expect(await screen.findByText("Your bookings could not be loaded.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText(
        "Bookings show here once they're over, and requests once they're declined, run out or are withdrawn.",
      ),
    ).toBeVisible();
  });
});

describe("Withdrawing a request (spec 5, 3.4; R5.8)", () => {
  async function openRequest(withdraw: () => unknown) {
    let booking = northBooking();
    const app = await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => booking);
        searchApi(client);
        client.answer("/v1/bookings/{id}/withdraw", () => {
          const answer = withdraw();
          if ((answer as { ok: boolean }).ok) booking = withdrawnHere;
          return answer;
        });
      },
    });
    return {
      ...app,
      change: (next: Booking) => {
        booking = next;
      },
    };
  }

  it("asks once more, withdraws, and offers the same search again", async () => {
    const { client } = await openRequest(() => ok(200, withdrawnHere));
    await fireEvent.press(await screen.findByRole("button", { name: "Withdraw request" }));
    expect(screen.getByText("Number plate shown once your seat is confirmed")).toBeVisible();
    expect(
      screen.getByText("Withdraw your request? Anna won't see it any more, and the seat is freed."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Keep my request" }));
    expect(screen.queryByText(/^Withdraw your request\?/)).toBeNull();
    expect(client.calls.filter((call) => call.path === "/v1/bookings/{id}/withdraw")).toEqual([]);

    await fireEvent.press(screen.getByRole("button", { name: "Withdraw request" }));
    await fireEvent.press(screen.getByRole("button", { name: "Withdraw request" }));
    expect(
      await screen.findByText("You withdrew this request. That never counts against you."),
    ).toBeVisible();
    expect(screen.getByText("Withdrawn")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Withdraw request" })).toBeNull();
    // The seat will never be confirmed, so the plate is not promised.
    expect(screen.queryByText(/^Number plate/)).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Search again" }));
    expect(screen).toHavePathname("/search/results");
    expect(screen).toHaveSearchParams({
      from: withdrawn.board.meetingPoint.id,
      to: withdrawn.alight.meetingPoint.id,
      fromName: "Borgarnes",
      toName: "Blönduós",
      seats: "1",
      date: "2026-11-15",
    });
  });

  it("says when the driver answered first, and shows what they decided", async () => {
    const app = await openRequest(() => failure(409, "booking_not_requested"));
    app.change(unpaidBooking);
    await fireEvent.press(await screen.findByRole("button", { name: "Withdraw request" }));
    await fireEvent.press(screen.getByRole("button", { name: "Withdraw request" }));
    expect(await screen.findByText("Pay 2,900 ISK to confirm your seat")).toBeVisible();
    expect(screen.getByText("This request was already answered or ran out.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Withdraw request" })).toBeNull();
  });

  it("keeps the question open when withdrawing fails, to try again", async () => {
    let tries = 0;
    const { client } = await openRequest(() => {
      tries += 1;
      return tries === 1 ? failure(500, "internal_error") : ok(200, withdrawnHere);
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Withdraw request" }));
    await fireEvent.press(screen.getByRole("button", { name: "Withdraw request" }));
    expect(await screen.findByText(/^Withdraw your request\?/)).toBeVisible();
    expect(screen.getByRole("alert")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Withdraw request" }));
    expect(
      await screen.findByText("You withdrew this request. That never counts against you."),
    ).toBeVisible();
    expect(client.calls.filter((call) => call.path === "/v1/bookings/{id}/withdraw")).toHaveLength(
      2,
    );
  });

  it("offers search again on a declined request, on any day once that day has passed", async () => {
    const app = await renderApp(`/bookings/${declinedId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => ({
          ...declined,
          board: { ...declined.board, plannedAt: "2026-11-13T10:00:00.000Z" },
          alight: { ...declined.alight, plannedAt: "2026-11-13T12:05:00.000Z" },
        }));
        searchApi(client);
      },
    });
    expect(await screen.findByText("The driver couldn't take this request")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Search again" }));
    expect(screen).toHavePathname("/search/results");
    expect(app.getSearchParams()).not.toHaveProperty("date");
  });

  it("offers search again when the driver didn't answer in time", async () => {
    const app = await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => northBooking({ status: "expired" }));
        searchApi(client);
      },
    });
    expect(await screen.findByText("The driver didn't answer in time")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Search again" }));
    expect(screen).toHavePathname("/search/results");
    expect(app.getSearchParams()).toMatchObject({ date: "2026-11-15", seats: "1" });
  });

  it("tells a cancellation apart from a withdrawn request", async () => {
    await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => ({ ...paidBooking, status: "cancelled", confirmed: null }));
      },
    });
    expect(await screen.findByText("Cancelled")).toBeVisible();
    expect(screen.queryByText("Withdrawn")).toBeNull();
    expect(screen.queryByText(/^You withdrew/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Search again" })).toBeNull();
    expect(screen.queryByText(/^Number plate/)).toBeNull();
  });
});
