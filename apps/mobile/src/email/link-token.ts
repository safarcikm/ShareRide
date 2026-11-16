/**
 * The token of a link to verify an email (plan 4.6). The email's link puts
 * it after the `#` on the web, so it never reaches the server's request
 * logs; a link opened in the app gives it as `?token=`.
 */
export function linkToken(hash: string, param: string | undefined): string | null {
  const fromHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (fromHash !== "") return fromHash;
  return param === undefined || param === "" ? null : param;
}
