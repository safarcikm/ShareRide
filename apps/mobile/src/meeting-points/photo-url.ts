/**
 * Where to fetch a meeting point photo from. The API gives a signed link to
 * the bucket (ADR 0029), or, where it keeps photos in a folder itself
 * (development and tests), a path on the API, which the app fetches from
 * the API's own address. A path always stays on the API.
 */
export function photoUrl(url: string, apiBase: string): string {
  return url.startsWith("/") ? `${apiBase.replace(/\/+$/, "")}${url}` : url;
}
