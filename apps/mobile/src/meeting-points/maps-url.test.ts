import { mapsUrl } from "./maps-url";

const bsi = { latitude: 64.1376, longitude: -21.9365 };

describe("mapsUrl", () => {
  it("opens Apple Maps on iPhones, with the name", () => {
    expect(mapsUrl(bsi, "BSÍ bus terminal", "ios")).toBe(
      "https://maps.apple.com/?ll=64.1376,-21.9365&q=BS%C3%8D%20bus%20terminal",
    );
  });

  it("hands the position to the maps app on Android, without brackets in the name", () => {
    expect(mapsUrl(bsi, "Hof (Akureyri)", "android")).toBe(
      "geo:64.1376,-21.9365?q=64.1376,-21.9365(Hof%20Akureyri)",
    );
  });

  it("opens OpenStreetMap on the web", () => {
    expect(mapsUrl(bsi, "BSÍ bus terminal", "web")).toBe(
      "https://www.openstreetmap.org/?mlat=64.1376&mlon=-21.9365#map=17/64.1376/-21.9365",
    );
  });
});
