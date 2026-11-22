import { checkProfilePhoto } from "@shareride/domain";
import { bytesFromBase64 } from "@/lib/base64";
import { cameraAllowedIs, launchCameraAsync, photoPickedIs } from "@/testing/image-picker";
import { made, photoSizeIs, resetManipulator, savedPaddingIs } from "@/testing/image-manipulator";
import { choosePhoto } from "./photo-picker";

function picks(width: number, height: number) {
  const uri = `file:///picked-${String(width)}x${String(height)}.jpg`;
  photoPickedIs({ uri, width, height });
  photoSizeIs(uri, { width, height });
}

function bytesOf(chosen: Awaited<ReturnType<typeof choosePhoto>>) {
  if (chosen.kind !== "chosen") throw new Error(chosen.kind);
  const bytes = bytesFromBase64(chosen.photo);
  if (bytes === undefined) throw new Error("Not base64.");
  return bytes;
}

beforeEach(() => {
  resetManipulator();
  cameraAllowedIs(true);
  photoPickedIs(null);
});

describe("choosePhoto (ADR 0033)", () => {
  it("crops the middle square, makes it at most 640 pixels and drops what the phone added", async () => {
    picks(1200, 900);
    const bytes = bytesOf(await choosePhoto("library"));
    expect(made.crop).toEqual({ originX: 150, originY: 0, width: 900, height: 900 });
    expect(made.size).toEqual({ width: 640, height: 640 });
    // The fake writes Exif with a place in it, as an iPhone does; the API refuses it.
    expect(checkProfilePhoto(bytes)).toEqual({ ok: true, value: { edge: 640 } });
  });

  it("keeps a photo between 256 and 640 pixels at its own size", async () => {
    picks(300, 400);
    expect(checkProfilePhoto(bytesOf(await choosePhoto("library")))).toEqual({
      ok: true,
      value: { edge: 300 },
    });
  });

  it("saves at a lower quality until the file fits 512 KB", async () => {
    picks(640, 640);
    savedPaddingIs((compress) => (compress > 0.5 ? 600 * 1024 : 100 * 1024));
    const bytes = bytesOf(await choosePhoto("library"));
    expect(bytes.length).toBeLessThan(512 * 1024);
  });

  it("gives up on a photo that never fits", async () => {
    picks(640, 640);
    savedPaddingIs(() => 600 * 1024);
    expect(await choosePhoto("library")).toEqual({ kind: "unusable" });
  });

  it("refuses a photo smaller than 256 pixels across", async () => {
    picks(200, 900);
    expect(await choosePhoto("library")).toEqual({ kind: "too_small" });
  });

  it("does nothing when the person cancels", async () => {
    expect(await choosePhoto("library")).toEqual({ kind: "cancelled" });
  });

  it("asks for the camera first, and says so when the app may not use it", async () => {
    picks(640, 640);
    expect((await choosePhoto("camera")).kind).toBe("chosen");
    expect(launchCameraAsync).toHaveBeenCalled();

    launchCameraAsync.mockClear();
    cameraAllowedIs(false);
    expect(await choosePhoto("camera")).toEqual({ kind: "no_camera" });
    expect(launchCameraAsync).not.toHaveBeenCalled();
  });
});
