import { useMe } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { ProfileView } from "@/people/profile-view";

/**
 * See it as others do (spec 16, 3.4 item 1): my public profile as the API
 * gives it to others (spec 1, 3.5), with my rating, reliability figure and
 * reviews, never the phone number.
 */
export default function ProfilePreviewScreen() {
  const { t } = useLanguage();
  const me = useMe();
  if (me === null) return null;
  return (
    <Screen>
      <BackButton fallback="/profile" />
      <Title>{t("preview.title")}</Title>
      <Body>{t("preview.intro")}</Body>
      <ProfileView profileId={me.profileId} />
    </Screen>
  );
}
