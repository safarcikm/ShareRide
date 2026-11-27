import { router } from "expo-router";
import { useMe } from "@/auth/session";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { useLanguage } from "@/i18n/language";
import { PersonCard } from "@/people/person-card";
import { myCardOf } from "@/profile/my-card";
import { PhotoControls } from "@/profile/photo-controls";
import { ProfileForm } from "@/profile/profile-form";

/**
 * Edit profile (spec 1, screen 6): the title at the left, who I am now in
 * the person's card with the photo's controls, as on Profile, and the form
 * under it (spec 31, 3.19). The card says what is saved: it changes with
 * the photo at once, and with the form once that is saved.
 */
export default function EditProfileScreen() {
  const { locale, t } = useLanguage();
  const me = useMe();
  if (me === null) return null;
  return (
    <Screen>
      <ScreenHead title={t("profile.edit")} back="/profile" />
      <PersonCard {...myCardOf(me, t, locale)}>
        <PhotoControls me={me} />
      </PersonCard>
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
