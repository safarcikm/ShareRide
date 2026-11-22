import { useState } from "react";
import { useLanguage } from "@/i18n/language";
import { errorText } from "./errors";
import { useSession } from "./session";

/**
 * Signing out of this device, or of every device (`all`), as Settings and
 * Profile offer it. Once signed out, the signed-in screens close: Settings
 * goes back to Find by itself, and `onSignedOut` runs for a screen that
 * stays. When signing out fails, the person stays signed in and `error`
 * says why, so they can try again.
 */
export function useSignOut(onSignedOut?: () => void) {
  const { t } = useLanguage();
  const session = useSession();
  const [signingOut, setSigningOut] = useState<"one" | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signOut(all: boolean) {
    setSigningOut(all ? "all" : "one");
    setError(null);
    const result = await session.signOut({ all });
    if (session.state().status !== "signedIn") {
      onSignedOut?.();
      return;
    }
    setSigningOut(null);
    if (!result.ok) setError(errorText(t, result));
  }

  return { signingOut, error, signOut };
}
