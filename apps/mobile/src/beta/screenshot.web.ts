// The web takes no screenshot: a browser cannot take a true picture of its
// own page (milestone 11, choice 2).

export function takeScreenshot(): Promise<string | null> {
  return Promise.resolve(null);
}
