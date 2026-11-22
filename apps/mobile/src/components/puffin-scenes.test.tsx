import { render, screen } from "@testing-library/react-native";
import { people, puffin } from "@/theme/tokens";
import { PuffinByPin, PuffinsInCar } from "./puffin-scenes";

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

/** Every fill inside a drawn part, nested shapes included. */
function fillsIn(node: unknown): unknown[] {
  if (Array.isArray(node)) return node.flatMap(fillsIn);
  if (typeof node !== "object" || node === null) return [];
  const own: unknown[] = [];
  if ("props" in node && typeof node.props === "object" && node.props !== null) {
    const { fill } = node.props as { fill?: unknown };
    if (fill !== undefined) own.push(fill);
  }
  return "children" in node ? [...own, ...fillsIn(node.children)] : own;
}

afterEach(() => {
  mockScheme = "light";
});

describe("two puffins in a little open car", () => {
  it("carries the driver in a crowberry hat in front and you in a moss scarf", async () => {
    await render(<PuffinsInCar width={170} />);
    expect(fillsIn(part("puffin-driver"))).toContainEqual(drawn(people.crowberry));
    expect(fillsIn(part("puffin-you"))).toContainEqual(drawn(people.mossLight));
    expect(parts("moving-lines")).toHaveLength(0);
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

  it("lifts the puffins' black so they stand off the night screen", async () => {
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

  it("keeps basalt in light mode", async () => {
    mockScheme = "light";
    await render(<PuffinByPin height={120} />);
    const fills = fillsIn(part("puffin-by-pin"));
    expect(fills).toContainEqual(drawn(people.face));
    expect(fills).not.toContainEqual(drawn(puffin.nightBlack));
  });
});
