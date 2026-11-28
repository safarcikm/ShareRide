import { render, screen } from "@testing-library/react-native";
import { yuleLads, type Yule } from "@shareride/domain";
import { IcelandScene } from "@/components/puffin-scenes";
import { drawn, fillsIn } from "@/testing/drawing";
import { bannerYule, sizes } from "@/theme/tokens";
import { backHillAt, fireworkBursts, frontHillAt, panelCarFromEdge } from "./scene-layers";
import { catHeight, catReach, headWidth, yulePlaces } from "./yule";

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

/** Where the name's row over a phone's scene ends, the cat kept under it; a laptop's top. */
const phoneTop = 64;
const panelTop = 16;

/** A phone's scene, `width` wide, as Find draws it. */
function phone(yule: Yule | null, width = 390) {
  const ground = 175;
  return {
    yule,
    width,
    ground,
    room: [0, width] as const,
    wide: false,
    house: width * 0.1,
    top: phoneTop,
  };
}

/** A laptop's panel, its car's room at the right, as wide as on a Lad's day. */
function laptop(yule: Yule | null) {
  const width = 900;
  const room = [900 - (panelCarFromEdge + sizes.sceneCarWide + 24 + 48), 900] as const;
  return { yule, width, ground: 140, room, wide: true, house: room[1] - 44, top: panelTop };
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
        // A head is `headWidth` wide: all of it stays clear, not only its middle.
        const half = headWidth / 2;
        const clear = (x: number, [from, to]: readonly [number, number]) =>
          x + half < from || x - half > to;
        places.heads.forEach(({ x, y }, index) => {
          expect(y).toBeCloseTo(backHillAt(x, at.width, at.ground, at.wide) + 0.6, 5);
          expect(clear(x, [carFrom, carTo])).toBe(true);
          if (places.lad !== null) expect(clear(x, [ladX - 22, ladX + 26])).toBe(true);
          expect(x - half >= at.room[0] && x + half <= at.room[1]).toBe(true);
          if (places.cat === null) expect(clear(x, [at.house - 9, at.house + 9])).toBe(true);
          else expect(clear(x, catReach(places.cat))).toBe(true);
          // Never crowded: side by side, not one over the other.
          const next = places.heads[index + 1];
          if (next !== undefined) expect(next.x - x).toBeGreaterThanOrEqual(headWidth);
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
      expect((cat?.y ?? 0) - catHeight * scale).toBeGreaterThanOrEqual(phoneTop - 0.01);
      // Far too big for the farm: several times the farmhouse's height.
      expect(catHeight * scale).toBeGreaterThan(13.4 * 3);
      // All of him on the screen, on the narrowest phone too.
      if (cat === null) throw new Error("No cat");
      expect(catReach(cat)[0]).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps the cat under a name's row grown taller, as with large text", () => {
    // The scene grows with the row, its ground lower by as much.
    for (const [width, grown] of [
      [390, 20],
      [430, 46],
    ] as const) {
      const top = phoneTop + grown;
      const at = { ...phone(catAlone, width), ground: 175 + grown, top };
      const cat = yulePlaces(at).cat;
      if (cat === null) throw new Error("No cat");
      expect(cat.y - catHeight * cat.scale).toBeGreaterThanOrEqual(top - 0.01);
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
    expect(left).toBeGreaterThan(carFrom + sizes.sceneCarWide);
    // His tail clear of the panel's rounded edge.
    expect(right).toBeLessThanOrEqual(at.width - 4);
    expect(cat.y - catHeight * cat.scale).toBeGreaterThanOrEqual(panelTop - 0.01);
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

  it("bursts New Year's fireworks clear of the cat, every ray of them", () => {
    const room = panelCarFromEdge + sizes.sceneCarWide + 24;
    for (const at of [
      { ...phone(catAlone, 320), height: 197 },
      { ...phone(catAlone), height: 197 },
      { ...laptop(catAlone), room: [900 - room, 900] as const, height: 180 },
    ]) {
      const cat = yulePlaces(at).cat;
      if (cat === null) throw new Error("No cat on New Year's Eve");
      const [left, right] = catReach(cat);
      for (const [x, , r] of fireworkBursts(at.width, at.room, at.ground, at.wide, true)) {
        expect(x - r > right || x + r < left).toBe(true);
      }
    }
  });

  it("keeps the cat under the name's row the scene is given", async () => {
    await render(
      <IcelandScene
        season="winter"
        day="christmas"
        yule={catAlone}
        width={320}
        height={240}
        nameRowBottom={120}
      />,
    );
    const [scale = 0, , , , , y = 0] = part("yule-cat").props.matrix as number[];
    expect(y - catHeight * scale).toBeGreaterThanOrEqual(120);
  });
});
