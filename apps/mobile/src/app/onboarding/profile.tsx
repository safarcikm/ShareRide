import { useMe } from "@/auth/session";
import { Screen } from "@/components/screen";
import { Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { ProfileForm } from "@/profile/profile-form";

/** Create profile (spec 1, screen 5): the last step of signing up. */
export default function CreateProfileScreen() {
  const { t } = useLanguage();
  const me = useMe();
  if (me === null) return null;
  return (
    <Screen>
      <Title>{t("profile.createTitle")}</Title>
      {/* Saving completes the account; the app then opens the profile (_layout.tsx). */}
      <ProfileForm me={me} />
    </Screen>
  );
}
