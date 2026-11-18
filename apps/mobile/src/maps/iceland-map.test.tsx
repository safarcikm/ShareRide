import { fireEvent, render, screen } from "@testing-library/react-native";
import { IcelandMap, type MapDot } from "./iceland-map";
import { alongRoads, glaciers, land, mapSize, project, roads } from "@shareride/ui/map";
import type * as UiMap from "@shareride/ui/map";
import { RouteMap } from "./route-map";

type Position = UiMap.Position;

// The real map, with the search for a way along the roads counted.
jest.mock("@shareride/ui/map", () => {
  const actual = jest.requireActual<typeof UiMap>("@shareride/ui/map");
  return { ...actual, alongRoads: jest.fn(actual.alongRoads) };
});

const bsi: MapDot = { id: "bsi", position: { latitude: 64.1376, longitude: -21.9365 } };
const hof: MapDot = { id: "hof", position: { latitude: 65.6839, longitude: -18.0878 } };
const kef: MapDot = { id: "kef", position: { latitude: 63.9971, longitude: -22.6245 } };
const fitjar: MapDot = { id: "fitjar", position: { latitude: 63.9897, longitude: -22.5482 } };

/** The map as wide as a phone's column, in points. */
const width = 343;

/** Lays the whole map out `width` points wide, as a screen would. */
async function layOut() {
  await fireEvent(screen.getByTestId("map-area"), "layout", {
    nativeEvent: {
      layout: { x: 0, y: 0, width, height: (width * mapSize.height) / mapSize.width },
    },
  });
}

/** Taps the whole map where a position is, moved by some points. */
async function tapAt(position: Position, moved = { x: 0, y: 0 }) {
  const { x, y } = project(position);
  const scale = width / mapSize.width;
  await fireEvent.press(screen.getByTestId("map-touch"), {
    nativeEvent: { locationX: x * scale + moved.x, locationY: y * scale + moved.y },
  });
}

describe("Our map of Iceland", () => {
  it("is one image for screen readers, with its label", async () => {
    await render(<IcelandMap label="Map of Iceland with 2 meeting points" dots={[bsi, hof]} />);
    expect(
      screen.getByRole("image", { name: "Map of Iceland with 2 meeting points" }),
    ).toBeVisible();
  });

  it("draws the land, the glaciers, the roads with the Ring Road on top, and the dots", async () => {
    await render(
      <IcelandMap
        label="Map"
        dots={[bsi, { ...hof, look: "chosen" }, { ...kef, look: "muted" }]}
      />,
    );
    // The drawing is hidden from screen readers: the image's label says it.
    const drawn = (testID: string) =>
      screen.getAllByTestId(testID, { includeHiddenElements: true });
    expect(drawn("map-land")[0]?.children).toHaveLength(land.length);
    expect(drawn("map-glaciers")[0]?.children).toHaveLength(glaciers.length);
    const ringRoad = roads.filter((road) => road.ring).length;
    expect(drawn("map-roads")[0]?.children).toHaveLength(roads.length - ringRoad);
    expect(drawn("map-ring-road")[0]?.children).toHaveLength(ringRoad);
    expect(drawn("map-dot")).toHaveLength(1);
    expect(drawn("map-dot-chosen")).toHaveLength(1);
    expect(drawn("map-dot-muted")).toHaveLength(1);
  });

  it("finds a line's way along the roads once, however the lines around it change", async () => {
    const found = alongRoads as jest.Mock;
    // Positions no other test draws a line through.
    const north = [kef.position, hof.position];
    const south = [fitjar.position, bsi.position];
    const lines = (part: readonly Position[]) => [
      { id: "north", positions: north, look: "route" as const },
      { id: "south", positions: south, look: "route" as const },
      { id: "shown", positions: part, look: "part" as const },
    ];
    found.mockClear();
    const map = await render(<IcelandMap label="Map" dots={[]} lines={lines(north)} fit />);
    // Two ways for three lines: the part is one of the routes.
    expect(found).toHaveBeenCalledTimes(2);
    await map.rerender(<IcelandMap label="Map" dots={[]} lines={lines(south)} fit />);
    expect(found).toHaveBeenCalledTimes(2);
    expect(screen.getAllByTestId("map-line-route", { includeHiddenElements: true })).toHaveLength(
      2,
    );
    expect(screen.getAllByTestId("map-line-part", { includeHiddenElements: true })).toHaveLength(1);
  });

  it("draws a trip's route along the roads, and the passenger's part over it", async () => {
    await render(
      <IcelandMap
        label="Map"
        dots={[kef, bsi, hof]}
        lines={[
          { id: "route", positions: [kef, bsi, hof].map((stop) => stop.position), look: "route" },
          { id: "part", positions: [bsi, hof].map((stop) => stop.position), look: "part" },
        ]}
      />,
    );
    const drawn = (testID: string) =>
      screen.getAllByTestId(testID, { includeHiddenElements: true });
    expect(drawn("map-line-route")).toHaveLength(1);
    expect(drawn("map-line-part")).toHaveLength(1);
    // Along the roads, Reykjavík to Akureyri takes many more points than its two
    // stops. The drawing's path is "M x y x y …".
    const path = String(drawn("map-line-part")[0]?.props.d);
    expect(path.slice(1).trim().split(/\s+/).length / 2).toBeGreaterThan(20);
  });

  it("shows the whole of Iceland, or the part that holds its dots and lines", async () => {
    await render(<IcelandMap label="Map" dots={[bsi]} />);
    expect(screen.getByTestId("map-area")).toHaveStyle({
      aspectRatio: mapSize.width / mapSize.height,
    });
    await render(<IcelandMap label="Map" dots={[bsi]} fit />);
    expect(screen.getByTestId("map-area")).toHaveStyle({ aspectRatio: 1.6 });
    await render(
      <IcelandMap
        label="Map"
        dots={[kef, bsi]}
        lines={[{ id: "part", positions: [kef.position, bsi.position], look: "part" }]}
        fit
      />,
    );
    expect(screen.getByTestId("map-area")).not.toHaveStyle({
      aspectRatio: mapSize.width / mapSize.height,
    });
    // A line alone sets the part shown: more than one spot, less than the whole.
    await render(
      <IcelandMap
        label="Map"
        dots={[]}
        lines={[{ id: "part", positions: [bsi.position, hof.position], look: "part" }]}
        fit
      />,
    );
    const area = screen.getByTestId("map-area");
    expect(area).not.toHaveStyle({ aspectRatio: 1.6 });
    expect(area).not.toHaveStyle({ aspectRatio: mapSize.width / mapSize.height });
  });

  it("tells which dots a tap is near, nearest first", async () => {
    const onPressDots = jest.fn();
    await render(
      <IcelandMap label="Map" dots={[bsi, hof, kef, fitjar]} onPressDots={onPressDots} />,
    );
    await layOut();
    await tapAt(hof.position, { x: 6, y: -4 });
    expect(onPressDots).toHaveBeenLastCalledWith(["hof"]);
    // Keflavík Airport and Fitjar are 4 km apart: one spot on a phone.
    await tapAt(kef.position, { x: -2, y: 0 });
    expect(onPressDots).toHaveBeenLastCalledWith(["kef", "fitjar"]);
  });

  it("tells when a tap is near no dot", async () => {
    const onPressDots = jest.fn();
    await render(<IcelandMap label="Map" dots={[bsi, hof]} onPressDots={onPressDots} />);
    await layOut();
    await tapAt({ latitude: 64.4, longitude: -16.8 });
    expect(onPressDots).toHaveBeenLastCalledWith([]);
  });

  it("cannot be tapped when nothing happens on a tap", async () => {
    await render(<IcelandMap label="Map" dots={[bsi]} />);
    expect(screen.queryByTestId("map-touch")).toBeNull();
  });
});

describe("A trip's route on the map", () => {
  const drawn = (testID: string) =>
    screen.queryAllByTestId(testID, { includeHiddenElements: true });
  const stops = [kef, bsi, fitjar, hof].map((stop) => stop.position);

  it("mutes the trip outside the passenger's part and marks the part's ends", async () => {
    await render(<RouteMap label="Route" stops={stops} part={{ board: 1, alight: 3 }} />);
    expect(screen.getByRole("image", { name: "Route" })).toBeVisible();
    expect(drawn("map-line-route")).toHaveLength(1);
    expect(drawn("map-line-part")).toHaveLength(1);
    expect(drawn("map-dot-chosen")).toHaveLength(2);
    expect(drawn("map-dot")).toHaveLength(1);
    expect(drawn("map-dot-muted")).toHaveLength(1);
  });

  it("draws a driver's whole route as the part", async () => {
    await render(<RouteMap label="Route" stops={stops} />);
    expect(drawn("map-line-route")).toHaveLength(0);
    expect(drawn("map-line-part")).toHaveLength(1);
    expect(drawn("map-dot-chosen")).toHaveLength(2);
    expect(drawn("map-dot")).toHaveLength(2);
  });
});
