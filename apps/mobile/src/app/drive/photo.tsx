import { peopleColourOf } from "@shareride/domain";
import { StyleSheet, View } from "react-native";
import { useMe } from "@/auth/session";
import { Avatar } from "@/components/avatar";
import { BackButton } from "@/components/back-button";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { backTo } from "@/driving/back-to";
import { useLanguage } from "@/i18n/language";
import { PhotoControls } from "@/profile/photo-controls";
import { spacing } from "@/theme/tokens";

/**
 * A profile photo before publishing (spec 1, 3.5; spec 16, 3.6, item 5),
 * opened from step 5 of posting a trip. Once a photo is added it goes back
 * there, which loads again.
 */
export default function DriverPhotoScreen() {
  const { t } = useLanguage();
  const me = useMe();
  if (me === null) return null;
  return (
    <Screen>
      <BackButton fallback="/profile" />
      <Title>{t("driver.photo.title")}</Title>
      <Body>{t("driver.photo.intro")}</Body>
      <View style={styles.avatar}>
        <Avatar
          firstName={me.firstName ?? ""}
          colour={peopleColourOf(me.id)}
          photo={me.photo?.url ?? null}
        />
      </View>
      <PhotoControls
        me={me}
        prominent
        onAdded={() => {
          backTo("/profile");
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", paddingVertical: spacing.sm },
});
