import { checkProfilePhoto, profilePhotoLimits, stripPhotoMetadata } from "@shareride/domain";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  type ImagePickerOptions,
} from "expo-image-picker";
import { base64FromBytes, bytesFromBase64 } from "@/lib/base64";

// A profile photo as the app makes it (spec 1, 3.5; ADR 0033): picked from
// the phone's photos or taken with its camera (the browser's file chooser
// on the web), cropped square from the middle, at most 640 pixels across,
// written again as a JPEG, and without what the phone added, such as where
// it was taken. The API checks the same and refuses anything else.

export type PhotoSource = "library" | "camera";

export type ChosenPhoto =
  /** Ready to send: a JPEG in base64. */
  | { readonly kind: "chosen"; readonly photo: string }
  | { readonly kind: "cancelled" }
  /** The person has not let the app use the camera. */
  | { readonly kind: "no_camera" }
  /** Narrower than `profilePhotoLimits.minEdge` on its short side. */
  | { readonly kind: "too_small" }
  /** It could not be read, or made small enough. */
  | { readonly kind: "unusable" };

/** Tried in turn until the file fits the API's limit. */
const qualities = [0.8, 0.6, 0.4];

/** Phones offer a square crop themselves; the web picks the whole picture. */
const options: ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 1,
  exif: false,
};

export async function choosePhoto(source: PhotoSource): Promise<ChosenPhoto> {
  try {
    if (source === "camera" && !(await requestCameraPermissionsAsync()).granted) {
      return { kind: "no_camera" };
    }
    const picked =
      source === "camera"
        ? await launchCameraAsync(options)
        : await launchImageLibraryAsync(options);
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (asset === undefined) return { kind: "cancelled" };
    return await madeFrom(asset);
  } catch {
    return { kind: "unusable" };
  }
}

async function madeFrom(asset: {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}): Promise<ChosenPhoto> {
  const side = Math.min(asset.width, asset.height);
  if (side < profilePhotoLimits.minEdge) return { kind: "too_small" };
  const edge = Math.min(side, profilePhotoLimits.maxEdge);
  const picture = await ImageManipulator.manipulate(asset.uri)
    .crop({
      originX: Math.floor((asset.width - side) / 2),
      originY: Math.floor((asset.height - side) / 2),
      width: side,
      height: side,
    })
    .resize({ width: edge, height: edge })
    .renderAsync();
  for (const compress of qualities) {
    const saved = await picture.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
    const bytes = saved.base64 === undefined ? undefined : bytesFromBase64(saved.base64);
    if (bytes === undefined) return { kind: "unusable" };
    const clean = stripPhotoMetadata(bytes);
    const checked = checkProfilePhoto(clean);
    if (checked.ok) return { kind: "chosen", photo: base64FromBytes(clean) };
    if (checked.error !== "too_large") return { kind: "unusable" };
  }
  return { kind: "unusable" };
}
