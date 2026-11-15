import type { MessageKey } from "@shareride/i18n";
import { CarFront, CircleUserRound, Search, Ticket, type LucideIcon } from "lucide-react-native";

export type MenuTabName = "index" | "my-rides" | "offer" | "profile";

export interface MenuTab {
  /** The route's name in the `(tabs)` group. */
  readonly name: MenuTabName;
  readonly href: "/" | "/my-rides" | "/offer" | "/profile";
  readonly label: MessageKey;
  readonly icon: LucideIcon;
}

/**
 * The four places of the menu, always in this order (spec 16, 3.1). A
 * place added later, such as Messages, is one more entry here and one more
 * screen in `app/(tabs)`.
 */
export const menuTabs: readonly MenuTab[] = [
  { name: "index", href: "/", label: "nav.find", icon: Search },
  { name: "my-rides", href: "/my-rides", label: "nav.myRides", icon: Ticket },
  { name: "offer", href: "/offer", label: "nav.offer", icon: CarFront },
  { name: "profile", href: "/profile", label: "nav.profile", icon: CircleUserRound },
];

/** Screens opened on top, by the place of the menu they belong to. */
const belongsTo: readonly [prefix: string, tab: MenuTabName][] = [
  ["/my-rides", "my-rides"],
  ["/bookings", "my-rides"],
  ["/offer", "offer"],
  ["/drive", "offer"],
  ["/profile", "profile"],
  ["/settings", "profile"],
  ["/search", "index"],
  ["/rides", "index"],
  ["/trips", "index"],
];

/**
 * The place of the menu a screen belongs to, for the top bar on wide
 * screens: a trip found on Find shows Find chosen. Null for screens of no
 * place, such as signing in.
 */
export function menuTabOf(pathname: string): MenuTabName | null {
  if (pathname === "/") return "index";
  const found = belongsTo.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return found?.[1] ?? null;
}
