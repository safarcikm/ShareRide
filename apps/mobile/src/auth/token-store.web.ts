import type { TokenStore } from "./session-manager";

// Web: the API keeps the refresh token in an HTTP-only cookie that scripts
// cannot read, so there is nothing to store here (ADR 0016).
export const tokenStore: TokenStore = {
  read: () => Promise.resolve(null),
  write: () => Promise.resolve(),
  clear: () => Promise.resolve(),
};
