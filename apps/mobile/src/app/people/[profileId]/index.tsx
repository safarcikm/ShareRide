import { useLocalSearchParams } from "expo-router";
import { useMe } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Screen } from "@/components/screen";
import { ProfileView } from "@/people/profile-view";

/**
 * A person's public profile (spec 1, 3.5; spec 8, screen 7), for members
 * signed in: with Report and Block, and Report review on each review, on
 * anyone's but my own (spec 9, 3.1.1 and 3.2.1).
 */
export default function PersonScreen() {
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const me = useMe();
  return (
    <Screen>
      <BackButton fallback="/" />
      <ProfileView profileId={profileId} others={me !== null && me.profileId !== profileId} />
    </Screen>
  );
}
