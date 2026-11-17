import { describe, expect, it } from "vitest";
import { icelandBounds, parseCoordinates } from "./coordinates.ts";

// BSÍ bus terminal in Reykjavík, written the ways the operator may paste it.
const bsi = { latitude: 64.137_133, longitude: -21.933_689 };

const found = (text: string) => {
  const result = parseCoordinates(text);
  if (!result.ok) throw new Error(`Not read: ${text} (${result.problem})`);
  return result.position;
};

describe("parseCoordinates (spec 2, 3.6; plan decision 3)", () => {
  it.each([
    "64.137133, -21.933689",
    "64.137133,-21.933689",
    "  64.137133   -21.933689 ",
    "64.137133; -21.933689",
    "64.137133 N, 21.933689 W",
    "64.137133°N 21.933689°W",
    "N 64.137133 W 21.933689",
  ])("reads decimal degrees: %s", (text) => {
    expect(found(text)).toEqual(bsi);
  });

  it.each([
    "64°08.228'N 21°56.021'W",
    "64° 8.228' N, 21° 56.021' W",
    "N 64° 08.228′ W 21° 56.021′",
    "64 08.228 N 21 56.021 W",
  ])("reads degrees and minutes: %s", (text) => {
    // A thousandth of a minute is about two metres.
    const position = found(text);
    expect(position.latitude).toBeCloseTo(bsi.latitude, 4);
    expect(position.longitude).toBeCloseTo(bsi.longitude, 4);
  });

  it.each([`64°08'13.7"N 21°56'01.3"W`, "64° 8′ 13.7″ N 21° 56′ 1.3″ W"])(
    "reads degrees, minutes and seconds, as Google Maps copies them: %s",
    (text) => {
      const position = found(text);
      expect(position.latitude).toBeCloseTo(bsi.latitude, 4);
      expect(position.longitude).toBeCloseTo(bsi.longitude, 4);
    },
  );

  it("reads the Icelandic letters for west and east, V and A", () => {
    const position = found(`64°08'13.7"N 21°56'01.3"V`);
    expect(position.longitude).toBeCloseTo(bsi.longitude, 4);
    expect(found("64.137133 N 21.933689 V")).toEqual(bsi);
    expect(parseCoordinates("64.137133 N 21.933689 A")).toEqual({
      ok: false,
      problem: "outside_iceland",
    });
  });

  it("reads the hemispheres in either order", () => {
    expect(found("21.933689 W, 64.137133 N")).toEqual(bsi);
  });

  it.each([
    [
      "Google Maps, a place: its pin, not the middle of the view",
      "https://www.google.com/maps/place/BS%C3%8D/@64.1371,-21.9400,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d64.137133!4d-21.933689!16s",
    ],
    ["Google Maps, the view", "https://www.google.com/maps/@64.137133,-21.933689,17z"],
    [
      "Google Maps, a search",
      "https://www.google.com/maps/search/?api=1&query=64.137133,-21.933689",
    ],
    ["Google Maps, an old link", "https://maps.google.com/?q=64.137133,-21.933689"],
    [
      "Apple Maps, a place",
      "https://maps.apple.com/place?coordinate=64.137133,-21.933689&name=BS%C3%8D",
    ],
    ["Apple Maps, a pin", "https://maps.apple.com/?ll=64.137133,-21.933689&q=Dropped%20Pin"],
    ["Apple Maps, coordinates searched", "https://maps.apple.com/?q=64.137133,-21.933689"],
    [
      "OpenStreetMap, a marker: the marker, not the view",
      "https://www.openstreetmap.org/?mlat=64.137133&mlon=-21.933689#map=15/64.1300/-21.9000",
    ],
    ["OpenStreetMap, the view", "https://www.openstreetmap.org/#map=18/64.137133/-21.933689"],
  ])("reads a link: %s", (_, link) => {
    expect(found(link)).toEqual(bsi);
  });

  it("keeps six decimals, about ten centimetres", () => {
    expect(found("64.13713349, -21.93368861")).toEqual(bsi);
  });

  it.each([
    "",
    "BSÍ",
    "64.137133",
    "64.137133, -21.933689, 12",
    "https://goo.gl/maps/abc123",
    "https://www.google.com/maps/place/BS%C3%8D",
    "64°61'N 21°56'W",
    "N 64.1 N 21.9",
  ])("says it cannot read %j", (text) => {
    expect(parseCoordinates(text)).toEqual({ ok: false, problem: "unreadable" });
  });

  it.each([
    ["east instead of west", "64.137133, 21.933689"],
    ["the numbers swapped", "-21.933689, 64.137133"],
    ["Faroe Islands", "62.0107, -6.7741"],
    ["Greenland", "64.1814, -51.6941"],
  ])("refuses a spot outside Iceland: %s", (_, text) => {
    expect(parseCoordinates(text)).toEqual({ ok: false, problem: "outside_iceland" });
  });

  it("takes Iceland's islands, Vestmannaeyjar to Grímsey", () => {
    expect(found("63.4427, -20.2734")).toEqual({ latitude: 63.4427, longitude: -20.2734 });
    expect(found("66.5446, -18.0170")).toEqual({ latitude: 66.5446, longitude: -18.017 });
    expect(icelandBounds.south).toBeLessThan(63.3);
    expect(icelandBounds.north).toBeGreaterThan(66.6);
  });
});
