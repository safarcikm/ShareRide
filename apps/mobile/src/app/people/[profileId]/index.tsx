import { useLocalSearchParams } from "expo-router";
import { useMe } from "@/auth/session";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { useLanguage } from "@/i18n/language";
import { ProfileView } from "@/people/profile-view";

/**
 * A person's public profile (spec 1, 3.5; spec 8, screen 7), for members
 * signed in: with Report and Block, and Report review on each review, on
 * anyone's but my own (spec 9, 3.1.1 and 3.2.1). Its title is "Profile",
 * at the left with Back (spec 31, 3.19), also while it is read and when
 * the person is not there: the name is in the person's card.
 */
export default function PersonScreen() {
  const { t } = useLanguage();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const me = useMe();
  return (
    <Screen>
      <ScreenHead title={t("people.title")} back="/" />
      <ProfileView profileId={profileId} others={me !== null && me.profileId !== profileId} />
    </Screen>
  );
}
