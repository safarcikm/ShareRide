import { fireEvent, render, screen } from "@testing-library/react-native";
import { glaciers, land, roads } from "./iceland-data";
import { IcelandMap, type MapDot } from "./iceland-map";
import { mapSize, project, type Position } from "./projection";

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
    await render(<IcelandMap label="Map" dots={[bsi, { ...hof, chosen: true }]} />);
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
  });

  it("shows the whole of Iceland, or the part around the points it fits", async () => {
    await render(<IcelandMap label="Map" dots={[bsi]} />);
    expect(screen.getByTestId("map-area")).toHaveStyle({
      aspectRatio: mapSize.width / mapSize.height,
    });
    await render(<IcelandMap label="Map" dots={[bsi]} fit={[bsi.position]} />);
    expect(screen.getByTestId("map-area")).toHaveStyle({ aspectRatio: 1.6 });
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
