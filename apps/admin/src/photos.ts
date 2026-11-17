import { photoLimits, stripPhotoMetadata } from "@shareride/domain";

/**
 * Makes a chosen picture into the JPEG the API takes (ADR 0029), behind an
 * interface so tests can stand in for the browser's canvas.
 */
export interface PhotoBrowser {
  /**
   * The picture turned upright, at most 1 600 pixels on its longer side,
   * written again as a JPEG with only the picture's own segments: no
   * location, camera or other data. Throws if the browser cannot read it.
   */
  prepare(file: Blob): Promise<Uint8Array>;
}

/** JPEG qualities to try, until the file fits within `photoLimits.maxBytes`. */
const qualities = [0.85, 0.75, 0.6, 0.45];

export const browserPhotos: PhotoBrowser = {
  async prepare(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const scale = Math.min(1, photoLimits.maxEdge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("The browser cannot draw the photo.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let bytes: Uint8Array = new Uint8Array();
      for (const quality of qualities) {
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, "image/jpeg", quality);
        });
        if (blob === null) throw new Error("The browser cannot write the photo.");
        // Safari's canvas adds Exif and Photoshop segments; the API takes none.
        bytes = stripPhotoMetadata(new Uint8Array(await blob.arrayBuffer()));
        if (bytes.length <= photoLimits.maxBytes) break;
      }
      return bytes;
    } finally {
      bitmap.close();
    }
  },
};

/** A file's bytes in base64, as the API takes a photo in JSON. */
export function toBase64(bytes: Uint8Array): string {
  let text = "";
  // In parts, as String.fromCharCode takes only so many arguments.
  for (let at = 0; at < bytes.length; at += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(text);
}
