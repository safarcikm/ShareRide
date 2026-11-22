/**
 * The screen's pattern, such as `/trips/[id]`, from the router's segments
 * (`useSegments()`): what Google Analytics is told about a screen, never its
 * address, so no trip's, booking's or person's ID and no query reaches it
 * (spec 23, R23.3). Groups such as `(tabs)` and `index` are not part of an
 * address, so they are left out.
 */
export function screenPattern(segments: readonly string[]): string {
  const parts = segments.filter(
    (segment) => segment !== "index" && !(segment.startsWith("(") && segment.endsWith(")")),
  );
  return `/${parts.join("/")}`;
}
