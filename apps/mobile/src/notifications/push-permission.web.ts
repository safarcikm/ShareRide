import type { PushState } from "./push-permission";

// The web app gets no push (plan 4.5): only an email reaches someone there.

export function setUpChannel(): Promise<void> {
  return Promise.resolve();
}

export function pushState(): Promise<PushState> {
  return Promise.resolve("off");
}

export function turnOnPush(): Promise<boolean> {
  return Promise.resolve(false);
}
