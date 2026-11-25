import { describe, expect, it } from "vitest";
import { rideOf, type RideSource } from "./link-preview.ts";
import { drawRide, layOutRide, pictureSize, rideSvg, textWidth } from "./ride-picture.ts";

const stop = (name: string, plannedAt = "2026-11-27T09:00:00.000Z") => ({
  meetingPoint: { name: { is: name, en: name } },
  plannedAt,
});

function ride(names: readonly string[], state: RideSource["part"]["state"] = "open") {
  const found = rideOf({
    id: "6f1c2f9e-3b1a-4c7d-9e2f-0a1b2c3d4e5f",
    stops: names.map((name) => stop(name)),
    part: { board: 0, alight: names.length - 1, state },
  });
  if (found === undefined) throw new Error("no ride");
  return found;
}

const short = ride(["Reykjavík – BSÍ", "Borgarnes – N1", "Blönduós – N1", "Akureyri – Hof"]);
const longest = ride([
  "Brautarholt á Skeiðum – stoppistöð Strætó",
  "Sólheimar í Grímsnesi – Verslunin Vala",
]);
const manyStops = ride([
  "Reykjavík – BSÍ",
  "Hveragerði – N1",
  "Selfoss – Olís",
  "Hella – N1",
  "Hvolsvöllur – N1",
  "Skógar – Skógafoss",
  "Vík – N1",
  "Kirkjubæjarklaustur – N1",
  "Höfn – N1",
]);

/** Room for words: the picture's width less a margin each side (spec 23, 3.10, item 2). */
const room = pictureSize.width - 2 * pictureSize.margin;

describe("a ride's picture (spec 23, 3.10)", () => {
  it("is a PNG of 1200 by 630", () => {
    const png = drawRide(short, "en");
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const header = Buffer.from(png.subarray(16, 24));
    expect([header.readUInt32BE(0), header.readUInt32BE(4)]).toEqual([1200, 630]);
  });

  it("puts a short route on one line, large", () => {
    const layout = layOutRide(short, "en");
    expect(layout.route.lines).toEqual([["Reykjavík – BSÍ", "Akureyri – Hof"]]);
    expect(layout.route.size).toBeGreaterThanOrEqual(64);
  });

  it("fits the longest names, breaking before the arrow", () => {
    const layout = layOutRide(longest, "is");
    expect(layout.route.lines).toEqual([
      ["Brautarholt á Skeiðum – stoppistöð Strætó"],
      ["", "Sólheimar í Grímsnesi – Verslunin Vala"],
    ]);
    for (const width of layout.route.widths) expect(width).toBeLessThanOrEqual(room);
  });

  it("names the stops that fit, then how many more", () => {
    const layout = layOutRide(manyStops, "en");
    expect(layout.stops).toMatch(/^Stops on the way: Hveragerði – N1, .* and \d more$/);
    expect(textWidth(layout.stops ?? "", "stops")).toBeLessThanOrEqual(room);
    expect(layOutRide(manyStops, "is").stops).toMatch(/ og \d til viðbótar$/);
  });

  it("leaves the stops out of a ride with none between", () => {
    const direct = ride(["Reykjavík – BSÍ", "Akureyri – Hof"]);
    expect(layOutRide(direct, "en").stops).toBeNull();
  });

  it("says when it leaves, the weekday first", () => {
    expect(layOutRide(short, "is").when).toBe("Föstudagur 27. nóvember kl. 09:00");
    expect(layOutRide(short, "en").when).toBe("Friday 27 November at 09:00");
  });

  it("shows the Free seats tag only while seats can be booked", () => {
    expect(rideSvg(short, "en")).toContain("Free seats");
    expect(rideSvg(ride(["A – 1", "B – 2"], "full"), "en")).not.toContain("Free seats");
  });

  it("writes names as text, never as markup", () => {
    const odd = ride(["Kaffi & <Co>", "Vík – N1"]);
    const svg = rideSvg(odd, "en");
    expect(svg).toContain("Kaffi &amp; &lt;Co&gt;");
    expect(svg).not.toContain("<Co>");
  });
});
