import { render, screen } from "@testing-library/react-native";
import { yuleLads, type Yule } from "@shareride/domain";
import { IcelandScene } from "@/components/puffin-scenes";
import { drawn, fillsIn, valuesIn } from "@/testing/drawing";
import { bannerYule, sizes } from "@/theme/tokens";
import { backHillAt, frontHillAt, panelCarFromEdge } from "./scene-layers";
import { catHeight, catTop, catReach, yulePlaces } from "./yule";

// Spec 36, 3.11: a Yule Lad a night from 12 to 24 December, the ones who
// came before peeking over the back hill, and the giant Jólakötturinn over
// the farmhouse from Christmas Eve to 6 January.

let mockScheme: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockScheme,
}));

afterEach(() => {
  mockScheme = "light";
});

const part = (testID: string) => screen.getByTestId(testID, { includeHiddenElements: true });
const parts = (testID: string) => screen.queryAllByTestId(testID, { includeHiddenElements: true });

const lad = (n: number): Yule => ({ lad: yuleLads[n] ?? null, cat: n === 12 });
const catAlone: Yule = { lad: null, cat: true };

/** A phone's scene, `width` wide, as Find draws it. */
function phone(yule: Yule | null, width = 390) {
  const ground = 175;
  return { yule, width, ground, room: [0, width] as const, wide: false, house: width * 0.1 };
}

/** A laptop's panel, its car's room at the right, as wide as on a Lad's day. */
function laptop(yule: Yule | null) {
  const width = 900;
  const room = [900 - (panelCarFromEdge + sizes.sceneCarWide + 24 + 48), 900] as const;
  return { yule, width, ground: 140, room, wide: true, house: room[1] - 44 };
}

/** Where the car stands: in the middle of a phone, at the right of a laptop's room. */
const carOf = (at: ReturnType<typeof phone> | ReturnType<typeof laptop>) =>
  at.wide
    ? [at.room[1] - panelCarFromEdge - sizes.sceneCarWide, at.room[1] - panelCarFromEdge]
    : [(at.width - sizes.sceneCar) / 2, (at.width + sizes.sceneCar) / 2];

describe("where the Yule folk stand (spec 36, 3.11)", () => {
  it("puts nothing in the scene outside Christmas", () => {
    expect(yulePlaces(phone(null))).toEqual({ lad: null, heads: [], cat: null });
  });

  it("stands the Lad of the day on the front hill right of the car on a phone", () => {
    for (const width of [320, 390, 430]) {
      const at = phone(lad(7), width);
      const places = yulePlaces(at);
      expect(places.lad?.x).toBeCloseTo(width * 0.865, 5);
      expect(places.lad?.y).toBeCloseTo(frontHillAt(width * 0.865, width, at.ground) - 7, 5);
      // What he holds may reach 24 to his left: still clear of the car.
      expect((places.lad?.x ?? 0) - 24).toBeGreaterThan(carOf(at)[1] ?? 0);
    }
  });

  it("draws Stúfur, Stubby, smaller than the others", () => {
    expect(yulePlaces(phone(lad(2))).lad?.scale).toBeLessThan(1);
    expect(yulePlaces(phone(lad(3))).lad?.scale).toBe(1);
  });

  it.each(yuleLads.map((name, n) => [name, n] as const))(
    "on %s's night, peeks those who came before over the back hill, clear of the car, him and the farmhouse",
    (_, n) => {
      for (const at of [phone(lad(n), 320), phone(lad(n)), laptop(lad(n))]) {
        const places = yulePlaces(at);
        const [carFrom, carTo] = carOf(at) as [number, number];
        const ladX = places.lad?.x ?? 0;
        expect(places.heads.length).toBeLessThanOrEqual(n);
        places.heads.forEach(({ x, y }, index) => {
          expect(y).toBeCloseTo(backHillAt(x, at.width, at.ground, at.wide) + 0.6, 5);
          expect(x >= carFrom && x <= carTo).toBe(false);
          expect(x >= ladX - 22 && x <= ladX + 26).toBe(false);
          expect(x >= at.room[0] && x <= at.room[1]).toBe(true);
          if (places.cat === null) expect(Math.abs(x - at.house)).toBeGreaterThan(12);
          else {
            const [left, right] = catReach(places.cat);
            expect(x >= left && x <= right).toBe(false);
          }
          const next = places.heads[index + 1];
          if (next !== undefined) expect(next.x - x).toBeGreaterThanOrEqual(6);
        });
      }
    },
  );

  it("shows all who came before on a phone while they fit", () => {
    expect(yulePlaces(phone(lad(6))).heads).toHaveLength(6);
  });

  it("stands the cat over the farmhouse, as tall as the room under the name's row allows", () => {
    for (const width of [320, 390, 430]) {
      const at = phone(catAlone, width);
      const cat = yulePlaces(at).cat;
      expect(cat?.x).toBe(at.house);
      expect(cat?.y).toBeCloseTo(backHillAt(at.house, width, at.ground, false) + 2, 5);
      const scale = cat?.scale ?? 0;
      expect((cat?.y ?? 0) - catHeight * scale).toBeGreaterThanOrEqual(catTop.phone - 0.01);
      // Far too big for the farm: several times the farmhouse's height.
      expect(catHeight * scale).toBeGreaterThan(13.4 * 3);
    }
  });

  it("keeps the cat and the Lad in the car's room on a laptop, never under the words (R36.5)", () => {
    const at = laptop(lad(12));
    const { lad: ladAt, cat } = yulePlaces(at);
    const [carFrom] = carOf(at) as [number, number];
    expect((ladAt?.x ?? 0) - 24).toBeGreaterThanOrEqual(at.room[0]);
    expect((ladAt?.x ?? 0) + 26).toBeLessThan(carFrom);
    if (cat === null) throw new Error("No cat on Christmas Eve");
    const [left, right] = catReach(cat);
    expect(left).toBeGreaterThan(carFrom + sizes.sceneCarWide - 8);
    // His tail clear of the panel's rounded edge.
    expect(right).toBeLessThanOrEqual(at.width - 4);
    expect(cat.y - catHeight * cat.scale).toBeGreaterThanOrEqual(catTop.panel - 0.01);
  });
});

describe("the Yule folk in the scene (spec 36, 3.11)", () => {
  it("draws the Lad of the day and the heads of those who came before", async () => {
    await render(
      <IcelandScene season="winter" day="christmas" yule={lad(7)} width={390} height={200} />,
    );
    expect(part("yule-lad")).toBeTruthy();
    expect(parts("lad-in-town")).toHaveLength(7);
    expect(parts("yule-cat")).toHaveLength(0);
  });

  it.each(yuleLads)("gives %s what he is after", async (name) => {
    await render(
      <IcelandScene
        season="winter"
        day="christmas"
        yule={{ lad: name, cat: false }}
        width={390}
        height={200}
      />,
    );
    expect(part(`lad-item-${name}`)).toBeTruthy();
  });

  it("gives Stekkjastaur a lamb and Kertasníkir a candle", async () => {
    await render(
      <IcelandScene season="winter" day="christmas" yule={lad(0)} width={390} height={200} />,
    );
    expect(fillsIn(part("lad-item-stekkjastaur"))).toContainEqual(drawn(bannerYule.lamb));
    await render(
      <IcelandScene season="winter" day="christmas" yule={lad(12)} width={390} height={200} />,
    );
    expect(fillsIn(part("lad-item-kertasnikir"))).toContainEqual(drawn(bannerYule.candle));
  });

  it("brings the cat on Christmas Eve, and leaves him alone after", async () => {
    await render(
      <IcelandScene season="winter" day="christmas" yule={lad(12)} width={390} height={200} />,
    );
    expect(parts("yule-cat")).toHaveLength(1);
    expect(parts("yule-lad")).toHaveLength(1);
    await render(
      <IcelandScene season="winter" day="christmas" yule={catAlone} width={390} height={200} />,
    );
    expect(parts("yule-cat")).toHaveLength(1);
    expect(parts("yule-lad")).toHaveLength(0);
    expect(parts("lad-in-town")).toHaveLength(0);
  });

  it("draws him black with yellow eyes, darker on a night screen", async () => {
    await render(
      <IcelandScene season="winter" day="christmas" yule={catAlone} width={390} height={200} />,
    );
    expect(fillsIn(part("yule-cat"))).toContainEqual(drawn(bannerYule.cat.light.fur));
    expect(fillsIn(part("cat-eyes"))).toContainEqual(drawn(bannerYule.eye));
    mockScheme = "dark";
    await render(
      <IcelandScene season="winter" day="christmas" yule={catAlone} width={390} height={200} />,
    );
    expect(fillsIn(part("yule-cat"))).toContainEqual(drawn(bannerYule.cat.dark.fur));
  });

  it("draws none of them without Yule folk", async () => {
    await render(<IcelandScene season="winter" day="christmas" width={390} height={200} />);
    expect(parts("yule-lad")).toHaveLength(0);
    expect(parts("lad-in-town")).toHaveLength(0);
    expect(parts("yule-cat")).toHaveLength(0);
  });

  it.each([
    ["a phone", { width: 390, height: 200 }, [0, 390], false],
    ["a laptop", { width: 900, height: 180, road: false, layout: "panel" }, [560, 900], true],
  ] as const)("bursts New Year's fireworks clear of the cat on %s", async (_, size, room, wide) => {
    await render(
      <IcelandScene season="winter" day="newyear" yule={catAlone} room={room} {...size} />,
    );
    const ground = size.height - sizes.sceneRoad;
    const house = wide ? room[1] - 44 : size.width * 0.1;
    const { cat } = yulePlaces({ yule: catAlone, width: size.width, ground, room, wide, house });
    if (cat === null) throw new Error("No cat on New Year's Eve");
    const [left, right] = catReach(cat);
    expect(parts("yule-cat")).toHaveLength(1);
    expect(parts("firework")).toHaveLength(3);
    for (const burst of parts("firework")) {
      const middle = (valuesIn(burst, "cx") as number[]).at(-1) ?? 0;
      expect(middle > right + 12 || middle < left - 12).toBe(true);
    }
  });
});
