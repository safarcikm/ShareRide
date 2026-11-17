import { act, fireEvent, screen, within } from "expo-router/testing-library";
import { getLocales } from "expo-localization";
import { AccessibilityInfo, Dimensions, Linking } from "react-native";
import type { MeetingPointSummary } from "@shareride/contracts";
import { mapSize, project } from "@shareride/ui/map";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import {
  bsi,
  details,
  fitjar,
  hof,
  kef,
  meetingPoints,
  thorlakshofn,
} from "@/testing/meeting-points";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: jest.fn() }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

function deviceLanguage(languageTag: string) {
  (getLocales as jest.Mock).mockReturnValue([{ languageTag }]);
}

beforeEach(() => {
  deviceLanguage("en-GB");
});

/** The catalogue and one point's details, as the API answers them. */
function catalogue(client: FakeClient) {
  client.answer("/v1/meeting-points", () => ok(200, { meetingPoints }));
  client.answer("/v1/meeting-points/{id}", (input) => {
    const { id } = input["params"] as { id: string };
    const point = meetingPoints.find((known) => known.id === id);
    return point === undefined
      ? failure(404, "not_found")
      : ok(
          200,
          details(point, {
            aliases: point === kef ? ["KEF", "Leifsstöð"] : [],
            whereToStand:
              point === bsi
                ? { is: "Við strætóskýlið", en: "By the bus shelter at the main entrance" }
                : null,
            lastCheckedOn: point === bsi ? "2026-11-14" : null,
          }),
        );
  });
}

async function openMeetingPoints(setUp = catalogue) {
  const app = await renderApp("/meeting-points", { setUp });
  expect(await screen.findByRole("header", { name: "Meeting points" })).toBeVisible();
  return app;
}

/** Phones show the map first; this switches to the list. */
async function openList(setUp = catalogue) {
  const app = await openMeetingPoints(setUp);
  await fireEvent.press(await screen.findByRole("radio", { name: "List" }));
  return app;
}

describe("Meeting points", () => {
  it("lists the points by region, in the order of the regions, sorted by name", async () => {
    await openList();
    const headings = screen
      .getAllByRole("header")
      .map((heading) => heading.props.children as string);
    expect(headings).toEqual(["Meeting points", "Capital area", "Southern Peninsula", "Northeast"]);
    const names = screen
      .getAllByTestId("meeting-point-name")
      .map((name) => name.props.children as string);
    expect(names).toEqual(["BSÍ bus terminal", "Fitjar", "Keflavík Airport", "Hof, Akureyri"]);
    expect(
      screen.getByRole("button", {
        name: "BSÍ bus terminal, Bus hub, Reykjavíkurborg, Sample meeting point",
      }),
    ).toBeVisible();
  });

  it("marks sample points and paused points", async () => {
    await openList();
    expect(screen.getByText(/These are sample meeting points/)).toBeVisible();
    expect(screen.getAllByText("Sample meeting point")).toHaveLength(4);
    const paused = screen.getByRole("button", { name: /^Fitjar/ });
    expect(within(paused).getByText("Not in use at the moment")).toBeVisible();
  });

  it("shows the Icelandic names and regions in Icelandic", async () => {
    deviceLanguage("is-IS");
    await renderApp("/meeting-points", { setUp: catalogue });
    expect(await screen.findByRole("header", { name: "Mótsstaðir" })).toBeVisible();
    expect(
      screen.getByRole("image", {
        name: "Kort af Íslandi með 4 mótsstöðum. Listinn sýnir sömu staði.",
      }),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: "Listi" }));
    expect(screen.getByRole("header", { name: "Höfuðborgarsvæðið" })).toBeVisible();
    expect(screen.getByText("BSÍ umferðarmiðstöð")).toBeVisible();
    expect(screen.getByText("Keflavíkurflugvöllur")).toBeVisible();
  });

  it("says so when there are no meeting points", async () => {
    await openMeetingPoints((client) => {
      client.answer("/v1/meeting-points", () => ok(200, { meetingPoints: [] }));
    });
    expect(screen.getByText("There are no meeting points yet.")).toBeVisible();
    expect(screen.queryByText(/These are sample meeting points/)).toBeNull();
    expect(screen.queryByRole("radio", { name: "Map" })).toBeNull();
  });

  it("shows an error and tries again when the list cannot load", async () => {
    const app = await openMeetingPoints((client) => {
      client.answer("/v1/meeting-points", () => failure(0, "network_error"));
    });
    expect(screen.getByText(/We couldn't reach ShareRide/)).toBeVisible();
    expect(screen.queryByRole("radio", { name: "Map" })).toBeNull();
    catalogue(app.client);
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("image", { name: /^Map of Iceland with 4/ })).toBeVisible();
  });

  it("opens from the welcome screen", async () => {
    await renderApp("/", { setUp: catalogue });
    await fireEvent.press(await screen.findByRole("button", { name: "See the meeting points" }));
    expect(await screen.findByRole("header", { name: "Meeting points" })).toBeVisible();
    expect(screen).toHavePathname("/meeting-points");
  });

  it("opens from my profile", async () => {
    await renderApp("/profile", { me: completeMe, setUp: catalogue });
    await screen.findByRole("header", { name: "My profile" });
    await fireEvent.press(screen.getByRole("button", { name: "Meeting points" }));
    expect(await screen.findByRole("header", { name: "Meeting points" })).toBeVisible();
  });
});

describe("The map of meeting points", () => {
  /** The map as wide as a phone's column, in points. */
  const width = 343;

  async function layOutMap() {
    await fireEvent(screen.getByTestId("map-area"), "layout", {
      nativeEvent: {
        layout: { x: 0, y: 0, width, height: (width * mapSize.height) / mapSize.width },
      },
    });
  }

  async function tapAt(point: MeetingPointSummary) {
    const { x, y } = project(point.position);
    const scale = width / mapSize.width;
    await fireEvent.press(screen.getByTestId("map-touch"), {
      nativeEvent: { locationX: x * scale, locationY: y * scale },
    });
  }

  const names = () =>
    screen.getAllByTestId("meeting-point-name").map((name) => name.props.children as string);

  afterEach(async () => {
    // The screen is still on show here, so its update goes through act.
    await act(() => {
      Dimensions.set({ window: { width: 750, height: 1334, scale: 2, fontScale: 2 } });
    });
  });

  it("comes first on phones, with the list a choice away", async () => {
    await openMeetingPoints();
    expect(
      screen.getByRole("image", {
        name: "Map of Iceland with 4 meeting points. The list shows the same points.",
      }),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: "Map" })).toBeChecked();
    expect(screen.getByText(/These are sample meeting points/)).toBeVisible();
    expect(
      screen.getByText("Choose a dot to see its meeting point, and choose it again to open it."),
    ).toBeVisible();
    expect(screen.queryByRole("header", { name: "Capital area" })).toBeNull();

    await fireEvent.press(screen.getByRole("radio", { name: "List" }));
    expect(screen.getByRole("header", { name: "Capital area" })).toBeVisible();
    expect(screen.queryByRole("image", { name: /^Map of Iceland/ })).toBeNull();
  });

  it("shows a point's summary on a tap, and its details on a second", async () => {
    await openMeetingPoints();
    await layOutMap();
    await tapAt(hof);
    expect(names()).toEqual(["Hof, Akureyri"]);
    expect(screen.queryByText(/^Choose a dot/)).toBeNull();

    await tapAt(hof);
    expect(await screen.findByRole("header", { name: "Hof, Akureyri" })).toBeVisible();
    expect(screen).toHavePathname(`/meeting-points/${hof.id}`);
  });

  it("shows every point at a spot it shares, nearest first, to choose from", async () => {
    await openMeetingPoints();
    await layOutMap();
    // Keflavík Airport and Fitjar are 4 km apart: one spot on a phone.
    await tapAt(kef);
    expect(names()).toEqual(["Keflavík Airport", "Fitjar"]);
    await tapAt(kef);
    expect(screen).toHavePathname("/meeting-points");

    await fireEvent.press(screen.getByRole("button", { name: /^Fitjar/ }));
    expect(await screen.findByRole("header", { name: "Fitjar" })).toBeVisible();
  });

  it("sits beside the list on wide screens", async () => {
    Dimensions.set({ window: { width: 1280, height: 800, scale: 1, fontScale: 1 } });
    await openMeetingPoints();
    expect(
      within(screen.getByTestId("aside")).getByRole("image", { name: /^Map of Iceland with 4/ }),
    ).toBeVisible();
    expect(screen.getByRole("header", { name: "Capital area" })).toBeVisible();
    expect(screen.queryByRole("radio", { name: "Map" })).toBeNull();
  });

  it("waits for the points before it shows beside the list", async () => {
    Dimensions.set({ window: { width: 1280, height: 800, scale: 1, fontScale: 1 } });
    await openMeetingPoints((client) => {
      client.answer("/v1/meeting-points", () => failure(0, "network_error"));
    });
    expect(screen.getByText(/We couldn't reach ShareRide/)).toBeVisible();
    expect(screen.queryByTestId("aside")).toBeNull();
    expect(screen.queryByRole("image", { name: /^Map of Iceland/ })).toBeNull();
  });
});

describe("Meeting point details", () => {
  async function openDetails(name: RegExp) {
    const app = await openList();
    await fireEvent.press(screen.getByRole("button", { name }));
    return app;
  }

  it("shows where to stand, the amenities, the season and the last check", async () => {
    await openDetails(/^BSÍ/);
    expect(await screen.findByRole("header", { name: "BSÍ bus terminal" })).toBeVisible();
    expect(screen).toHavePathname(`/meeting-points/${bsi.id}`);
    expect(screen.getByText("BSÍ umferðarmiðstöð")).toBeVisible();
    expect(screen.getByText("Bus hub · Reykjavíkurborg, Capital area")).toBeVisible();
    expect(screen.getByText("By the bus shelter at the main entrance")).toBeVisible();
    for (const amenity of ["Shelter", "Toilets", "Shop"]) {
      expect(screen.getByText(amenity)).toBeVisible();
    }
    expect(screen.getByText("In use all year")).toBeVisible();
    expect(screen.getByText("Last checked 14 November 2026")).toBeVisible();
    expect(screen.getByText("Sample meeting point")).toBeVisible();
    expect(
      screen.getByRole("image", { name: "BSÍ bus terminal on a map of Iceland" }),
    ).toBeVisible();
  });

  it("shows the season in months and the other names", async () => {
    await openDetails(/^Hof/);
    expect(await screen.findByText("In use from May to September")).toBeVisible();
    expect(screen.queryByText("Where to stand")).toBeNull();
    expect(screen.queryAllByText("Hof, Akureyri")).toHaveLength(1);

    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    await fireEvent.press(await screen.findByRole("button", { name: /^Keflavík Airport/ }));
    expect(await screen.findByText("Also known as KEF, Leifsstöð")).toBeVisible();
  });

  it("shows why a paused point is not in use", async () => {
    await openDetails(/^Fitjar/);
    const notice = await screen.findByTestId("notice");
    expect(
      within(notice).getByText("Not in use at the moment. Closed for roadworks"),
    ).toBeVisible();
  });

  it("opens the point in the phone's maps app", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue();
    await openDetails(/^BSÍ/);
    await fireEvent.press(await screen.findByRole("button", { name: "Open in maps" }));
    expect(openURL).toHaveBeenCalledWith(
      "https://maps.apple.com/?ll=64.1376,-21.9365&q=BS%C3%8D%20bus%20terminal",
    );
  });

  it("says so when the maps app cannot open", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("No maps app"));
    await openDetails(/^BSÍ/);
    await fireEvent.press(await screen.findByRole("button", { name: "Open in maps" }));
    expect(await screen.findByText("We couldn't open a maps app on this device.")).toBeVisible();
  });

  it("says so when the point is not shown any more", async () => {
    await renderApp("/meeting-points/0190a1d6-0000-7000-8000-0000000000ff", { setUp: catalogue });
    expect(
      await screen.findByText("We couldn't find this meeting point. It may no longer be in use."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

describe("Place search", () => {
  function search(client: FakeClient) {
    catalogue(client);
    client.answer("/v1/places/search", (input) => {
      const { q } = input["query"] as { q: string };
      if (q === "thorlakshofn")
        return ok(200, { results: [{ kind: "place", place: thorlakshofn }] });
      if (q === "KEF") return ok(200, { results: [{ kind: "meetingPoint", meetingPoint: kef }] });
      return ok(200, { results: [] });
    });
    client.answer("/v1/places/{id}/nearest-meeting-points", () =>
      ok(200, {
        place: thorlakshofn,
        withinReach: true,
        meetingPoints: [
          { meetingPoint: fitjar, distanceM: 2440 },
          { meetingPoint: hof, distanceM: 38_200 },
        ],
      }),
    );
  }

  it("finds a town typed without Icelandic letters and lists its nearest points", async () => {
    const app = await openMeetingPoints(search);
    await fireEvent.changeText(screen.getByLabelText("Town or meeting point"), "thorlakshofn");
    const result = await screen.findByRole("button", { name: "Þorlákshöfn, Town, South" });
    expect(screen.queryByRole("header", { name: "Capital area" })).toBeNull();
    expect(app.client.calls.filter((call) => call.path === "/v1/places/search")).toHaveLength(1);

    await fireEvent.press(result);
    expect(await screen.findByRole("header", { name: "Þorlákshöfn" })).toBeVisible();
    expect(screen).toHavePathname(`/places/${thorlakshofn.id}`);
    expect(screen.getByRole("header", { name: "Nearest meeting points" })).toBeVisible();
    expect(screen.getByText("2.4 km away")).toBeVisible();
    expect(screen.getByText("38 km away")).toBeVisible();
    expect(screen.queryByText(/There are no meeting points near/)).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: /^Fitjar/ }));
    expect(await screen.findByRole("header", { name: "Fitjar" })).toBeVisible();
  });

  it("opens a meeting point found by its alias", async () => {
    await openMeetingPoints(search);
    await fireEvent.changeText(screen.getByLabelText("Town or meeting point"), "KEF");
    await fireEvent.press(await screen.findByRole("button", { name: /^Keflavík Airport/ }));
    expect(await screen.findByText("Also known as KEF, Leifsstöð")).toBeVisible();
  });

  it("waits for a second letter and shows the list again when the field is cleared", async () => {
    const app = await openList(search);
    const field = screen.getByLabelText("Town or meeting point");
    await fireEvent.changeText(field, "K");
    expect(screen.getByRole("header", { name: "Capital area" })).toBeVisible();
    await fireEvent.changeText(field, "KEF");
    await screen.findByRole("button", { name: /^Keflavík Airport/ });
    await fireEvent.changeText(field, "");
    expect(screen.getByRole("header", { name: "Capital area" })).toBeVisible();
    expect(app.client.calls.filter((call) => call.path === "/v1/places/search")).toHaveLength(1);
  });

  it("says how many places were found, and tells screen readers", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await openMeetingPoints(search);
    await fireEvent.changeText(screen.getByLabelText("Town or meeting point"), "KEF");
    const status = await screen.findByText("1 place found");
    expect(status).toBeVisible();
    expect(screen.getByTestId("search-status")).toHaveProp("accessibilityLiveRegion", "polite");
    expect(announce).toHaveBeenCalledWith("1 place found");
  });

  it("drops the last results when the field is cleared", async () => {
    await openMeetingPoints(search);
    const field = screen.getByLabelText("Town or meeting point");
    await fireEvent.changeText(field, "KEF");
    await screen.findByRole("button", { name: /^Keflavík Airport/ });
    await fireEvent.changeText(field, "");
    await fireEvent.changeText(field, "zzz");
    expect(screen.queryByRole("button", { name: /^Keflavík Airport/ })).toBeNull();
    expect(await screen.findByText('No places found for "zzz"')).toBeVisible();
  });

  it("suggests a nearby town when nothing is found", async () => {
    await openMeetingPoints(search);
    await fireEvent.changeText(screen.getByLabelText("Town or meeting point"), "zzz");
    expect(await screen.findByText('No places found for "zzz"')).toBeVisible();
    expect(screen.getByText("Try the name of a nearby town.")).toBeVisible();
  });

  it("says so when no meeting point is near the place", async () => {
    await renderApp(`/places/${thorlakshofn.id}`, {
      setUp: (client) => {
        client.answer("/v1/places/{id}/nearest-meeting-points", () =>
          ok(200, {
            place: thorlakshofn,
            withinReach: false,
            meetingPoints: [{ meetingPoint: bsi, distanceM: 48_000 }],
          }),
        );
      },
    });
    expect(
      await screen.findByText(
        "There are no meeting points near this place yet. These are the nearest ones.",
      ),
    ).toBeVisible();
    expect(screen.getByText("48 km away")).toBeVisible();
  });
});
