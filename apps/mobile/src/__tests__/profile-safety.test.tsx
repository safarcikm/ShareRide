import { fireEvent, screen } from "expo-router/testing-library";
import type { FileReportBody } from "@shareride/contracts";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { paidBooking } from "@/testing/bookings";
import { callsTo } from "@/testing/chat";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { annaProfile, annaProfileId, annaReviews, profileApi } from "@/testing/people";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
// Saturday 14 November 2026, noon in Iceland: the north trip is on Sunday.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));

// Reporting and blocking from a profile (spec 9, 3.1.1 and 3.2.1). All made up.

const reviewId = annaReviews[0]?.id ?? "";
/** My own profile, as others see it. */
const myProfile = { ...annaProfile, profileId: completeMe.profileId, firstName: "Sigga" };

const reportsSent = (client: FakeClient) =>
  callsTo(client, "/v1/reports", () => true).map((call) => (call.input as { body: unknown }).body);
const blocksSent = (client: FakeClient) =>
  callsTo(client, "/v1/people/{profileId}/block", () => true).map(
    (call) => (call.input as { params: unknown }).params,
  );

/**
 * Anna's profile, opened by a member signed in. A report is filed as the
 * server would; blocking answers `together`, or `block` says otherwise.
 */
async function openProfile(
  options: {
    readonly together?: readonly (typeof paidBooking)[];
    readonly block?: () => unknown;
    readonly report?: () => unknown;
  } = {},
) {
  const app = await renderApp(`/people/${annaProfileId}`, {
    me: completeMe,
    setUp: (client) => {
      profileApi(client, [annaProfile, myProfile]);
      client.answer(
        "/v1/reports",
        (input) => {
          const { about } = input["body"] as FileReportBody;
          return (
            options.report?.() ??
            ok(201, {
              id: "0190a1d6-0000-7000-8000-0000000000c1",
              kind: about.kind === "profile" ? "user" : about.kind,
              category: "offensive",
              firstName: "Anna",
              filedAt: "2026-11-14T12:00:00.000Z",
              status: "open",
              outcome: null,
              closedAt: null,
            })
          );
        },
        "post",
      );
      client.answer(
        "/v1/people/{profileId}/block",
        () => options.block?.() ?? ok(200, { together: options.together ?? [] }),
        "post",
      );
    },
  });
  await screen.findByRole("header", { name: "Anna" });
  return app;
}

async function sendReport(category: string) {
  await fireEvent.press(await screen.findByRole("radio", { name: category }));
  await fireEvent.press(screen.getByRole("button", { name: "Send report" }));
}

describe("Report and Block on a profile (spec 9, 3.1.1 and 3.2.1)", () => {
  it("offers Report, Block and the community rules on another person's profile", async () => {
    await openProfile();
    expect(screen.getByRole("button", { name: "Report Anna" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Block Anna" })).toBeVisible();
    await fireEvent.press(screen.getByRole("link", { name: "Read the community rules" }));
    expect(screen).toHavePathname("/legal/community-rules");
  });

  it("offers none of it on my own profile, nor when I see it as others do", async () => {
    await renderApp(`/people/${completeMe.profileId}`, {
      me: completeMe,
      setUp: (client) => {
        profileApi(client, [myProfile]);
      },
    });
    expect(await screen.findByRole("header", { name: "Sigga" })).toBeVisible();
    expect(await screen.findByText("On time and careful.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Report / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Block / })).toBeNull();

    await renderApp("/profile/preview", {
      me: completeMe,
      setUp: (client) => {
        profileApi(client, [myProfile]);
      },
    });
    expect(await screen.findByText("On time and careful.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Report / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Block / })).toBeNull();
  });

  it("reports a person from their profile, then offers to block them too", async () => {
    const { client } = await openProfile();
    await fireEvent.press(screen.getByRole("button", { name: "Report Anna" }));
    expect(await screen.findByRole("header", { name: "Report Anna" })).toBeVisible();
    // The address names the profile, as the profile's own does: never a user ID.
    expect(screen).toHaveSearchParams({ kind: "profile", id: annaProfileId });
    // No conversation to point to: the hint for a chat's report is not shown.
    expect(screen.queryByText(/report that message in the chat instead/)).toBeNull();

    await sendReport("False profile, car or licence");
    expect(
      await screen.findByRole("header", { name: "Thank you. We look at every report." }),
    ).toBeVisible();
    expect(reportsSent(client)).toEqual([
      {
        about: { kind: "profile", profileId: annaProfileId },
        category: "false_info",
        description: "",
      },
    ]);

    await fireEvent.press(screen.getByRole("button", { name: "Block Anna too" }));
    expect(await screen.findByRole("header", { name: "Block Anna?" })).toBeVisible();
    expect(screen).toHavePathname(`/people/${annaProfileId}/block`);
  });

  it("says when the person is not there to report any more", async () => {
    await renderApp(`/report?kind=profile&id=${annaProfileId}`, {
      me: completeMe,
      setUp: (client) => {
        profileApi(client, []);
      },
    });
    expect(await screen.findByText("This can no longer be reported.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send report" })).toBeNull();
  });

  it("reports a review, named by who wrote it and when", async () => {
    const { client } = await openProfile();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Report review by Gunna, November 2026" }),
    );
    expect(await screen.findByRole("header", { name: "Report review" })).toBeVisible();
    expect(screen).toHaveSearchParams({ kind: "review", id: reviewId });

    await sendReport("Offensive content");
    expect(
      await screen.findByRole("header", { name: "Thank you. We look at every report." }),
    ).toBeVisible();
    expect(reportsSent(client)).toEqual([
      { about: { kind: "review", reviewId }, category: "offensive", description: "" },
    ]);
    // The review's author has no profile reference here: nothing to block through.
    expect(screen.queryByRole("button", { name: /too$/ })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(screen).toHavePathname(`/people/${annaProfileId}`);
  });

  it("says when the review can no longer be reported", async () => {
    await openProfile({ report: () => failure(404, "not_found") });
    await fireEvent.press(
      await screen.findByRole("button", { name: "Report review by Gunna, November 2026" }),
    );
    await sendReport("Something else");
    expect(await screen.findByText("This can no longer be reported.")).toBeVisible();
  });

  it("asks first, then blocks, lists what we still share, and goes back to the profile", async () => {
    const { client } = await openProfile({ together: [paidBooking] });
    await fireEvent.press(screen.getByRole("button", { name: "Block Anna" }));
    expect(await screen.findByRole("header", { name: "Block Anna?" })).toBeVisible();
    expect(blocksSent(client)).toEqual([]);

    await fireEvent.press(screen.getByRole("button", { name: "Block Anna" }));
    expect(await screen.findByRole("header", { name: "Anna is blocked." })).toBeVisible();
    expect(blocksSent(client)).toEqual([{ profileId: annaProfileId }]);
    expect(
      screen.getByText(
        "You still have a booking together. You can cancel it under the usual rules.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Cancel booking, Sunday 15 November, Borgarnes → Blönduós",
      }),
    ).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: "Back to the profile" }));
    expect(screen).toHavePathname(`/people/${annaProfileId}`);
    expect(await screen.findByRole("header", { name: "Anna" })).toBeVisible();
  });

  it("says when blocking failed, and when the person is not there any more", async () => {
    await openProfile({ block: () => failure(500, "internal") });
    await fireEvent.press(screen.getByRole("button", { name: "Block Anna" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Block Anna" }));
    expect(await screen.findByText("We couldn't block this person. Try again.")).toBeVisible();

    await renderApp(`/people/${annaProfileId}/block`, {
      me: completeMe,
      setUp: (client) => {
        profileApi(client, []);
      },
    });
    expect(
      await screen.findByText("This profile isn't available. The person may have left ShareRide."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Block / })).toBeNull();
  });
});
