// node export_map.ts [out.json]: the app's own map of Iceland (packages/ui/src/map,
// Natural Earth, public domain) and the meeting points from packages/db/src/places/*.csv, in map units.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const out = process.argv[2] ?? fileURLToPath(new URL("iceland-map.json", import.meta.url));
const map = await import(join(repo, "packages/ui/src/map/index.ts"));
const here = join(repo, "packages/db/src/places");
const points: { x: number; y: number; name: string }[] = [];
for (const file of ["settlement-meeting-points.csv", "sight-meeting-points.csv"]) {
  const [head, ...rows] = readFileSync(join(here, file), "utf8").trim().split("\n");
  const cols = head.split(",");
  for (const row of rows) {
    const cells = row.split(",");
    const lat = Number(cells[cols.indexOf("latitude")]);
    const lon = Number(cells[cols.indexOf("longitude")]);
    const p = map.project({ latitude: lat, longitude: lon });
    points.push({ x: p.x, y: p.y, name: cells[0] });
  }
}
writeFileSync(
  out,
  JSON.stringify({
    size: map.mapSize,
    land: map.land,
    glaciers: map.glaciers,
    roads: map.roads,
    points,
  }),
);
console.log(points.length, "points");
