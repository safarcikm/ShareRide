import { useLanguage } from "@/i18n/language";
import type { Shared } from "@/lib/share";
import { Notice } from "./notice";

/**
 * What became of a shared link: copied, or, when it could not be shared,
 * the link itself to select and copy. Nothing when it was shared or the
 * person closed the share sheet.
 */
export function ShareNotice({ shared }: { readonly shared: Shared | null }) {
  const { t } = useLanguage();
  if (shared === null || shared.outcome === "shared" || shared.outcome === "dismissed") {
    return null;
  }
  return shared.outcome === "copied" ? (
    <Notice kind="info" message={t("trip.linkCopied")} />
  ) : (
    <Notice selectable message={t("trip.shareFailed", { url: shared.url })} />
  );
}
