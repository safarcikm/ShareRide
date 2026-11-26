import type { TripDetails } from "@shareride/contracts";
import type { Translate } from "@shareride/i18n";
import {
  Baby,
  Cigarette,
  CigaretteOff,
  Luggage,
  MessageCircle,
  PawPrint,
  type LucideIcon,
} from "lucide-react-native";
import { people } from "@/theme/tokens";
import { childSeatNeedKey, needKeys } from "./texts";

// What the driver likes on a ride, shown on more than one screen.

/** What a driver likes on a ride, as a bubble: an icon on a people colour, and a few words. */
export interface PreferenceBubble {
  readonly icon: LucideIcon;
  readonly colour: string;
  readonly label: string;
}

/**
 * A ride's preferences as bubbles, in the order they show: chat, luggage,
 * pets, smoking and the child seat.
 */
export function preferenceNeeds(
  t: Translate,
  preferences: TripDetails["preferences"] | undefined,
): readonly PreferenceBubble[] {
  if (preferences === undefined) return [];
  return [
    { icon: MessageCircle, colour: people.glacier, label: t(needKeys.chat[preferences.chat]) },
    { icon: Luggage, colour: people.sun, label: t(needKeys.luggage[preferences.luggage]) },
    { icon: PawPrint, colour: people.lupine, label: t(needKeys.pets[preferences.pets]) },
    {
      icon: preferences.smoking === "no" ? CigaretteOff : Cigarette,
      colour: people.crowberry,
      label: t(needKeys.smoking[preferences.smoking]),
    },
    { icon: Baby, colour: people.mossLight, label: t(childSeatNeedKey(preferences.childSeat)) },
  ];
}
