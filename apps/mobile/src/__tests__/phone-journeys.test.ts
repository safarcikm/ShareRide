// The phone journeys (apps/mobile/maestro, spec 32, 3.7) on a CI emulator.
// On a busy runner one of the phone's own apps can stall while the emulator
// starts, and its "isn't responding" box covers the whole app, so Maestro
// sees only the box (2026-11-28, Pixel Launcher). Each journey closes such a
// box first, and never one about PuffinRide: a stall of ours must still fail.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const maestro = join(__dirname, "..", "..", "maestro");
const helper = "../helpers/close-stuck-box.yaml";

/** A flow's settings: the part above its `---`. */
const headerOf = (file: string): string =>
  readFileSync(join(maestro, "flows", file), "utf8").split("\n---\n")[0] ?? "";

const flows = readdirSync(join(maestro, "flows")).filter((file) => file.endsWith(".yaml"));

/** The box's title the helper looks for, as Maestro matches it: the whole text. */
const boxTitle = (): RegExp => {
  const text = readFileSync(join(maestro, "helpers", "close-stuck-box.yaml"), "utf8");
  const visible = /^\s*visible: "(.*)"$/m.exec(text)?.[1];
  if (visible === undefined) throw new Error("The helper names no box");
  return new RegExp(`^(?:${visible})$`);
};

describe("A stalled phone app's box on the emulator", () => {
  it.each(flows)("%s closes it before its first step", (file) => {
    expect(headerOf(file)).toMatch(new RegExp(`\\nonFlowStart:\\n  - runFlow: ${helper}\\n?$`));
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

// A busy iPhone simulator dropped one digit of an emailed code (2026-11-28:
// five of six in the field), so the next step never came. Each code is
// typed into an emptied field again until the next step shows.
describe("A code typed in the Sign up journey", () => {
  const lines = readFileSync(join(maestro, "flows", "sign-up.yaml"), "utf8").split("\n");
  const indentOf = (line: string): number => line.length - line.trimStart().length;
  const typings = lines.flatMap((line, index) =>
    line.includes("inputText: ${output.code.charAt(output.digit)}") ? [index] : [],
  );

  it("is typed twice, once for each code", () => {
    expect(typings).toHaveLength(2);
  });

  it.each(typings.map((index, order) => [order + 1, index] as const))(
    "code %i is typed again, into an emptied field, when the next step does not show",
    (_order, index) => {
      const typed = lines[index] ?? "";
      const retry = lines.findLastIndex(
        (line, at) => at < index && line.trim() === "- retry:" && indentOf(line) < indentOf(typed),
      );
      expect(retry).toBeGreaterThanOrEqual(0);
      const block = lines.slice(retry, index + 1);
      const after = lines.slice(index + 1);
      const end = after.findIndex(
        (line) => line.trim() !== "" && indentOf(line) <= indentOf(lines[retry] ?? ""),
      );
      const rest = end === -1 ? after : after.slice(0, end);
      expect(block.some((line) => /^\s*- eraseText/.test(line))).toBe(true);
      expect(rest.some((line) => /^\s*- extendedWaitUntil:/.test(line))).toBe(true);
    },
  );
});
