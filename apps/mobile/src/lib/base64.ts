// Base64 for a file's bytes, such as a screenshot: the app has no Buffer,
// and `atob` works on text, not bytes.

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const values = new Map(Array.from(alphabet, (letter, index) => [letter, index]));

/** The bytes a base64 text stands for, or undefined when it is not base64. */
export function bytesFromBase64(text: string): Uint8Array | undefined {
  const clean = text.replace(/\s+/g, "").replace(/=+$/, "");
  if (clean.length % 4 === 1) return undefined;
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let at = 0;
  let bits = 0;
  let held = 0;
  for (const letter of clean) {
    const value = values.get(letter);
    if (value === undefined) return undefined;
    held = (held << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[at] = (held >> bits) & 0xff;
      at += 1;
    }
  }
  return bytes;
}

/** Bytes as base64 text, padded. */
export function base64FromBytes(bytes: Uint8Array): string {
  let text = "";
  for (let at = 0; at < bytes.length; at += 3) {
    const [a = 0, b = 0, c = 0] = [bytes[at], bytes[at + 1], bytes[at + 2]];
    const left = bytes.length - at;
    text += alphabet.charAt(a >> 2);
    text += alphabet.charAt(((a & 0x03) << 4) | (b >> 4));
    text += left > 1 ? alphabet.charAt(((b & 0x0f) << 2) | (c >> 6)) : "=";
    text += left > 2 ? alphabet.charAt(c & 0x3f) : "=";
  }
  return text;
}
