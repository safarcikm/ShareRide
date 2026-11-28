// The phone journeys (apps/mobile/maestro, spec 32, 3.7) on a CI emulator.
// On a busy runner one of the phone's own apps can stall while the emulator
// starts, and its "isn't responding" box covers the whole app, so Maestro
// sees only the box (2026-11-28, Pixel Launcher). Each journey closes such a
// box first, and never one about PuffinRide: a stall of ours must still fail.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const maestro = join(__dirname, "..", "..", "maestro");

/** A flow's settings: the part above its `---`. */
const headerOf = (path: string): string => readFileSync(path, "utf8").split("\n---\n")[0] ?? "";

/** The checks' journeys, and the store's screenshots (maestro/store), each with the helper's path from it. */
const flows = [
  { folder: "flows", helper: "../helpers/close-stuck-box.yaml" },
  { folder: "store/flows", helper: "../../helpers/close-stuck-box.yaml" },
].flatMap(({ folder, helper }) =>
  readdirSync(join(maestro, folder))
    .filter((file) => file.endsWith(".yaml"))
    .map((file) => ({ name: `${folder}/${file}`, path: join(maestro, folder, file), helper })),
);

/** The box's title the helper looks for, as Maestro matches it: the whole text. */
const boxTitle = (): RegExp => {
  const text = readFileSync(join(maestro, "helpers", "close-stuck-box.yaml"), "utf8");
  const visible = /^\s*visible: "(.*)"$/m.exec(text)?.[1];
  if (visible === undefined) throw new Error("The helper names no box");
  return new RegExp(`^(?:${visible})$`);
};

describe("A stalled phone app's box on the emulator", () => {
  it.each(flows)("$name closes it before its first step", ({ path, helper }) => {
    const step = helper.replaceAll(".", "\\.");
    expect(headerOf(path)).toMatch(new RegExp(`\\nonFlowStart:\\n  - runFlow: ${step}\\n?$`));
  });

  it("closes the box of any app of the phone's own", () => {
    const title = boxTitle();
    expect(title.test("Pixel Launcher isn't responding")).toBe(true);
    expect(title.test("System UI isn’t responding")).toBe(true);
  });

  it("leaves a box about PuffinRide, so the journey fails", () => {
    expect(boxTitle().test("PuffinRide isn't responding")).toBe(false);
  });

  it("only on Android, by its Close app button", () => {
    const text = readFileSync(join(maestro, "helpers", "close-stuck-box.yaml"), "utf8");
    expect(text).toMatch(/^\s*platform: Android$/m);
    expect(text).toMatch(/^\s*- tapOn: "Close app"$/m);
  });
});
