// Builds our road file (ADR 0031) from the roads in an OPL file:
//   node packages/db/src/roads/build-cli.ts <roads.opl> <map date> <out.json.gz>
// The "Road file" GitHub Actions job runs it on the latest Iceland extract
// (.github/workflows/road-file.yml); see docs/engineering/road-file.md.
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { gzipSync } from "node:zlib";
import { createRoadFileBuilder } from "./build.ts";

const [input, mapDate, output] = process.argv.slice(2);
if (input === undefined || mapDate === undefined || output === undefined) {
  process.stderr.write("Usage: build-cli.ts <roads.opl> <map date> <out.json.gz>\n");
  process.exit(2);
}
if (Number.isNaN(Date.parse(mapDate))) {
  process.stderr.write(`The map date "${mapDate}" is not a date.\n`);
  process.exit(2);
}

const builder = createRoadFileBuilder();
const lines = createInterface({ input: createReadStream(input), crlfDelay: Infinity });
for await (const line of lines) builder.add(line);
const { file, summary } = builder.finish({ mapDate: new Date(mapDate).toISOString() });
const zipped = gzipSync(JSON.stringify(file), { level: 9 });
writeFileSync(output, zipped);
process.stdout.write(
  `${JSON.stringify({ ...summary, bytes: zipped.length, mapDate: file.mapDate }, null, 2)}\n`,
);
