import { crc32, inflateRawSync } from "node:zlib";

// Reads the files out of a downloaded "Download my data" ZIP: deflated
// entries one after another, as the API's ZIP writer makes them
// (apps/api/src/platform/zip.ts).

const localHeader = 0x04034b50;

/** Each file in `archive` by name; throws if one is damaged. */
export function filesIn(archive: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  let at = 0;
  while (at + 30 <= archive.length && archive.readUInt32LE(at) === localHeader) {
    const packedSize = archive.readUInt32LE(at + 18);
    const nameLength = archive.readUInt16LE(at + 26);
    const extraLength = archive.readUInt16LE(at + 28);
    const name = archive.subarray(at + 30, at + 30 + nameLength).toString("utf8");
    const start = at + 30 + nameLength + extraLength;
    const data = inflateRawSync(archive.subarray(start, start + packedSize));
    if (crc32(data) !== archive.readUInt32LE(at + 14)) throw new Error(`${name} is damaged.`);
    files.set(name, data.toString("utf8"));
    at = start + packedSize;
  }
  return files;
}
