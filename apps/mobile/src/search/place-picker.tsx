import type { PlaceSearchResult } from "@shareride/contracts";
import { X } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { IconButton } from "@/components/icon-button";
import { Screen } from "@/components/screen";
import { Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { PlaceSearch } from "@/meeting-points/place-search";
import type { SearchEnd } from "./recent-searches";

/** What a search covers for a place search result: the meeting point, or the whole place. */
export function searchEndOf(result: PlaceSearchResult): SearchEnd {
  return result.kind === "meetingPoint"
    ? { id: result.meetingPoint.id, name: result.meetingPoint.name }
    : { id: result.place.id, name: result.place.name };
}

/**
 * Choosing where a passenger leaves from or goes to (spec 4, 3.1): the place
 * search of spec 2. A meeting point also covers the points near it, and a
 * town covers its own (spec 4, 3.2), so either is chosen at once.
 */
export function SearchPlacePicker({
  title,
  onChoose,
  onCancel,
}: {
  readonly title: string;
  readonly onChoose: (end: SearchEnd) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon={X} label={t("common.cancel")} onPress={onCancel} />
      </View>
      <Title>{title}</Title>
      <PlaceSearch
        onChoose={(result) => {
          onChoose(searchEndOf(result));
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ header: { flexDirection: "row" } });
