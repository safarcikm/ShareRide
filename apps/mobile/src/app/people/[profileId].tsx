import { useLocalSearchParams } from "expo-router";
import { BackButton } from "@/components/back-button";
import { Screen } from "@/components/screen";
import { ProfileView } from "@/people/profile-view";

/** A person's public profile (spec 1, 3.5; spec 8, screen 7), for members signed in. */
export default function PersonScreen() {
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  return (
    <Screen>
      <BackButton fallback="/" />
      <ProfileView profileId={profileId} />
    </Screen>
  );
}
