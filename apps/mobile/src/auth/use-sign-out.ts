import { useState } from "react";
import { useLanguage } from "@/i18n/language";
import { errorText } from "./errors";
import { useSession } from "./session";

/**
 * Signing out of this device, as Profile offers it, or of every device
 * (`all`), as Sign-in methods does. Once signed out, the signed-in screens
 * close: Sign-in methods goes back to Find by itself, and `onSignedOut`
 * runs for a screen that stays. When signing out fails, the person stays
 * signed in and `onError` gets why, to show so they can try again; it
 * gets null as signing out starts again.
 */
export function useSignOut({
  onSignedOut,
  onError,
}: {
  readonly onSignedOut?: () => void;
  readonly onError: (message: string | null) => void;
}) {
  const { t } = useLanguage();
  const session = useSession();
  const [signingOut, setSigningOut] = useState<"one" | "all" | null>(null);

  async function signOut(all: boolean) {
    setSigningOut(all ? "all" : "one");
    onError(null);
    const result = await session.signOut({ all });
    if (session.state().status !== "signedIn") {
      onSignedOut?.();
      return;
    }
    setSigningOut(null);
    if (!result.ok) onError(errorText(t, result));
  }

  return { signingOut, signOut };
}
