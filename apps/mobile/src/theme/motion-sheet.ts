/** The website's motion style sheet (`motion-sheet.web.ts`); phones have none. */
export function installMotion(): void {
  // Phones move with the motion kit, after the first App Store release (spec 33, 3.11).
}

/** On the website, calls `done` once the car has arrived; phones have no arrival yet. */
export function whenArrived(done: () => void): () => void {
  done();
  return () => undefined;
}

/** On the website, calls `done` once the car itself has stopped; phones have no arrival yet. */
export function whenCarStopped(done: () => void): () => void {
  done();
  return () => undefined;
}
