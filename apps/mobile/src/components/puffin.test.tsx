import { render, screen } from "@testing-library/react-native";
import Svg from "react-native-svg";
import { drawn, fillsIn } from "@/testing/drawing";
import { bannerDrawing, people, puffin } from "@/theme/tokens";
import { Puffin, type PuffinLook } from "./puffin";

// What the puffins wear on the front page's days (spec 36, 3.4 and 3.5).

const part = (testID: string) => screen.getByTestId(testID, { includeHiddenElements: true });
const parts = (testID: string) => screen.queryAllByTestId(testID, { includeHiddenElements: true });

async function drawPuffin(look: PuffinLook) {
  await render(
    <Svg width={60} height={60} viewBox="-24 -28 66 56">
      <Puffin x={0} y={0} size={1} look={look} testID="puffin" />
    </Svg>,
  );
}

describe("a puffin dressed up for a day", () => {
  it.each([
    ["wool", { kind: "wool", colour: people.sun }],
    ["yule", { kind: "yule" }],
    ["party", { kind: "party", colour: bannerDrawing.flagBlue }],
    ["crown", { kind: "crown" }],
    ["sailor", { kind: "sailor" }],
  ] as const)("wears a %s hat", async (kind, headwear) => {
    await drawPuffin({ kind: "colour", headwear });
    expect(parts(`hat-${kind}`)).toHaveLength(1);
    expect(parts("glasses")).toHaveLength(0);
    expect(parts("mask")).toHaveLength(0);
  });

  it("wears the Christmas hat in red with a white brim and bobble", async () => {
    await drawPuffin({ kind: "colour", headwear: { kind: "yule" } });
    const fills = fillsIn(part("hat-yule"));
    expect(fills).toContainEqual(drawn(bannerDrawing.red));
    expect(fills).toContainEqual(drawn(puffin.white));
  });

  it("wears a party hat in the colour it is given, a sailor's cap in navy and white", async () => {
    await drawPuffin({
      kind: "colour",
      headwear: { kind: "party", colour: bannerDrawing.flagRed },
    });
    expect(fillsIn(part("hat-party"))).toContainEqual(drawn(bannerDrawing.flagRed));
    await drawPuffin({ kind: "colour", headwear: { kind: "sailor" } });
    expect(fillsIn(part("hat-sailor"))).toContainEqual(drawn(bannerDrawing.navy));
  });

  it("wears glasses and a mask", async () => {
    await drawPuffin({ kind: "colour", glasses: true, mask: true });
    expect(parts("glasses")).toHaveLength(1);
    expect(fillsIn(part("mask"))).toContainEqual(drawn(bannerDrawing.sky));
  });

  it("still wears the knitted hat in the colour of `hat`, as every other screen draws it", async () => {
    await drawPuffin({ kind: "colour", hat: "#F08C9C" });
    expect(fillsIn(part("hat-wool"))).toContainEqual(drawn("#F08C9C"));
  });

  it("wears what the day gives over `hat`", async () => {
    await drawPuffin({ kind: "colour", hat: people.crowberry, headwear: { kind: "crown" } });
    expect(parts("hat-crown")).toHaveLength(1);
    expect(parts("hat-wool")).toHaveLength(0);
  });
});
