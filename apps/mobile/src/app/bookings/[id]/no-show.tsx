import { ReportScreen } from "@/trip-day/report-screen";

/** The driver marks a passenger as a no-show (spec 8, 3.3; screen 3). */
export default function NoShowScreen() {
  return <ReportScreen kind="no_show" />;
}
