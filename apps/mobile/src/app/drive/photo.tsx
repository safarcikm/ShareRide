import { useMe } from "@/auth/session";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { backTo } from "@/driving/back-to";
import { useLanguage } from "@/i18n/language";
import { PersonCard } from "@/people/person-card";
import { myCardOf } from "@/profile/my-card";
import { PhotoControls } from "@/profile/photo-controls";

/**
 * A profile photo before publishing (spec 1, 3.5; spec 16, 3.6, item 5),
 * opened from step 5 of posting a trip. Once a photo is added it goes back
 * there, which loads again. The title is at the left, with why under it,
 * and who the photo is of stands in the person's card, as on Profile
 * (spec 31, 3.19), over the photo's controls.
 */
export default function DriverPhotoScreen() {
  const { locale, t } = useLanguage();
  const me = useMe();
  if (me === null) return null;
  return (
    <Screen>
      <ScreenHead title={t("driver.photo.title")} line={t("driver.photo.intro")} back="/profile" />
      <PersonCard {...myCardOf(me, t, locale)} />
      <PhotoControls
        me={me}
        prominent
        align="start"
        onAdded={() => {
          backTo("/profile");
        }}
      />
    </Screen>
  );
}
