import { Redirect } from "expo-router";

/**
 * My trips is gone (spec 31, 3.10, item 4): the rides I drive are on My
 * rides with the seats I booked, and my drafts on Offer. Its address
 * leads to My rides, for links and bookmarks made before.
 */
export default function MyTripsScreen() {
  return <Redirect href="/my-rides" />;
}
