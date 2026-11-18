// @vitest-environment jsdom
import { adminHomeRoute, adminMeRoute, type AdminHome, type AdminMe } from "@shareride/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ConsoleApp } from "../app.tsx";
import { createFakeApi, createFakePasskeys } from "../testing/fake-api.ts";

// The console's home page (spec 10, 3.1.1; milestone 11, PR 14). All made up.

const anna: AdminMe = {
  userId: "0196f000-0000-7000-8000-0000000000a1",
  firstName: "Anna",
  locale: "en",
  sessionEndsAt: "2026-11-16T23:00:00.000Z",
};

const quiet: AdminHome = {
  reports: { urgent: 0, other: 0 },
  appeals: 0,
  disputes: 0,
  meetingPointProblems: 0,
  meetingPointReviewsOverdue: 0,
  failedNotifications: 0,
  watched: 0,
  newFeedback: 0,
  placesLeft: null,
  switchesOff: [],
};

function start(home: AdminHome | null, locale: AdminMe["locale"] = "en") {
  window.history.replaceState(null, "", "/admin");
  const api = createFakeApi();
  api.on(adminMeRoute, { status: 200, data: { ...anna, locale } });
  api.on(
    adminHomeRoute,
    home === null ? { status: 500, error: { code: "internal" } } : { status: 200, data: home },
  );
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  return api;
}

afterEach(cleanup);

const hrefOf = async (name: string) =>
  (await screen.findByRole("link", { name })).getAttribute("href");

describe("the console's home page (spec 10, 3.1.1)", () => {
  it("says so when nothing is waiting", async () => {
    start(quiet);
    expect(await screen.findByRole("heading", { name: "Today", level: 2 })).toBeTruthy();
    expect(screen.getByText("Nothing is waiting for you.")).toBeTruthy();
    expect(screen.queryByText(/places? left/)).toBeNull();
  });

  it("shows each count as a link to its list, and leaves out a zero", async () => {
    start({
      ...quiet,
      reports: { urgent: 1, other: 3 },
      appeals: 2,
      disputes: 1,
      meetingPointProblems: 2,
      meetingPointReviewsOverdue: 4,
      watched: 1,
      newFeedback: 5,
    });
    expect(await hrefOf("1 urgent report")).toBe("/admin/reports");
    expect(await hrefOf("3 other open reports")).toBe("/admin/reports");
    expect(await hrefOf("2 appeals to answer")).toBe("/admin/appeals");
    expect(await hrefOf("1 dispute waiting for a decision")).toBe("/admin/disputes");
    expect(await hrefOf("2 open problem reports about meeting points")).toBe(
      "/admin/meeting-points/problems",
    );
    expect(await hrefOf("4 meeting points whose yearly review is overdue")).toBe(
      "/admin/meeting-points?reviewOverdue=true",
    );
    expect(await hrefOf("1 person below the reliability watch level")).toBe("/admin/reliability");
    expect(await hrefOf("5 new pieces of feedback")).toBe("/admin/feedback");
    expect(screen.queryByText(/notification/)).toBeNull();
    expect(screen.queryByText("Nothing is waiting for you.")).toBeNull();
  });

  it("counts failed notifications in words, as they have no page", async () => {
    start({ ...quiet, failedNotifications: 2 });
    expect(await screen.findByText("2 notifications failed in the last 24 hours")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /notifications failed/ })).toBeNull();
  });

  it("names the switches that are off and the places left, linking to where they are changed", async () => {
    start({ ...quiet, switchesOff: ["sms_sending", "signups_open"], placesLeft: 12 });
    expect(await hrefOf("Switches are off: Text messages, New sign-ups")).toBe("/admin/settings");
    expect(await hrefOf("12 places left in the beta")).toBe("/admin/invite-codes");
  });

  it("says when the beta is full", async () => {
    start({ ...quiet, placesLeft: 0 });
    expect(await screen.findByText("The beta is full: no places left")).toBeTruthy();
  });

  it("says when the counts could not be loaded, and tries again", async () => {
    const api = start(null);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Today's counts could not be loaded.",
    );
    api.on(adminHomeRoute, { status: 200, data: { ...quiet, appeals: 1 } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "1 appeal to answer" })).toBeTruthy();
  });

  it("reads right in Icelandic", async () => {
    start({ ...quiet, reports: { urgent: 2, other: 0 }, switchesOff: ["sms_sending"] }, "is");
    expect(await screen.findByRole("link", { name: "2 áríðandi tilkynningar" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Slökkt er á rofa: / })).toBeTruthy();
  });
});
