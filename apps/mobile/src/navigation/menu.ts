import type { MessageKey } from "@shareride/i18n";
import {
  CarFront,
  CircleUserRound,
  MessageCircle,
  Search,
  Ticket,
  type LucideIcon,
} from "lucide-react-native";

import { stepNames } from "@/trips/steps";

export type MenuTabName = "index" | "my-rides" | "offer" | "messages" | "profile";

export interface MenuTab {
  /** The route's name in the `(tabs)` group. */
  readonly name: MenuTabName;
  readonly href: "/" | "/my-rides" | "/offer" | "/messages" | "/profile";
  readonly label: MessageKey;
  readonly icon: LucideIcon;
}

/**
 * The places of the menu, always in this order: spec 16's four (3.1) and
 * Messages (spec 7, 3.1, item 9; milestone 5 plan, decision 1) before
 * Profile. A place added later is one more entry here and one more screen
 * in `app/(tabs)`.
 */
export const menuTabs: readonly MenuTab[] = [
  { name: "index", href: "/", label: "nav.find", icon: Search },
  { name: "my-rides", href: "/my-rides", label: "nav.myRides", icon: Ticket },
  { name: "offer", href: "/offer", label: "nav.offer", icon: CarFront },
  { name: "messages", href: "/messages", label: "nav.messages", icon: MessageCircle },
  { name: "profile", href: "/profile", label: "nav.profile", icon: CircleUserRound },
];

/** Screens opened on top, by the place of the menu they belong to. */
const belongsTo: readonly [prefix: string, tab: MenuTabName][] = [
  ["/my-rides", "my-rides"],
  ["/bookings", "my-rides"],
  ["/offer", "offer"],
  ["/drive", "offer"],
  ["/messages", "messages"],
  ["/profile", "profile"],
  ["/settings", "profile"],
  ["/search", "index"],
  ["/rides", "index"],
  ["/trips", "index"],
];

/**
 * The steps of posting a ride and the screen that ends them, which are
 * Offer's whatever ride they are about.
 */
const postingSteps = new Set<string>([...stepNames, "published"]);

/**
 * Whether the screen is a ride I drive or one it opens (editing,
 * cancelling, messages to all, sharing). My rides lists that ride, so it
 * is chosen there, as on a seat I booked (spec 31, 3.22).
 */
function onARideIDrive(pathname: string): boolean {
  const [, drive, trips, id, screen = ""] = pathname.split("/");
  if (drive !== "drive" || trips !== "trips") return false;
  return id !== undefined && id !== "" && id !== "new" && !postingSteps.has(screen);
}

/**
 * The place of the menu a screen belongs to, for the top bar on wide
 * screens: a trip found on Find shows Find chosen. Null for screens of no
 * place, such as signing in.
 */
export function menuTabOf(pathname: string): MenuTabName | null {
  if (pathname === "/") return "index";
  if (onARideIDrive(pathname)) return "my-rides";
  const found = belongsTo.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return found?.[1] ?? null;
}
