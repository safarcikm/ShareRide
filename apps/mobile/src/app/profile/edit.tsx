import { router } from "expo-router";
import { useMe } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Screen } from "@/components/screen";
import { Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { ProfileForm } from "@/profile/profile-form";

/** Edit profile (spec 1, screen 6). */
export default function EditProfileScreen() {
  const { t } = useLanguage();
  const me = useMe();
  if (me === null) return null;
  return (
    <Screen>
      <BackButton fallback="/profile" />
      <Title>{t("profile.edit")}</Title>
      <ProfileForm
        me={me}
        onSaved={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/profile");
        }}
      />
    </Screen>
  );
}
