/**
 * The fullest run of stretches among those from stop `from` to stop `to`
 * (the whole ride by default): the first run of stretches next to each
 * other that all hold the most seats. `from` and `to` in the answer are
 * stops: the run starts at stop `from` and ends at stop `to`, so their
 * names say "from Mjódd to Selfoss" (spec 31, 3.12). Null without a
 * stretch.
 */
export function busiestStretch(
  seatsTaken: readonly number[],
  from = 0,
  to: number = seatsTaken.length,
): { readonly taken: number; readonly from: number; readonly to: number } | null {
  const first = Math.max(0, from);
  const end = Math.min(seatsTaken.length, to);
  if (first >= end) return null;
  const taken = Math.max(...seatsTaken.slice(first, end));
  const start = seatsTaken.indexOf(taken, first);
  let stop = start + 1;
  while (stop < end && seatsTaken[stop] === taken) stop += 1;
  return { taken, from: start, to: stop };
}
