import {
  adminChangeSettingRoute,
  adminMeRoute,
  adminPreviewSettingRoute,
  adminSettingsHistoryRoute,
  adminSettingsRoute,
  type AdminMe,
  type AdminSetting,
  type AdminSettingChange,
} from "@shareride/contracts";
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

const required: AdminSetting = {
  key: "invite_code_required",
  group: "beta",
  kind: "switch",
  unit: null,
  value: 1,
  default: 1,
  min: 0,
  max: 1,
  step: 1,
};
const testers: AdminSetting = {
  key: "beta_max_testers",
  group: "beta",
  kind: "number",
  unit: "people",
  value: 1200,
  default: 150,
  min: 0,
  max: 1500,
  step: 1,
};

const price = (key: string, more: Partial<AdminSetting>): AdminSetting => ({
  key,
  group: "prices",
  kind: "number",
  unit: "kr_per_km",
  value: 15,
  default: 15,
  min: 5,
  max: 30,
  step: 1,
  ...more,
});
const rate = price("suggested_rate", {});
const cost = price("reference_cost_per_km", { value: 150, default: 150, min: 50, max: 150 });
const seats = price("max_capacity", { unit: "seats", value: 8, default: 8, min: 1, max: 8 });

const freeUntil = price("free_cancellation_until", {
  group: "changes",
  unit: "minutes",
  value: 15,
  default: 15,
  min: 0,
  max: 120,
});
const answerIn = price("request_expiry", {
  group: "booking",
  unit: "hours",
  value: 1,
  default: 12,
  min: 1,
  max: 48,
});

const changeOf = (more: Partial<AdminSettingChange> = {}): AdminSettingChange => ({
  version: 1,
  key: "beta_max_testers",
  oldValue: 150,
  newValue: 1200,
  reason: "A second corridor",
  changedBy: { userId: anna.userId, firstName: "Anna" },
  changedAt: "2026-11-18T09:05:00.000Z",
  ...more,
});

function start(path = "/admin/settings") {
  window.history.replaceState(null, "", path);
  const api = createFakeApi();
  const state = {
    version: 1,
    settings: [required, testers, rate, cost, seats, answerIn, freeUntil],
    history: [changeOf()],
  };
  api.on(adminMeRoute, { status: 200, data: anna });
  api.on(adminSettingsRoute, () => ({
    status: 200,
    data: { version: state.version, settings: state.settings },
  }));
  api.on(adminSettingsHistoryRoute, (input) => {
    const before = (input["query"] as { before?: number } | undefined)?.before;
    const older = state.history.filter((entry) => before === undefined || entry.version < before);
    return {
      status: 200,
      data: { changes: older.slice(0, 2), next: older[2] ? older[1]?.version : null },
    };
  });
  render(<ConsoleApp client={api.client} passkeys={createFakePasskeys().passkeys} />);
  return { api, state };
}

const card = async (name: string) => {
  const heading = await screen.findByRole("heading", { name });
  const item = heading.closest("li");
  if (item === null) throw new Error(`"${name}" is not in a card.`);
  return within(item);
};

describe("the Settings page", () => {
  it("is in the menu", async () => {
    start("/admin");
    const menu = await screen.findByRole("navigation", { name: "Console menu" });
    fireEvent.click(within(menu).getByRole("link", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "Settings", level: 1 })).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/settings");
  });

  it("lists each setting under its group with its value, default and range", async () => {
    start();
    expect(await screen.findByRole("heading", { name: "Beta", level: 2 })).toBeTruthy();
    const cap = await card("Most testers");
    expect(cap.getByText("1,200 people")).toBeTruthy();
    expect(cap.getByText("Default: 150 people. From 0 to 1,500.")).toBeTruthy();
    expect(cap.getByText(/No invite code works once this many/)).toBeTruthy();
    const gate = await card("Invite code required");
    expect(gate.getByText("On")).toBeTruthy();
    expect(gate.getByText("Default: On.")).toBeTruthy();
  });

  it("changes a number with a reason, on the version it loaded, and shows the effect first", async () => {
    const { api, state } = start();
    const cap = await card("Most testers");
    fireEvent.click(cap.getByRole("button", { name: "Change Most testers" }));
    const value = cap.getByLabelText<HTMLInputElement>("New value, in people");
    expect(value.value).toBe("1200");
    expect(value.min).toBe("0");
    expect(value.max).toBe("1500");
    fireEvent.change(value, { target: { value: "1000" } });
    expect(cap.getByText("Changes from 1,200 people to 1,000 people.")).toBeTruthy();
    fireEvent.change(cap.getByLabelText("Why"), { target: { value: "Fewer for now" } });

    api.on(adminChangeSettingRoute, () => {
      state.version = 2;
      state.settings = [required, { ...testers, value: 1000 }];
      state.history = [changeOf({ version: 2, oldValue: 1200, newValue: 1000 }), changeOf()];
      return { status: 200, data: { version: 2, settings: state.settings } };
    });
    fireEvent.click(cap.getByRole("button", { name: "Save" }));

    expect(await (await card("Most testers")).findByText("1,000 people")).toBeTruthy();
    expect(api.called(adminChangeSettingRoute).map((call) => call.input)).toEqual([
      {
        params: { key: "beta_max_testers" },
        body: { value: 1000, reason: "Fewer for now", version: 1 },
      },
    ]);
    expect((await screen.findByRole("status")).textContent).toBe("Saved: Most testers.");
    const history = within(await screen.findByRole("list", { name: "History" }));
    await waitFor(() => {
      expect(history.getAllByRole("listitem")).toHaveLength(2);
    });
  });

  it("turns a switch off, saying what that does", async () => {
    const { api } = start();
    const gate = await card("Invite code required");
    fireEvent.click(gate.getByRole("button", { name: "Change Invite code required" }));
    expect(gate.getByText("Changes from On to Off.")).toBeTruthy();
    fireEvent.change(gate.getByLabelText("Why"), { target: { value: "Launch day" } });
    api.on(adminChangeSettingRoute, {
      status: 200,
      data: { version: 2, settings: [{ ...required, value: 0 }, testers] },
    });
    fireEvent.click(gate.getByRole("button", { name: "Save" }));
    expect(await (await card("Invite code required")).findByText("Off")).toBeTruthy();
    expect(api.called(adminChangeSettingRoute)[0]?.input["body"]).toEqual({
      value: 0,
      reason: "Launch day",
      version: 1,
    });
  });

  it("asks for a reason and a value in the range before it sends anything", async () => {
    const { api } = start();
    const cap = await card("Most testers");
    fireEvent.click(cap.getByRole("button", { name: "Change Most testers" }));
    fireEvent.change(cap.getByLabelText("New value, in people"), { target: { value: "1501" } });
    fireEvent.click(cap.getByRole("button", { name: "Save" }));
    expect(cap.getByText("Choose a whole number from 0 to 1,500.")).toBeTruthy();
    expect(cap.getByText("Say why, so the history explains the change.")).toBeTruthy();
    expect(api.called(adminChangeSettingRoute)).toHaveLength(0);

    fireEvent.click(cap.getByRole("button", { name: "Cancel" }));
    expect(cap.queryByLabelText("Why")).toBeNull();
  });

  it("loads the settings again when someone changed them meanwhile", async () => {
    const { api, state } = start();
    const cap = await card("Most testers");
    fireEvent.click(cap.getByRole("button", { name: "Change Most testers" }));
    fireEvent.change(cap.getByLabelText("New value, in people"), { target: { value: "900" } });
    fireEvent.change(cap.getByLabelText("Why"), { target: { value: "Fewer" } });
    api.on(adminChangeSettingRoute, () => {
      state.version = 2;
      state.settings = [{ ...required, value: 0 }, testers];
      return { status: 409, error: { code: "settings_changed" } };
    });
    fireEvent.click(cap.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "A setting was changed since this page loaded. Here they are as they are now: check and save again.",
    );
    expect(await (await card("Invite code required")).findByText("Off")).toBeTruthy();
  });

  it("shows the history with when, who, what and why, and older changes on request", async () => {
    const { state } = start();
    state.history = [
      changeOf({
        version: 3,
        key: "invite_code_required",
        oldValue: 1,
        newValue: 0,
        changedBy: null,
      }),
      changeOf({ version: 2, oldValue: 1200, newValue: 1000, reason: "Fewer for now" }),
      changeOf(),
    ];
    const list = within(await screen.findByRole("list", { name: "History" }));
    await waitFor(() => {
      expect(list.getAllByRole("listitem")).toHaveLength(2);
    });
    const [newest, second] = list.getAllByRole("listitem");
    expect(newest?.textContent).toContain("Invite code required: from On to Off");
    expect(newest?.textContent).toContain("With a command on the server");
    expect(second?.textContent).toContain("18 November 2026 at 09:05");
    expect(second?.textContent).toContain("By Anna");
    expect(second?.textContent).toContain("Most testers: from 1,200 people to 1,000 people");
    expect(second?.textContent).toContain("Fewer for now");

    fireEvent.click(screen.getByRole("button", { name: "Show older changes" }));
    await waitFor(() => {
      expect(list.getAllByRole("listitem")).toHaveLength(3);
    });
    expect(screen.queryByRole("button", { name: "Show older changes" })).toBeNull();
  });

  it("shows what a price value does to the example trip before it is saved", async () => {
    const { api } = start();
    expect(await screen.findByRole("heading", { name: "Prices and seats", level: 2 })).toBeTruthy();
    const card_ = await card("Suggested rate");
    expect(card_.getByText("15 kr per km")).toBeTruthy();
    api.on(adminPreviewSettingRoute, {
      status: 200,
      data: {
        price: {
          distanceKm: 388,
          seats: 3,
          before: { price: 5800, highestLevel: 250 },
          after: { price: 4700, highestLevel: 310 },
        },
      },
    });
    fireEvent.click(card_.getByRole("button", { name: "Change Suggested rate" }));
    fireEvent.change(card_.getByLabelText("New value, in kr per km"), { target: { value: "12" } });
    expect(card_.getByText("Changes from 15 kr per km to 12 kr per km.")).toBeTruthy();
    expect(
      await card_.findByText(
        "Reykjavík to Akureyri (388 km) with 3 seats: a seat at 100% costs 5,800 ISK now and would cost 4,700 ISK. The highest price level is 250% now and would be 310%.",
      ),
    ).toBeTruthy();
    expect(card_.getByText(/Trips already published keep their prices/)).toBeTruthy();
    expect(api.called(adminPreviewSettingRoute).map((call) => call.input)).toEqual([
      { params: { key: "suggested_rate" }, body: { value: 12 } },
    ]);
  });

  it("refuses a suggested rate the largest car's cap cannot carry, and sends nothing", async () => {
    const { api } = start();
    const card_ = await card("Suggested rate");
    fireEvent.click(card_.getByRole("button", { name: "Change Suggested rate" }));
    fireEvent.change(card_.getByLabelText("New value, in kr per km"), { target: { value: "17" } });
    fireEvent.change(card_.getByLabelText("Why"), { target: { value: "Fuel went up" } });
    expect(card_.getByRole("alert").textContent).toContain(
      "the suggested rate can be 16 kr per km at most",
    );
    expect(card_.queryByText(/Changes from/)).toBeNull();
    fireEvent.click(card_.getByRole("button", { name: "Save" }));
    expect(api.called(adminChangeSettingRoute)).toHaveLength(0);
    expect(api.called(adminPreviewSettingRoute)).toHaveLength(0);
  });

  it("says a value's effect in words when it has no example price", async () => {
    const { api } = start();
    const card_ = await card("Most seats on a trip");
    expect(card_.getByText("8 seats")).toBeTruthy();
    fireEvent.click(card_.getByRole("button", { name: "Change Most seats on a trip" }));
    fireEvent.change(card_.getByLabelText("New value, in seats"), { target: { value: "7" } });
    expect(card_.getByText("Changes from 8 seats to 7 seats.")).toBeTruthy();
    expect(api.called(adminPreviewSettingRoute)).toHaveLength(0);
  });

  it("shows the booking and cancellation values in minutes and hours, each with whom a change reaches", async () => {
    const { api } = start();
    expect(
      await screen.findByRole("heading", { name: "Booking and paying", level: 2 }),
    ).toBeTruthy();
    expect((await card("Time to answer a request")).getByText("1 hour")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Changes and cancellations", level: 2 }),
    ).toBeTruthy();
    expect(screen.getAllByText(/^The terms of service state these values\./)).toHaveLength(2);
    const free = await card("Free cancellation until");
    expect(free.getByText("15 minutes")).toBeTruthy();
    expect(free.getByText("Default: 15 minutes. From 0 to 120.")).toBeTruthy();
    expect(
      free.getByText(/Bookings already made keep the rule they were made under\.$/),
    ).toBeTruthy();
    fireEvent.click(free.getByRole("button", { name: "Change Free cancellation until" }));
    fireEvent.change(free.getByLabelText("New value, in minutes"), { target: { value: "60" } });
    expect(free.getByText("Changes from 15 minutes to 60 minutes.")).toBeTruthy();
    expect(api.called(adminPreviewSettingRoute)).toHaveLength(0);
  });
});
