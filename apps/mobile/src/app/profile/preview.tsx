import { useMe } from "@/auth/session";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { useLanguage } from "@/i18n/language";
import { ProfileView } from "@/people/profile-view";

/**
 * See it as others do (spec 16, 3.4 item 1): my public profile as the API
 * gives it to others (spec 1, 3.5), with my rating, reliability figure and
 * reviews, never the phone number. The title, with what this is under it,
 * is at the left (spec 31, 3.19).
 */
export default function ProfilePreviewScreen() {
  const { t } = useLanguage();
  const me = useMe();
  if (me === null) return null;
  return (
    <Screen>
      <ScreenHead title={t("preview.title")} line={t("preview.intro")} back="/profile" />
      <ProfileView profileId={me.profileId} />
    </Screen>
  );
}
