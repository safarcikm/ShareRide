// The phone apps' versions (spec 32, 3.6 and R32.4): the API serves every
// version at or above the oldest one it still supports; an app below it
// shows only "Update PuffinRide".

/** Three whole numbers with dots between, such as 1.0.0, without leading zeros. */
const appVersionPattern = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;

/** Whether the text is an app version as the stores have it: `x.y.z`. */
export function isAppVersion(text: string): boolean {
  return appVersionPattern.test(text);
}

function partsOf(version: string): readonly number[] | null {
  const match = appVersionPattern.exec(version);
  return match === null ? null : match.slice(1).map(Number);
}

/**
 * Whether `version` is older than `oldest`, comparing the numbers part by
 * part (1.9.0 is older than 1.10.0). It never blocks when either cannot be
 * read: no oldest version, an empty one, or one that is not `x.y.z`, and
 * likewise an app whose own version is not.
 */
export function isOlderThan(version: string, oldest: string | null): boolean {
  if (oldest === null) return false;
  const these = partsOf(version);
  const least = partsOf(oldest);
  if (these === null || least === null) return false;
  for (let index = 0; index < these.length; index += 1) {
    const mine = these[index] ?? 0;
    const theirs = least[index] ?? 0;
    if (mine !== theirs) return mine < theirs;
  }
  return false;
}
