/**
 * Starts a download from this tab. The file comes as an attachment, so the
 * page stays where it is.
 */
export function openDownload(url: string): Promise<void> {
  window.location.assign(url);
  return Promise.resolve();
}
