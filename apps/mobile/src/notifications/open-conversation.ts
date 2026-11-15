// The conversation on screen, so that a push about it fetches it at once
// instead of showing a banner (plan 4.5).

let showing: { readonly path: string; readonly fetch: () => void } | null = null;

/** While the conversation is on screen; the function returned is for when it is not. */
export function showConversation(bookingId: string, fetch: () => void): () => void {
  const entry = { path: `/messages/${bookingId}`, fetch };
  showing = entry;
  return () => {
    if (showing === entry) showing = null;
  };
}

/** Fetches the conversation at `path` if it is on screen, and says whether it was. */
export function fetchIfShowing(path: string): boolean {
  if (showing?.path !== path) return false;
  showing.fetch();
  return true;
}
