import { base64FromBytes, bytesFromBase64 } from "./base64";

describe("base64", () => {
  it("writes bytes as padded base64", () => {
    expect(base64FromBytes(Uint8Array.from([]))).toBe("");
    expect(base64FromBytes(Uint8Array.from([0xff]))).toBe("/w==");
    expect(base64FromBytes(Uint8Array.from([0xff, 0xd8]))).toBe("/9g=");
    expect(base64FromBytes(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe("/9j/");
  });

  it("reads it back, with or without padding and line breaks", () => {
    const bytes = Uint8Array.from({ length: 300 }, (_, index) => (index * 7) % 256);
    expect(bytesFromBase64(base64FromBytes(bytes))).toEqual(bytes);
    expect(bytesFromBase64("/9g")).toEqual(Uint8Array.from([0xff, 0xd8]));
    expect(bytesFromBase64("/9\nj/")).toEqual(Uint8Array.from([0xff, 0xd8, 0xff]));
  });

  it("says when a text is not base64", () => {
    expect(bytesFromBase64("not base64!")).toBeUndefined();
    expect(bytesFromBase64("abcde")).toBeUndefined();
  });
});
