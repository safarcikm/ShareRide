import { describe, expect, it } from "vitest";
import { positionFromEwkb } from "./columns.ts";

describe("positionFromEwkb", () => {
  it("reads a point with an SRID, as PostGIS returns a geography column", () => {
    // SELECT 'SRID=4326;POINT(-21.9365 64.1376)'::geography
    expect(positionFromEwkb("0101000020E610000039B4C876BEEF35C07FFB3A70CE085040")).toEqual({
      longitude: -21.9365,
      latitude: 64.1376,
    });
  });

  it("reads a point without an SRID, in either byte order", () => {
    expect(positionFromEwkb("0101000000000000000000F03F0000000000000040")).toEqual({
      longitude: 1,
      latitude: 2,
    });
    expect(positionFromEwkb("00000000013FF00000000000004000000000000000")).toEqual({
      longitude: 1,
      latitude: 2,
    });
  });

  it("refuses anything but a point", () => {
    expect(() => positionFromEwkb("010200000000000000")).toThrow("not a point");
  });
});
