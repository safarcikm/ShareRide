// Stands in for expo-image-picker, which opens the phone's photos, camera or
// the browser's file chooser: a test sets what the person picks and whether
// the app may use the camera.

export interface PickedAsset {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

type Picked = { canceled: true; assets: null } | { canceled: false; assets: PickedAsset[] };

let picked: Picked = { canceled: true, assets: null };
let cameraAllowed = true;

export const launchImageLibraryAsync = jest.fn((_options?: unknown) => Promise.resolve(picked));
export const launchCameraAsync = jest.fn((_options?: unknown) => Promise.resolve(picked));
export const requestCameraPermissionsAsync = jest.fn(() =>
  Promise.resolve({ granted: cameraAllowed, status: cameraAllowed ? "granted" : "denied" }),
);

/** From here on, the person picks this photo, or cancels with null. */
export function photoPickedIs(asset: PickedAsset | null): void {
  picked = asset === null ? { canceled: true, assets: null } : { canceled: false, assets: [asset] };
}

/** From here on, the app may use the camera, or not. */
export function cameraAllowedIs(allowed: boolean): void {
  cameraAllowed = allowed;
}
