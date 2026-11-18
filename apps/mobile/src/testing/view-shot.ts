// Stands in for react-native-view-shot, which is native: a test sets what
// the screen's picture is, or that taking it fails.

let answer: () => Promise<string> = () => Promise.reject(new Error("No screenshot in tests."));

export const captureScreen = jest.fn((_options?: unknown) => answer());

/** From here on, a screenshot is this base64 text, or fails with this error. */
export function screenshotIs(taken: string | Error): void {
  answer = () => (typeof taken === "string" ? Promise.resolve(taken) : Promise.reject(taken));
}
