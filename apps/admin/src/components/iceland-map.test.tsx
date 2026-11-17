import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IcelandMap } from "./iceland-map.tsx";

const reykjavik = { latitude: 64.1371, longitude: -21.9337 };
const akureyri = { latitude: 65.6835, longitude: -18.1105 };

describe("IcelandMap (ADR 0024)", () => {
  it("is one image for screen readers, with the land, glaciers and roads", () => {
    render(<IcelandMap label="Map of Iceland with 2 meeting points" dots={[]} />);
    const map = screen.getByRole("img", { name: "Map of Iceland with 2 meeting points" });
    expect(map.querySelectorAll("[data-part='land'] polygon").length).toBeGreaterThan(0);
    expect(map.querySelectorAll("[data-part='glaciers'] polygon").length).toBeGreaterThan(0);
    expect(map.querySelectorAll("[data-part='ring-road'] polyline").length).toBeGreaterThan(0);
  });

  it("draws a dot for each point, the chosen one apart", () => {
    render(
      <IcelandMap
        label="Map"
        dots={[
          { id: "a", position: reykjavik },
          { id: "b", position: akureyri, look: "chosen" },
        ]}
      />,
    );
    const map = screen.getByRole("img", { name: "Map" });
    expect(map.querySelectorAll("[data-dot='plain']")).toHaveLength(1);
    expect(map.querySelectorAll("[data-dot='chosen']")).toHaveLength(1);
  });

  it("shows the whole of Iceland, or with fit the part around its dots", () => {
    const { rerender } = render(
      <IcelandMap label="Map" dots={[{ id: "a", position: reykjavik }]} />,
    );
    const whole = screen.getByRole("img", { name: "Map" }).getAttribute("viewBox");
    rerender(<IcelandMap label="Map" dots={[{ id: "a", position: reykjavik }]} fit />);
    const fitted = screen.getByRole("img", { name: "Map" }).getAttribute("viewBox");
    expect(whole?.split(" ").slice(0, 2)).toEqual(["0", "0"]);
    expect(Number(fitted?.split(" ")[2])).toBeLessThan(Number(whole?.split(" ")[2]));
  });
});
