import { checkScreenshot, stripPhotoMetadata } from "@shareride/domain";
import { captureScreen } from "react-native-view-shot";
import { base64FromBytes, bytesFromBase64 } from "@/lib/base64";

// iOS and Android: a picture of the screen as it is now, for feedback (spec
// 12, 3.3.2). The web version, screenshot.web.ts, takes none (milestone 11,
// choice 2).

/** Tried in turn until the file fits the API's limit. */
const qualities = [0.7, 0.4, 0.2];

/**
 * The screen as a JPEG in base64, without anything besides the picture (the
 * phone may write when and how it was taken), or null when it could not be
 * taken or would not fit: feedback is then sent without one.
 */
export async function takeScreenshot(): Promise<string | null> {
  for (const quality of qualities) {
    try {
      const taken = await captureScreen({ format: "jpg", quality, result: "base64" });
      const bytes = bytesFromBase64(taken);
      if (bytes === undefined) return null;
      const picture = stripPhotoMetadata(bytes);
      const checked = checkScreenshot(picture);
      if (checked.ok) return base64FromBytes(picture);
      if (checked.error !== "too_large") return null;
    } catch {
      return null;
    }
  }
  return null;
}
