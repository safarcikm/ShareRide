import type { MeetingPointSummary } from "@shareride/contracts";

type Position = MeetingPointSummary["position"];

/**
 * A link that opens a position in a maps app (spec 2, 3.2, "Open in maps"):
 * Apple Maps on iPhones, the person's own maps app on Android, and
 * OpenStreetMap on the web. Only the meeting point's public position leaves
 * the app.
 */
export function mapsUrl(position: Position, name: string, os: string): string {
  const { latitude, longitude } = position;
  const at = `${String(latitude)},${String(longitude)}`;
  switch (os) {
    case "ios":
      return `https://maps.apple.com/?ll=${at}&q=${encodeURIComponent(name)}`;
    case "android":
      // The name goes in brackets after the position, so it cannot hold any.
      return `geo:${at}?q=${at}(${encodeURIComponent(name.replace(/[()]/g, ""))})`;
    default:
      return (
        `https://www.openstreetmap.org/?mlat=${String(latitude)}&mlon=${String(longitude)}` +
        `#map=17/${String(latitude)}/${String(longitude)}`
      );
  }
}
