import { socialProfiles } from "@shareride/i18n";

/** PuffinRide's own Facebook Page (spec 28, 3.6), as the server names it to Google too. */
export const puffinRideFacebookPage = socialProfiles.facebook;

/** PuffinRide on Instagram, @puffinride.is (spec 30, 3.1). */
export const puffinRideInstagram = socialProfiles.instagram;

/**
 * Facebook's share window for a link (spec 28, 3.3): the person picks their
 * wall, a group, a friend or Messenger there, and writes the post. Nothing
 * else goes to Facebook, and no Facebook script is loaded.
 */
export function facebookShareAddress(link: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;
}
