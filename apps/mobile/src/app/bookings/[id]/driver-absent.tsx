import { ReportScreen } from "@/trip-day/report-screen";

/** The passenger says the driver didn't come (spec 8, 3.4; screen 4). */
export default function DriverAbsentScreen() {
  return <ReportScreen kind="driver_absent" />;
}
