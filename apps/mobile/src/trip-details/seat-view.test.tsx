import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react-native";
import { LanguageProvider } from "@/i18n/language";
import { people, peopleColours, puffin } from "@/theme/tokens";
import { SeatView, YourSeat } from "./seat-view";

// Spec 15, section 5.3: puffins sit in the seat view, facing the way the car
// drives. The drawing is hidden from screen readers (its label says it in
// words), so these tests look at what it draws.

/** A colour as react-native-svg hands it to the native view: 0xAARRGGBB. */
const drawn = (hex: string) => ({
  type: 0,
  payload: 0xff000000 + Number.parseInt(hex.slice(1), 16),
});

const inEnglish = (ui: ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

const part = (testID: string) => screen.getAllByTestId(testID, { includeHiddenElements: true });

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

describe("the seat view's puffins", () => {
  it("puts the driver in front, a puffin in a knitted hat of the driver's colour", async () => {
    await inEnglish(<SeatView offered={3} free={2} yours={1} driverColour={1} />);
    const [driver] = part("puffin-driver");
    expect(fillsIn(driver)).toContainEqual(drawn(peopleColours[1]));
    expect(fillsIn(driver)).toContainEqual(drawn(puffin.beak));
  });

  it("puts you on your seat, a puffin in a moss scarf", async () => {
    await inEnglish(<SeatView offered={3} free={2} yours={2} driverColour={0} />);
    const yours = part("puffin-you");
    expect(yours).toHaveLength(2);
    for (const you of yours) expect(fillsIn(you)).toContainEqual(drawn(people.mossLight));
  });

  it("draws a seat someone else took as a grey puffin, with no colour", async () => {
    await inEnglish(<SeatView offered={3} free={1} yours={1} driverColour={2} />);
    const [taken] = part("puffin-taken");
    const fills = fillsIn(taken);
    expect(fills.length).toBeGreaterThan(0);
    for (const colour of [puffin.beak, puffin.white, people.crowberry, ...peopleColours]) {
      expect(fills).not.toContainEqual(drawn(colour));
    }
  });

  it("greets a booking just made with you in your seat", async () => {
    await inEnglish(<YourSeat />);
    const [you] = part("puffin-you");
    expect(fillsIn(you)).toContainEqual(drawn(people.mossLight));
  });
});
