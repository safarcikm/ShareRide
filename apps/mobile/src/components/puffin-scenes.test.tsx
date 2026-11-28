import { render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { bannerDays } from "@shareride/domain";
import { onWebsite } from "@/lib/on-website";
import { drawn, fillsIn, valuesIn } from "@/testing/drawing";
import { bannerDrawing, icelandSeasons, people, puffin, puffinCar } from "@/theme/tokens";
import { carHeight, IcelandScene, PuffinByPin, PuffinsInCar } from "./puffin-scenes";

// Spec 15, section 5.3, "Puffin scenes": drawings around the screens, hidden
// from screen readers, so these tests look at what they draw.

jest.mock("@/lib/on-website", () => ({ onWebsite: jest.fn(() => false) }));

/** The colour scheme the drawings see; light unless a test says otherwise. */
let mockScheme: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockScheme,
}));

/** A colour in a gradient as react-native-svg hands it over: a signed 0xAARRGGBB. */
const gradientColour = (hex: string) => (0xff000000 + Number.parseInt(hex.slice(1), 16)) | 0;

const part = (testID: string) => screen.getByTestId(testID, { includeHiddenElements: true });
const parts = (testID: string) => screen.queryAllByTestId(testID, { includeHiddenElements: true });

afterEach(() => {
  mockScheme = "light";
});

describe("two puffins in a round little car", () => {
  it("carries the driver in a crowberry hat in front and you in a moss scarf", async () => {
    await render(<PuffinsInCar width={170} />);
    expect(fillsIn(part("puffin-driver"))).toContainEqual(drawn(people.crowberry));
    expect(fillsIn(part("puffin-you"))).toContainEqual(drawn(people.mossLight));
    expect(parts("moving-lines")).toHaveLength(0);
  });

  it("is the sun's yellow, with darker wings over its wheels and glass for the puffins", async () => {
    await render(<PuffinsInCar width={170} />);
    const fills = fillsIn(part("puffins-in-car"));
    expect(fills).toContainEqual(drawn(puffinCar.body));
    expect(fills).toContainEqual(drawn(puffinCar.wing));
    expect(fills).toContainEqual(drawn(puffinCar.glass));
  });

  it("keeps the puffins inside its windows, each car by its own outline", async () => {
    await render(
      <>
        <PuffinsInCar width={170} />
        <PuffinsInCar width={200} moving />
      </>,
    );
    const names = parts("puffins-in-car").map((car) => {
      const [name] = valuesIn(car, "name");
      // The puffins' group is cut by the car's own windows.
      expect(valuesIn(car, "clipPath")).toContainEqual(name);
      return name;
    });
    expect(new Set(names).size).toBe(2);
  });

  it("drives off with lines behind it when moving", async () => {
    await render(<PuffinsInCar width={200} moving />);
    expect(parts("moving-lines")).toHaveLength(1);
  });

  it("on the website, arrives from as far left as it is told (spec 33, 3.2)", async () => {
    (onWebsite as jest.Mock).mockReturnValueOnce(true);
    await render(<PuffinsInCar width={170} arriveFrom={-300} />);
    expect(part("puffins-in-car")).toHaveProp("dataSet", { motion: "arrive" });
    expect(StyleSheet.flatten(part("puffins-in-car").props.style as object)).toMatchObject({
      "--from": "-300px",
    });
  });

  it("stands still when not told to arrive, and in the phone apps", async () => {
    await render(
      <>
        <PuffinsInCar width={170} />
        <PuffinsInCar width={170} arriveFrom={-300} />
      </>,
    );
    for (const car of parts("puffins-in-car")) {
      expect(car.props.dataSet).toBeUndefined();
    }
  });

  it("is only a picture: hidden from screen readers", async () => {
    await render(<PuffinsInCar width={170} />);
    expect(screen.queryByTestId("puffins-in-car")).toBeNull();
    expect(part("puffins-in-car")).toBeTruthy();
  });
});

describe("a puffin by a map pin", () => {
  it("stands in a crowberry scarf beside a pin", async () => {
    await render(<PuffinByPin height={120} />);
    const fills = fillsIn(part("puffin-by-pin"));
    expect(fills).toContainEqual(drawn(people.crowberry));
    expect(fills).toContainEqual(drawn(puffin.beak));
    expect(screen.queryByTestId("puffin-by-pin")).toBeNull();
  });
});

describe("in dark mode", () => {
  beforeEach(() => {
    mockScheme = "dark";
  });

  it("lifts the black of what stands on the night screen: the car's tyres, the puffin by a pin", async () => {
    await render(
      <>
        <PuffinsInCar width={170} />
        <PuffinByPin height={120} />
      </>,
    );
    for (const id of ["puffins-in-car", "puffin-by-pin"]) {
      const fills = fillsIn(part(id));
      expect(fills).toContainEqual(drawn(puffin.nightBlack));
    }
  });

  it("keeps basalt for the puffins in the car, as they sit behind its light glass", async () => {
    await render(<PuffinsInCar width={170} />);
    expect(fillsIn(part("puffin-driver"))).toContainEqual(drawn(people.face));
    expect(fillsIn(part("puffin-driver"))).not.toContainEqual(drawn(puffin.nightBlack));
  });

  it("keeps basalt in light mode", async () => {
    mockScheme = "light";
    await render(<PuffinByPin height={120} />);
    const fills = fillsIn(part("puffin-by-pin"));
    expect(fills).toContainEqual(drawn(people.face));
    expect(fills).not.toContainEqual(drawn(puffin.nightBlack));
  });
});

describe("IcelandScene in its season (spec 15, 5.3; spec 36, 3.1 and 3.3)", () => {
  const summer = icelandSeasons.summer.light;

  it("draws a sky that pales towards the land, mountains, hills and a road with its line", async () => {
    await render(<IcelandScene season="summer" width={390} height={200} />);
    // A picture: screen readers skip it.
    expect(screen.queryByTestId("iceland-scene")).toBeNull();
    const scene = part("iceland-scene");
    // The sky's gradient: its top, then its colour where it meets the land.
    expect(valuesIn(scene, "gradient")).toContainEqual([
      0,
      gradientColour(summer.skyTop),
      1,
      gradientColour(summer.sky),
    ]);
    const fills = fillsIn(scene);
    for (const colour of [summer.far, summer.mountain, summer.hillBack, summer.hill, summer.road]) {
      expect(fills).toContainEqual(drawn(colour));
    }
    expect(valuesIn(scene, "stroke")).toContainEqual(drawn(summer.roadLine));
    expect(valuesIn(scene, "strokeDasharray")).toHaveLength(1);
    expect(valuesIn(scene, "width")).toContain(390);
  });

  it("puts the road along the bottom, where the car drives", async () => {
    await render(<IcelandScene season="summer" width={390} height={200} />);
    expect(part("scene-road").props).toMatchObject({
      y: 200 - 22,
      height: 22,
      fill: drawn(summer.road),
    });
  });

  it("draws the land down to the bottom without a road, and no snow on its edge", async () => {
    await render(
      <IcelandScene season="winter" width={1144} height={170} ground={108} road={false} />,
    );
    expect(valuesIn(part("iceland-scene"), "strokeDasharray")).toEqual([]);
    expect(parts("snow-banks")).toHaveLength(0);
    expect(part("scene-ground").props).toMatchObject({
      y: 108,
      height: 170 - 108,
      fill: drawn(icelandSeasons.winter.light.hill),
    });
  });

  it("has a farmhouse with a red roof in every season", async () => {
    for (const season of ["winter", "spring", "summer", "autumn"] as const) {
      await render(<IcelandScene season={season} width={390} height={200} />);
      expect(fillsIn(part("farmhouse"))).toContainEqual(drawn(icelandSeasons[season].light.roof));
    }
  });

  it("covers winter in snow: white land, a glacier on every peak, snow on the road's edge and the roof", async () => {
    await render(<IcelandScene season="winter" width={390} height={200} />);
    const winter = icelandSeasons.winter.light;
    expect(fillsIn(part("iceland-scene"))).toContainEqual(drawn(winter.hill));
    expect(parts("glacier")).toHaveLength(7);
    expect(fillsIn(part("snow-banks"))).toContainEqual(drawn(winter.snow));
    expect(fillsIn(part("farmhouse"))).toContainEqual(drawn(winter.snow));
    expect(parts("aurora")).toHaveLength(0);
  });

  it("brings the northern lights and stars to winter and autumn nights", async () => {
    mockScheme = "dark";
    for (const season of ["winter", "autumn"] as const) {
      await render(<IcelandScene season={season} width={390} height={200} />);
      expect(parts("aurora")).toHaveLength(1);
      expect(parts("stars")).toHaveLength(1);
    }
  });

  it("has stars only at night", async () => {
    await render(<IcelandScene season="spring" width={390} height={200} />);
    expect(parts("stars")).toHaveLength(0);
    mockScheme = "dark";
    await render(<IcelandScene season="spring" width={390} height={200} />);
    expect(parts("stars")).toHaveLength(1);
  });

  it("puts flowers in spring's grass", async () => {
    await render(<IcelandScene season="spring" width={390} height={200} />);
    expect(parts("flower").length).toBeGreaterThan(0);
    expect(parts("lupine")).toHaveLength(0);
  });

  it("gives summer lupines and the sun high, and the midnight sun at night", async () => {
    await render(<IcelandScene season="summer" width={390} height={200} />);
    expect(parts("lupine").length).toBeGreaterThan(0);
    expect(fillsIn(part("sun"))).toContainEqual(drawn(people.sun));
    expect(parts("midnight-sun")).toHaveLength(0);
    mockScheme = "dark";
    await render(<IcelandScene season="summer" width={390} height={200} />);
    expect(fillsIn(part("midnight-sun"))).toContainEqual(drawn(bannerDrawing.sunLow));
    expect(parts("sun")).toHaveLength(0);
  });

  it("puts heather and birch on autumn's hills", async () => {
    await render(<IcelandScene season="autumn" width={390} height={200} />);
    const heather = fillsIn(part("heather"));
    expect(heather).toContainEqual(drawn(bannerDrawing.heather));
    expect(heather).toContainEqual(drawn(bannerDrawing.birch));
  });

  it("keeps the small things in the room it is given, as a laptop's car room", async () => {
    await render(
      <IcelandScene
        season="summer"
        width={900}
        height={170}
        ground={108}
        road={false}
        room={[600, 900]}
        layout="panel"
      />,
    );
    const xs = parts("lupine").flatMap((lupine) => valuesIn(lupine, "cx")) as number[];
    expect(xs.length).toBeGreaterThan(0);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(600 - 8);
      expect(x).toBeLessThanOrEqual(900 + 8);
    }
    const [house] = valuesIn(part("farmhouse"), "x") as number[];
    expect(house).toBeGreaterThanOrEqual(600);
  });

  it("keeps a laptop's placement in a panel taller than usual, as with larger text", async () => {
    await render(
      <IcelandScene
        season="summer"
        width={900}
        height={320}
        ground={300}
        road={false}
        room={[600, 900]}
        layout="panel"
      />,
    );
    const xs = parts("lupine").flatMap((lupine) => valuesIn(lupine, "cx")) as number[];
    expect(xs.length).toBeGreaterThan(0);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(600 - 8);
  });

  it("keeps a phone's placement on a website window as wide as a tablet: the northern lights and stars under the name's row", async () => {
    mockScheme = "dark";
    /** The lowest y the northern lights reach up to. */
    const auroraTop = () =>
      Math.min(
        ...[...String(valuesIn(part("aurora"), "d")).matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(
          (pair) => Number(pair[2]),
        ),
      );
    await render(<IcelandScene season="winter" width={390} height={189} />);
    const onPhone = auroraTop();
    await render(<IcelandScene season="winter" width={768} height={189} />);
    expect(auroraTop()).toBeGreaterThanOrEqual(onPhone - 2);
    const stars = valuesIn(part("stars"), "cy") as number[];
    expect(Math.min(...stars)).toBeGreaterThanOrEqual(52);
  });

  it("draws the same every time", async () => {
    await render(<IcelandScene season="autumn" width={390} height={200} />);
    const first = JSON.stringify(valuesIn(part("heather"), "cx"));
    await render(<IcelandScene season="autumn" width={390} height={200} />);
    expect(JSON.stringify(valuesIn(part("heather"), "cx"))).toBe(first);
  });
});

describe("the car and the scene on a day (spec 36, 3.4 and 3.5)", () => {
  /** What one of the puffins in the car wears: the test IDs drawn on it. */
  const on = (who: "you" | "driver", testID: string) =>
    within(part(`puffin-${who}`)).queryAllByTestId(testID, { includeHiddenElements: true });

  it("carries a little tree at Christmas, both puffins in Yule hats", async () => {
    await render(<PuffinsInCar width={170} day="christmas" season="winter" />);
    expect(parts("tree")).toHaveLength(1);
    expect(parts("roof-case")).toHaveLength(0);
    expect(on("you", "hat-yule")).toHaveLength(1);
    expect(on("driver", "hat-yule")).toHaveLength(1);
  });

  it("wears party hats at New Year, under three fireworks", async () => {
    await render(<PuffinsInCar width={170} day="newyear" season="winter" />);
    expect(on("you", "hat-party")).toHaveLength(1);
    expect(on("driver", "hat-party")).toHaveLength(1);
    expect(parts("roof-snow")).toHaveLength(1);
    await render(<IcelandScene season="winter" day="newyear" width={390} height={200} />);
    expect(parts("firework")).toHaveLength(3);
  });

  it("carries an Easter egg with its chick", async () => {
    await render(<PuffinsInCar width={170} day="easter" season="spring" />);
    expect(parts("egg")).toHaveLength(1);
    expect(parts("chick")).toHaveLength(1);
  });

  it("has the sun rise on the first day of summer, the driver in sunglasses and the woolly hat", async () => {
    await render(<PuffinsInCar width={170} day="summerday" season="spring" />);
    expect(on("driver", "glasses")).toHaveLength(1);
    expect(on("driver", "hat-wool")).toHaveLength(1);
    await render(<IcelandScene season="spring" day="summerday" width={390} height={200} />);
    expect(parts("sunrise")).toHaveLength(1);
  });

  it("flies two flags on National Day, with balloons", async () => {
    await render(<PuffinsInCar width={170} day="june17" season="summer" />);
    expect(parts("flag")).toHaveLength(2);
    expect(fillsIn(part("balloons"))).toContainEqual(drawn(bannerDrawing.flagBlue));
  });

  it("carries a tent at the long weekend", async () => {
    await render(<PuffinsInCar width={170} day="longweekend" season="summer" />);
    expect(parts("tent")).toHaveLength(1);
  });

  it("turns the autumn white on the first day of winter, the passenger in a woolly hat too", async () => {
    await render(<PuffinsInCar width={170} day="winterday" season="autumn" />);
    expect(on("you", "hat-wool")).toHaveLength(1);
    await render(<IcelandScene season="autumn" day="winterday" width={390} height={200} />);
    expect(fillsIn(part("cover"))).toContainEqual(drawn(icelandSeasons.winter.light.hill));
    // The whole scene on a phone: nothing keeps any of it out.
    expect(part("cover").props.mask).toBeUndefined();
  });

  it("keeps the farmhouse on the first day of winter, snow on its roof", async () => {
    const winter = icelandSeasons.winter.light;
    for (const layout of ["phone", "panel"] as const) {
      await render(
        <IcelandScene
          season="autumn"
          day="winterday"
          width={900}
          height={180}
          road={layout === "phone"}
          room={[600, 900]}
          layout={layout}
        />,
      );
      // Drawn over the white hills, so the snow does not bury it.
      const house = within(part("cover")).getByTestId("farmhouse", { includeHiddenElements: true });
      expect(fillsIn(house)).toContainEqual(drawn(winter.roof));
      expect(fillsIn(house)).toContainEqual(drawn(winter.snow));
    }
  });

  it("keeps the first snow in the car's room on a laptop, fading in at its edge (R36.5)", async () => {
    await render(
      <IcelandScene
        season="autumn"
        day="winterday"
        width={900}
        height={180}
        ground={110}
        road={false}
        room={[600, 900]}
        layout="panel"
      />,
    );
    // The white shows only through the room's mask: none of it under the
    // words, which stand at the left of the room.
    const edge = part("cover-edge");
    expect(part("cover").props.mask).toBe(edge.props.name);
    expect(part("cover-ground").props.mask).toBe(edge.props.name);
    // Its gradient: nothing at the room's left edge, all of it a little in.
    const scene = part("iceland-scene");
    expect(valuesIn(scene, "x1")).toContain(600);
    expect(valuesIn(scene, "x2")).toContain(600 + 48);
    // The land outside the room keeps autumn's colours.
    expect(fillsIn(part("scene-ground"))).toContainEqual(drawn(icelandSeasons.autumn.light.hill));
  });

  it("flies one flag on the roof on Sovereignty Day", async () => {
    await render(<PuffinsInCar width={170} day="dec1" season="winter" />);
    expect(parts("flag")).toHaveLength(1);
  });

  it("brings flowers and a heart over the driver on Bóndadagur, over the passenger on Konudagur", async () => {
    await render(<PuffinsInCar width={170} day="bondadagur" season="winter" />);
    expect(parts("bouquet")).toHaveLength(1);
    expect(parts("heart-driver")).toHaveLength(1);
    expect(parts("heart-you")).toHaveLength(0);
    await render(<PuffinsInCar width={170} day="konudagur" season="winter" />);
    expect(parts("heart-you")).toHaveLength(1);
    expect(parts("heart-driver")).toHaveLength(0);
  });

  it("carries a cream bun on Bun Day", async () => {
    await render(<PuffinsInCar width={170} day="bolludagur" season="winter" />);
    expect(parts("bun")).toHaveLength(1);
  });

  it("dresses up on Ash Wednesday: a mask and a crown", async () => {
    await render(<PuffinsInCar width={170} day="oskudagur" season="winter" />);
    expect(on("you", "mask")).toHaveLength(1);
    expect(on("driver", "hat-crown")).toHaveLength(1);
  });

  it("wears sailor caps on Seafarers' Day", async () => {
    await render(<PuffinsInCar width={170} day="seafarers" season="summer" />);
    expect(on("you", "hat-sailor")).toHaveLength(1);
    expect(on("driver", "hat-sailor")).toHaveLength(1);
  });

  it("carries the case in a season, with snow on it in winter only", async () => {
    await render(<PuffinsInCar width={170} season="winter" />);
    expect(parts("roof-case")).toHaveLength(1);
    expect(parts("roof-snow")).toHaveLength(1);
    await render(<PuffinsInCar width={170} season="summer" />);
    expect(parts("roof-snow")).toHaveLength(0);
    expect(on("driver", "hat-wool")).toHaveLength(1);
    expect(on("you", "hat-wool")).toHaveLength(0);
  });

  it("draws no day's things in the scene on a plain day", async () => {
    await render(<IcelandScene season="winter" width={390} height={200} />);
    expect(parts("firework")).toHaveLength(0);
    expect(parts("sunrise")).toHaveLength(0);
    expect(parts("cover")).toHaveLength(0);
  });

  it("keeps the fireworks and the sunrise in the car's room on a laptop", async () => {
    await render(
      <IcelandScene
        season="winter"
        day="newyear"
        width={900}
        height={180}
        road={false}
        room={[600, 900]}
        layout="panel"
      />,
    );
    expect(parts("firework")).toHaveLength(3);
    for (const x of valuesIn(parts("firework"), "cx")) {
      expect(x).toBeGreaterThanOrEqual(600);
      expect(x).toBeLessThanOrEqual(900);
    }
    await render(
      <IcelandScene
        season="spring"
        day="summerday"
        width={900}
        height={180}
        road={false}
        room={[600, 900]}
        layout="panel"
      />,
    );
    for (const x of valuesIn(part("sunrise"), "cx")) {
      expect(x).toBeGreaterThanOrEqual(600);
      expect(x).toBeLessThanOrEqual(900);
    }
  });

  it.each(bannerDays)(
    "keeps the car where it stands on a plain day, its size and place, on %s",
    async (day) => {
      await render(<PuffinsInCar width={170} day={day} season="winter" />);
      // What a day adds draws past the car's own area: the drawing grows
      // up and to the left by as much as its margins take back.
      const svg = part("car-drawing");
      const { width, height } = svg.props as { width: number; height: number };
      const { marginTop = 0, marginLeft = 0 } = StyleSheet.flatten(svg.props.style) as {
        marginTop?: number;
        marginLeft?: number;
      };
      expect(height + marginTop).toBeCloseTo(carHeight(170), 5);
      expect(width + marginLeft).toBeCloseTo(170, 5);
    },
  );
});

describe("the moment of the day or season, on the website (spec 36, 3.6)", () => {
  beforeEach(() => {
    (onWebsite as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    (onWebsite as jest.Mock).mockReturnValue(false);
  });

  it("marks the scene while its moment plays, and lets a little snow fall in winter", async () => {
    await render(<IcelandScene season="winter" width={390} height={200} playing />);
    expect(part("iceland-scene")).toHaveProp("dataSet", { motion: "moment" });
    expect(parts("flake").length).toBeGreaterThan(10);
  });

  it("brings the day's moment in place of its season's: none at Easter, more snow on the first day of winter", async () => {
    await render(<IcelandScene season="spring" day="easter" width={390} height={200} playing />);
    expect(parts("flyer")).toHaveLength(0);
    await render(<IcelandScene season="autumn" day="winterday" width={390} height={200} playing />);
    expect(parts("leaf")).toHaveLength(0);
    expect(parts("flake").length).toBeGreaterThan(30);
  });

  it("flies two puffins past in spring, and blows leaves along in autumn", async () => {
    await render(<IcelandScene season="spring" width={390} height={200} playing />);
    expect(parts("flyer")).toHaveLength(2);
    await render(<IcelandScene season="autumn" width={390} height={200} playing />);
    expect(parts("leaf")).toHaveLength(8);
  });

  it("sends up a trail before each of New Year's bursts", async () => {
    await render(<IcelandScene season="winter" day="newyear" width={390} height={200} playing />);
    expect(parts("trail")).toHaveLength(3);
    expect(parts("firework")).toHaveLength(3);
  });

  it("keeps a laptop's moment in the car's room", async () => {
    await render(
      <IcelandScene
        season="winter"
        width={900}
        height={180}
        road={false}
        room={[600, 900]}
        layout="panel"
        playing
      />,
    );
    const xs = valuesIn(parts("flake"), "cx") as number[];
    expect(xs.length).toBeGreaterThan(0);
    for (const x of xs) expect(x).toBeGreaterThanOrEqual(600);
  });

  it("draws none of it once the moment has played, and leaves the bursts standing", async () => {
    await render(<IcelandScene season="winter" day="newyear" width={390} height={200} />);
    expect(part("iceland-scene").props.dataSet).toBeUndefined();
    expect(parts("trail")).toHaveLength(0);
    expect(parts("flake")).toHaveLength(0);
    expect(parts("firework")).toHaveLength(3);
  });

  it("draws none of it in the phone apps, whose motion comes later (spec 33, 3.11)", async () => {
    (onWebsite as jest.Mock).mockReturnValue(false);
    await render(<IcelandScene season="winter" width={390} height={200} playing />);
    expect(part("iceland-scene").props.dataSet).toBeUndefined();
    expect(parts("flake")).toHaveLength(0);
  });
});
