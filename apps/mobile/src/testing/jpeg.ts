// A made-up JPEG's bytes, as a phone's encoder writes one: a JFIF header,
// what the phone adds (Exif with a place in it, a colour profile), then the
// picture. Only its frame's size is real; nobody can view it.

const segment = (marker: number, data: readonly number[]) => [
  0xff,
  marker,
  (data.length + 2) >> 8,
  (data.length + 2) & 0xff,
  ...data,
];

const ascii = (text: string) => Array.from(text, (letter) => letter.charCodeAt(0));

/** A JPEG `width` by `height` pixels, `padding` bytes of scan data long. */
export function phoneJpeg(width: number, height: number, padding = 4): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    ...segment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xe1, [...ascii("Exif"), 0, 0, ...ascii("GPS 64.1466 -21.9426")]),
    ...segment(0xe2, [...ascii("ICC_PROFILE"), 0, 1, 1, 0, 0]),
    ...segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]),
    ...segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]),
    ...segment(0xc4, [0, ...Array.from({ length: 16 }, (_, i) => (i === 0 ? 1 : 0)), 0]),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
    ...Array.from({ length: padding }, () => 0x12),
    0xff,
    0xd9,
  ]);
}
