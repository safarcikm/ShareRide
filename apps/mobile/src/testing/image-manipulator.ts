// Stands in for expo-image-manipulator, which is native (a canvas on the
// web): it writes a made-up JPEG of the size the app asked for, with what a
// phone's encoder adds, so the app's own cleaning and checks run as they do
// on a phone. A test can make the files larger at a quality.
import { phoneJpeg } from "./jpeg";
import { base64FromBytes } from "@/lib/base64";

export const SaveFormat = { JPEG: "jpeg", PNG: "png", WEBP: "webp" } as const;

interface Size {
  readonly width: number;
  readonly height: number;
}

/** Bytes of picture data in a file saved at each quality, 0 to 1. */
let paddingAt: (compress: number) => number = () => 4;

/** What the app asked for last: the crop and the size. */
export const made: {
  crop: (Size & { originX: number; originY: number }) | null;
  size: Size | null;
} = {
  crop: null,
  size: null,
};

function context(start: Size) {
  let size = start;
  const steps = {
    crop(rect: Size & { originX: number; originY: number }) {
      made.crop = rect;
      size = { width: rect.width, height: rect.height };
      return steps;
    },
    resize(next: { width?: number | null; height?: number | null }) {
      size = { width: next.width ?? size.width, height: next.height ?? size.height };
      made.size = size;
      return steps;
    },
    renderAsync() {
      const { width, height } = size;
      return Promise.resolve({
        width,
        height,
        saveAsync: jest.fn((options: { compress?: number; base64?: boolean } = {}) =>
          Promise.resolve({
            uri: "file:///made.jpg",
            width,
            height,
            base64:
              options.base64 === true
                ? base64FromBytes(phoneJpeg(width, height, paddingAt(options.compress ?? 1)))
                : undefined,
          }),
        ),
      });
    },
  };
  return steps;
}

/** The picked photo's size, by its address, as the test picked it. */
const sizes = new Map<string, Size>();

export const ImageManipulator = {
  manipulate: jest.fn((uri: string) => context(sizes.get(uri) ?? { width: 0, height: 0 })),
};

/** For the fake picker's photos: the size of the photo at `uri`. */
export function photoSizeIs(uri: string, size: Size): void {
  sizes.set(uri, size);
}

/** From here on, a file saved at a quality has this much picture data. */
export function savedPaddingIs(padding: (compress: number) => number): void {
  paddingAt = padding;
}

/** Back to small files, and nothing asked for yet. */
export function resetManipulator(): void {
  paddingAt = () => 4;
  made.crop = null;
  made.size = null;
  sizes.clear();
}
