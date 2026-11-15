import { updateMeRoute } from "@shareride/contracts";
import type { Locale } from "@shareride/i18n";
import { useCallback } from "react";
import { useSession } from "@/auth/session";

/**
 * Saves a language chosen outside Settings to the account, when signed in:
 * the account's language is the one used for texts sent to the person. The
 * app has switched already; if saving fails, Settings can try again.
 */
export function useSaveLanguage(): (locale: Locale) => void {
  const session = useSession();
  return useCallback(
    (locale: Locale) => {
      if (session.state().status !== "signedIn") return;
      void session.call(updateMeRoute, { body: { locale } }).then((result) => {
        if (result.ok) session.update(result.data);
      });
    },
    [session],
  );
}
