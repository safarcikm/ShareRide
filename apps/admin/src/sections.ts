import type { MessageKey } from "@shareride/i18n";
import type { ComponentType } from "react";
import { AuditLogPage } from "./pages/audit-log.tsx";
import { HomePage } from "./pages/home.tsx";
import { PasskeysPage } from "./pages/passkeys.tsx";

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
