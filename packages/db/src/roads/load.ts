// Loads our road file (ADR 0030), kept in the repository next to this file.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { readRoadFile, type RoadFile, type RoadGraph } from "@shareride/domain";

/** The road file of Iceland built by the "Road file" job (docs/engineering/road-file.md). */
export const icelandRoadFilePath = fileURLToPath(
  new URL("./iceland-roads.json.gz", import.meta.url),
);

export async function loadRoadGraph(path = icelandRoadFilePath): Promise<RoadGraph> {
  const file = JSON.parse(gunzipSync(await readFile(path)).toString("utf8")) as RoadFile;
  return readRoadFile(file);
}
