import { Check, Share } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Announcer } from "@/components/announcer";
import { useCardCorner } from "@/components/card";
import { IconButton } from "@/components/icon-button";
import { useLanguage } from "@/i18n/language";
import { shareLink, type Shared } from "@/lib/share";

/** How long the tick shows after the link was copied. */
const tickMs = 2000;

/**
 * The share icon in a ride card's corner (spec 28, 3.1): it shares `url`
 * with `text` in the phone's or the browser's share window, or copies it,
 * and then shows a tick for two seconds and says so. What became of each
 * share goes to `onShared`, so the card can show the link to copy by hand
 * when it could not be shared. A press while the share window is open does
 * nothing.
 */
export function ShareCorner({
  url,
  text,
  route,
  onShared,
}: {
  readonly url: string;
  readonly text: string;
  /** The ride's route, which names the button. */
  readonly route: string;
  readonly onShared?: (shared: Shared) => void;
}) {
  const { t } = useLanguage();
  const card = useCardCorner();
  const [copied, setCopied] = useState(0);
  const [said, setSaid] = useState<{ text: string; count: number } | null>(null);
  const sharing = useRef(false);
  useEffect(() => {
    if (copied === 0) return;
    const timer = setTimeout(() => {
      setCopied(0);
      // Read out by now; a screen left in the stack keeps no stale words.
      setSaid(null);
    }, tickMs);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);
  const share = async () => {
    if (sharing.current) return;
    sharing.current = true;
    try {
      const outcome = await shareLink(url, text);
      onShared?.({ outcome, url });
      if (outcome === "copied") {
        setCopied((last) => last + 1);
        setSaid({ text: t("trip.linkCopied"), count: copied + 1 });
      }
    } finally {
      sharing.current = false;
    }
  };
  return (
    <>
      <IconButton
        quiet
        icon={copied === 0 ? Share : Check}
        label={t("shareRide.cardLabel", { route })}
        faceTestID={copied === 0 ? undefined : "share-copied"}
        {...(card ?? {})}
        onPress={() => {
          void share();
        }}
      />
      <Announcer message={said} />
    </>
  );
}
