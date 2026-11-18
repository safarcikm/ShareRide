import type { MessageKey } from "@shareride/i18n";
import type { ComponentType } from "react";
import { AnnouncementsPage } from "./pages/announcements/page.tsx";
import { AppealsPage } from "./pages/appeals/page.tsx";
import { AuditLogPage } from "./pages/audit-log.tsx";
import { CorridorsPage } from "./pages/corridors/page.tsx";
import { DisputesPage } from "./pages/disputes/page.tsx";
import { FeedbackPage } from "./pages/feedback/page.tsx";
import { HomePage } from "./pages/home.tsx";
import { InviteCodesPage } from "./pages/invite-codes/page.tsx";
import { MetricsPage } from "./pages/metrics/page.tsx";
import { MeetingPointsPage } from "./pages/meeting-points/page.tsx";
import { PasskeysPage } from "./pages/passkeys.tsx";
import { ReliabilityPage } from "./pages/reliability/page.tsx";
import { ReportsPage } from "./pages/reports/page.tsx";
import { SettingsPage } from "./pages/settings/page.tsx";
import { TripsPage } from "./pages/trips/page.tsx";
import { UsersPage } from "./pages/users/page.tsx";

/**
 * The console's sections, in menu order. A spec adds its pages with one
 * entry here and its texts under `admin.<area>.*` (operator console guide in
 * docs/engineering/operator-console.md). A section owns its path and every
 * path below it, for its detail pages.
 */
export interface Section {
  readonly path: string;
  readonly title: MessageKey;
  readonly Page: ComponentType;
}

export const homePath = "/admin";

export const sections: readonly Section[] = [
  { path: homePath, title: "admin.home.title", Page: HomePage },
  { path: "/admin/meeting-points", title: "admin.meetingPoints.title", Page: MeetingPointsPage },
  { path: "/admin/disputes", title: "admin.disputes.title", Page: DisputesPage },
  { path: "/admin/reports", title: "admin.reports.title", Page: ReportsPage },
  { path: "/admin/appeals", title: "admin.appeals.title", Page: AppealsPage },
  { path: "/admin/reliability", title: "admin.reliability.title", Page: ReliabilityPage },
  { path: "/admin/users", title: "admin.users.title", Page: UsersPage },
  { path: "/admin/trips", title: "admin.trips.title", Page: TripsPage },
  { path: "/admin/invite-codes", title: "admin.inviteCodes.title", Page: InviteCodesPage },
  { path: "/admin/feedback", title: "admin.feedback.title", Page: FeedbackPage },
  { path: "/admin/metrics", title: "admin.metrics.title", Page: MetricsPage },
  { path: "/admin/corridors", title: "admin.corridors.title", Page: CorridorsPage },
  {
    path: "/admin/announcements",
    title: "admin.announcements.title",
    Page: AnnouncementsPage,
  },
  { path: "/admin/settings", title: "admin.settings.title", Page: SettingsPage },
  { path: "/admin/audit-log", title: "admin.auditLog.title", Page: AuditLogPage },
  { path: "/admin/passkeys", title: "admin.passkeys.title", Page: PasskeysPage },
];

/** The section that shows a path, or undefined. */
export function sectionFor(path: string): Section | undefined {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  if (clean === homePath) return sections[0];
  return sections.find(
    (section) =>
      section.path !== homePath && (clean === section.path || clean.startsWith(`${section.path}/`)),
  );
}
