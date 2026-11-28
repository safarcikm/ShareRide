import { bannerFor, inIceland, parseCalendarDate, type Banner } from "@shareride/domain";
import { useLocalSearchParams } from "expo-router";
import { onWebsite } from "@/lib/on-website";

/**
 * The season and the day the front page's banner shows at `at`: the date
 * on a clock in Iceland, whatever the device's own zone (spec 36, 3.1). On
 * the website `?day=YYYY-MM-DD` shows another date, to look at a season or
 * a day before it comes; one that is no date is left out, and a phone has
 * no address to give one (3.9).
 */
export function useBanner(at: Date): Banner {
  const { day } = useLocalSearchParams<{ day?: string }>();
  const asked = onWebsite() && typeof day === "string" ? parseCalendarDate(day) : null;
  return bannerFor(asked ?? inIceland(at), { festiveDays: false });
}
