import { useLocalSearchParams } from "expo-router";
import { useLanguage } from "@/i18n/language";
import { RouteStep } from "@/trips/route-step";
import { StepScreen } from "@/trips/step-screen";
import { Loading, useDraftOnFocus } from "@/trips/use-draft";

/** Step 1 of a draft: change its route (spec 3, screen 4). */
export default function RouteStepScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const { t } = useLanguage();
  const { value: result, reload } = useDraftOnFocus(id);
  if (result === undefined || !result.ok) {
    return (
      <StepScreen step="route" title={t("trip.route.title")}>
        <Loading failure={result} onRetry={reload} />
      </StepScreen>
    );
  }
  // A step left in the stack starts again from the draft when another step
  // changed it, so going back never saves an old copy over newer choices.
  return (
    <RouteStep key={result.data.updatedAt} trip={result.data} fromReview={from === "review"} />
  );
}
