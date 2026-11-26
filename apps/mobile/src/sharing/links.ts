/**
 * PuffinRide's own Facebook Page (spec 28, 3.6): one place to change when
 * the Page gets its short name.
 */
export const puffinRideFacebookPage = "https://www.facebook.com/profile.php?id=61597055066444";

/** PuffinRide on Instagram, @puffinride.is (spec 30, 3.1). */
export const puffinRideInstagram = "https://www.instagram.com/puffinride.is/";

/**
 * Facebook's share window for a link (spec 28, 3.3): the person picks their
 * wall, a group, a friend or Messenger there, and writes the post. Nothing
 * else goes to Facebook, and no Facebook script is loaded.
 */
export function facebookShareAddress(link: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;
}
