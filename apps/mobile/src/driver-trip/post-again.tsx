import { copyTripRoute } from "@shareride/contracts";
import { router, useFocusEffect } from "expo-router";
import { Repeat, Undo2 } from "lucide-react-native";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Notice } from "@/components/notice";
import { Row } from "@/components/row";
import { TakesFocus } from "@/components/takes-focus";
import { useLanguage } from "@/i18n/language";
import { rememberDropped } from "@/trips/copied";

/**
 * "Post it again" and "Post the way back" (spec 6, 3.6), as two rows of
 * the ride's rows (spec 31, 3.12, item 6): each makes a new draft from the
 * ride, its stops reversed for the way back, and opens it at the date and
 * times, which the driver chooses again. Meeting points no longer in use
 * are left out, and the date and times step names them. One draft per
 * press: both rows wait while one is made, the one pressed says so and the
 * other is disabled, until the ride's page is back in view.
 *
 * The page places the `rows` in a card of rows and the `notice`, why no
 * draft was made, under that card; what is going on stays here, so it
 * lasts when the rows move between a phone's column and a wide screen's.
 */
export function usePostAgain(tripId: string): {
  readonly rows: ReactNode;
  readonly notice: ReactNode;
} {
  const { t } = useLanguage();
  const session = useSession();
  const [busy, setBusy] = useState<"again" | "return" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Set at once, before the rows show they wait, so a second press makes nothing.
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

  return {
    rows: (
      <>
        <Row
          icon={Repeat}
          title={t("trip.postAgain")}
          value={busy === "again" ? t("common.loading") : undefined}
          disabled={busy === "return"}
          onPress={() => {
            void post(false);
          }}
        />
        <Row
          icon={Undo2}
          title={t("trip.postReturn")}
          value={busy === "return" ? t("common.loading") : undefined}
          disabled={busy === "again"}
          onPress={() => {
            void post(true);
          }}
        />
      </>
    ),
    notice:
      notice === null ? null : (
        <TakesFocus key={notice}>
          <Notice message={notice} />
        </TakesFocus>
      ),
  };
}
