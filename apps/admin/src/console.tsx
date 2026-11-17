import type { ApiClient, CallInput, CallResult } from "@shareride/api-client";
import type { AdminMe, RouteDefinition } from "@shareride/contracts";
import type { Locale, Translate } from "@shareride/i18n";
import { createContext, useContext } from "react";
import type { PhotoBrowser } from "./photos.ts";
import type { PasskeyBrowser } from "./webauthn.ts";

/** What every console page can use. */
export interface Console {
  readonly t: Translate;
  readonly locale: Locale;
  readonly passkeys: PasskeyBrowser;
  readonly photos: PhotoBrowser;
  /**
   * Calls the API. When the console session has ended it shows the sign-in
   * page, and the result still says why.
   */
  readonly call: <R extends RouteDefinition>(
    route: R,
    input: CallInput<R>,
  ) => Promise<CallResult<R>>;
  readonly navigate: (path: string) => void;
  /** The signed-in operator; undefined on the sign-in and setup pages. */
  readonly operator: AdminMe | undefined;
}

export const ConsoleContext = createContext<Console | undefined>(undefined);

export function useConsole(): Console {
  const value = useContext(ConsoleContext);
  if (value === undefined) throw new Error("useConsole is used outside the console.");
  return value;
}

export type { ApiClient };
