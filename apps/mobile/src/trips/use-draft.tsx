import { myTripRoute } from "@shareride/contracts";
import { useCallback } from "react";
import { ActivityIndicator } from "react-native";
import type { CallFailure } from "@shareride/api-client";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { useLanguage } from "@/i18n/language";
import { useLoaded, useLoadedOnFocus } from "@/lib/use-loaded";
import { usePalette } from "@/theme/use-palette";

function useLoadDraft(id: string) {
  const session = useSession();
  return useCallback(() => session.call(myTripRoute, { params: { id } }), [id, session]);
}

/** One of my trips, loaded when the screen opens. */
export const useDraft = (id: string) => useLoaded(useLoadDraft(id));

/** One of my trips, loaded again each time the screen comes back into view. */
export const useDraftOnFocus = (id: string) => useLoadedOnFocus(useLoadDraft(id));

/** Shown while a trip loads, or when it could not: a spinner, or the error and a retry. */
export function Loading({
  failure,
  onRetry,
}: {
  readonly failure?: CallFailure;
  readonly onRetry?: () => void;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  if (failure === undefined) {
    return <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />;
  }
  return (
    <>
      <Notice
        message={
          failure.error.code === "distances_pending"
            ? t("trip.distancesPending")
            : errorText(t, failure)
        }
      />
      {onRetry === undefined ? null : (
        <Button variant="secondary" label={t("common.retry")} onPress={onRetry} />
      )}
    </>
  );
}
