import { leavesCapitalArea, type Region } from "@shareride/domain";
import { CloudSun } from "lucide-react-native";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { Notice } from "@/components/notice";
import { Row } from "@/components/row";
import { Body } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { spacing } from "@/theme/tokens";
import { beforeYouGoLinks } from "./trip-safety";

/** Whether a ride between stops in these regions has a "Weather and roads" row. */
export const showsWeatherAndRoads = leavesCapitalArea;

/**
 * "Weather and roads" as a row of a ride's rows (spec 31, 3.7, item 6;
 * spec 9, 3.3.2): on a ride that leaves the capital area it unfolds
 * "Before you go" and the pages to check, which open outside the app.
 * Nothing on a ride within the capital area.
 */
export function WeatherAndRoadsRow({
  regions,
}: {
  /** The regions of the stops the viewer travels between. */
  readonly regions: readonly Region[];
}) {
  const { locale, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!showsWeatherAndRoads(regions)) return null;
  return (
    <Row
      icon={CloudSun}
      title={t("safety.weatherAndRoads")}
      expanded={open}
      onToggle={() => {
        setOpen((was) => !was);
      }}
    >
      <View style={styles.under}>
        <Body align="start">{t("safety.beforeYouGo")}</Body>
        {beforeYouGoLinks.map((link) => (
          <TextLink
            key={link.label}
            align="start"
            label={t(link.label)}
            onPress={() => {
              setFailed(false);
              Linking.openURL(link.url[locale]).catch(() => {
                setFailed(true);
              });
            }}
          />
        ))}
        <Notice message={failed ? t("safety.linkFailed") : null} />
      </View>
    </Row>
  );
}

const styles = StyleSheet.create({ under: { gap: spacing.sm, alignItems: "flex-start" } });
