import { render, screen } from "@testing-library/react-native";
import { icelandScene, people, puffin, puffinCar } from "@/theme/tokens";
import { IcelandScene, PuffinByPin, PuffinsInCar } from "./puffin-scenes";

// Spec 15, section 5.3, "Puffin scenes": drawings around the screens, hidden
// from screen readers, so these tests look at what they draw.

/** The colour scheme the drawings see; light unless a test says otherwise. */
let mockScheme: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockScheme,
}));

/** A colour as react-native-svg hands it to the native view: 0xAARRGGBB. */
const drawn = (hex: string) => ({
  type: 0,
  payload: 0xff000000 + Number.parseInt(hex.slice(1), 16),
});

const part = (testID: string) => screen.getByTestId(testID, { includeHiddenElements: true });
const parts = (testID: string) => screen.queryAllByTestId(testID, { includeHiddenElements: true });

/** Every value of a prop inside a drawn part, nested shapes included. */
function valuesIn(node: unknown, prop: string): unknown[] {
  if (Array.isArray(node)) return node.flatMap((child) => valuesIn(child, prop));
  if (typeof node !== "object" || node === null) return [];
  const own: unknown[] = [];
  if ("props" in node && typeof node.props === "object" && node.props !== null) {
    const value = (node.props as Record<string, unknown>)[prop];
    if (value !== undefined) own.push(value);
  }
  return "children" in node ? [...own, ...valuesIn(node.children, prop)] : own;
}

/** Every fill inside a drawn part, nested shapes included. */
const fillsIn = (node: unknown) => valuesIn(node, "fill");

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

describe("IcelandScene (spec 15, section 5.3, decision 15)", () => {
  const light = icelandScene.light;

  it("draws a sky, mountains with glaciers on the two highest, hills and a road with its line", async () => {
    await render(<IcelandScene width={390} height={200} />);
    // A picture: screen readers skip it.
    expect(screen.queryByTestId("iceland-scene")).toBeNull();
    const scene = part("iceland-scene");
    const fills = fillsIn(scene);
    for (const colour of [light.sky, light.mountain, light.hill, light.road]) {
      expect(fills).toContainEqual(drawn(colour));
    }
    expect(fills.filter((fill) => isEqual(fill, drawn(light.glacier)))).toHaveLength(2);
    expect(valuesIn(scene, "stroke")).toContainEqual(drawn(light.roadLine));
    expect(valuesIn(scene, "strokeDasharray")).toHaveLength(1);
    expect(valuesIn(scene, "width")).toContain(390);
    expect(valuesIn(scene, "height")).toContain(200);
  });

  it("puts the road along the bottom, where the car drives", async () => {
    await render(<IcelandScene width={390} height={200} />);
    const road = part("scene-road");
    expect(road.props).toMatchObject({ y: 200 - 22, height: 22, fill: drawn(light.road) });
  });

  it("draws hills down to the bottom without a road, from the ground asked for", async () => {
    await render(<IcelandScene width={1144} height={170} ground={108} road={false} />);
    const scene = part("iceland-scene");
    expect(fillsIn(scene)).not.toContainEqual(drawn(light.road));
    // No dashed line: the glaciers' white edge is the only white line.
    expect(valuesIn(scene, "strokeDasharray")).toEqual([]);
    expect(part("scene-ground").props).toMatchObject({
      y: 108,
      height: 170 - 108,
      fill: drawn(light.hill),
    });
  });

  it("draws Iceland at night in dark mode", async () => {
    mockScheme = "dark";
    await render(<IcelandScene width={390} height={200} />);
    const fills = fillsIn(part("iceland-scene"));
    expect(fills).toContainEqual(drawn(icelandScene.dark.sky));
    expect(fills).not.toContainEqual(drawn(light.sky));
  });
});

/** Whether two drawn colours are the same. */
function isEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
