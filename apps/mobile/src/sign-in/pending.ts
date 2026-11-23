import type { PhoneNeeded } from "@shareride/contracts";
import type { Translate } from "@shareride/i18n";
import { providerNames } from "./provider-window";

/**
 * The line on top of the phone step (spec 19, 3.3; spec 26, 3.3): who
 * confirmed the person, and why the number is asked for once.
 */
export function phoneStepHelp(t: Translate, pending: PhoneNeeded): string {
  if (pending.provider === "email") {
    return t("auth.email.phoneHelp", { email: pending.email ?? "" });
  }
  const provider = providerNames[pending.provider];
  return pending.email === null
    ? t("auth.provider.phoneHelpHidden", { provider })
    : t("auth.provider.phoneHelp", { provider, email: pending.email });
}

/** Said on step 1 when the waiting sign-in took more than 30 minutes. */
export function pendingExpiredText(t: Translate, pending: PhoneNeeded): string {
  return pending.provider === "email"
    ? t("auth.email.expired")
    : t("auth.provider.expired", { provider: providerNames[pending.provider] });
}
