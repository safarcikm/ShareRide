import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

// A small ZIP writer for "Download my data" (spec 11, 3.2): a few files,
// deflated, with UTF-8 names. No ZIP64, so each file and the archive stay
// under 4 GB, far above an export's size. Written here rather than added as
// a dependency (privacy self-service plan, 4.4).

export interface ZipEntry {
  readonly name: string;
  readonly data: Buffer;
}

const localHeader = 0x04034b50;
const centralHeader = 0x02014b50;
const endOfCentral = 0x06054b50;
/** Version 2.0: deflate. */
const version = 20;
/** Bit 11: names are UTF-8. */
const utf8Names = 0x0800;
const deflated = 8;

/** The time in MS-DOS form, as ZIP keeps it: two-second steps, from 1980. */
function dosTime(at: Date): { readonly time: number; readonly date: number } {
  return {
    time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | Math.floor(at.getUTCSeconds() / 2),
    date: ((at.getUTCFullYear() - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
  };
}

export function zip(entries: readonly ZipEntry[], modifiedAt: Date): Buffer {
  const { time, date } = dosTime(modifiedAt);
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const packed = deflateRawSync(entry.data);
    const checksum = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(localHeader, 0);
    local.writeUInt16LE(version, 4);
    local.writeUInt16LE(utf8Names, 6);
    local.writeUInt16LE(deflated, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, packed);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(centralHeader, 0);
    header.writeUInt16LE(version, 4);
    header.writeUInt16LE(version, 6);
    header.writeUInt16LE(utf8Names, 8);
    header.writeUInt16LE(deflated, 10);
    header.writeUInt16LE(time, 12);
    header.writeUInt16LE(date, 14);
    header.writeUInt32LE(checksum, 16);
    header.writeUInt32LE(packed.length, 20);
    header.writeUInt32LE(entry.data.length, 24);
    header.writeUInt16LE(name.length, 28);
    // Extra field, comment, disk number, internal and external attributes: none.
    header.writeUInt32LE(offset, 42);
    central.push(header, name);

    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(endOfCentral, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

/** Reads back an archive `zip` wrote; for tests. */
export function readZip(archive: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let at = 0;
  while (archive.readUInt32LE(at) === localHeader) {
    const packedSize = archive.readUInt32LE(at + 18);
    const nameLength = archive.readUInt16LE(at + 26);
    const extraLength = archive.readUInt16LE(at + 28);
    const name = archive.subarray(at + 30, at + 30 + nameLength).toString("utf8");
    const start = at + 30 + nameLength + extraLength;
    const data = inflateRawSync(archive.subarray(start, start + packedSize));
    if (crc32(data) !== archive.readUInt32LE(at + 14)) throw new Error(`${name} is damaged.`);
    entries.push({ name, data });
    at = start + packedSize;
  }
  return entries;
}
