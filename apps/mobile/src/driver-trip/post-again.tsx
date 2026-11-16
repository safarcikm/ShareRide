import { copyTripRoute } from "@shareride/contracts";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { TakesFocus } from "@/components/takes-focus";
import { useLanguage } from "@/i18n/language";
import { rememberDropped } from "@/trips/copied";

/**
 * "Post again" and "Post the return" (spec 6, 3.6): each makes a new draft
 * from the trip, its stops reversed for the return, and opens it at the
 * date and times, which the driver chooses again. Meeting points no longer
 * in use are left out, and the date and times step names them. One draft
 * per tap: both buttons wait while one is made, until the trip page is
 * back in view.
 */
export function PostAgain({ tripId }: { readonly tripId: string }) {
  const { t } = useLanguage();
  const session = useSession();
  const [busy, setBusy] = useState<"again" | "return" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Set at once, before the buttons show they wait, so a second tap makes nothing.
  const making = useRef(false);
  useFocusEffect(
    useCallback(() => {
      making.current = false;
      setBusy(null);
    }, []),
  );

  const post = async (reverse: boolean) => {
    if (making.current) return;
    making.current = true;
    setNotice(null);
    setBusy(reverse ? "return" : "again");
    const copied = await session.call(copyTripRoute, {
      params: { id: tripId },
      query: { reverse },
      body: {},
    });
    if (!copied.ok) {
      making.current = false;
      setBusy(null);
      setNotice(
        copied.error.code === "too_few_stops" ? t("trip.copyTooFewStops") : errorText(t, copied),
      );
      return;
    }
    const { trip, dropped } = copied.data;
    rememberDropped(trip.id, dropped);
    router.push({ pathname: "/drive/trips/[id]/time", params: { id: trip.id } });
  };

  return (
    <>
      <Button
        variant="secondary"
        busy={busy === "again"}
        disabled={busy !== null}
        label={t("trip.postAgain")}
        onPress={() => {
          void post(false);
        }}
      />
      <Button
        variant="secondary"
        busy={busy === "return"}
        disabled={busy !== null}
        label={t("trip.postReturn")}
        onPress={() => {
          void post(true);
        }}
      />
      {notice === null ? null : (
        <TakesFocus key={notice}>
          <Notice message={notice} />
        </TakesFocus>
      )}
    </>
  );
}
