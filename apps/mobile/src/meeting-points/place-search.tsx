import { placeSearchRoute, type PlaceSearchResult } from "@shareride/contracts";
import { minimumQueryLength } from "@shareride/domain";
import type { Translate } from "@shareride/i18n";
import type { CallResult } from "@shareride/api-client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { TextField } from "@/components/text-field";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useDebounced } from "@/lib/use-debounced";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { MeetingPointCard, PlaceCard } from "./result-cards";

/** How long typing pauses before the search runs. */
const typingPauseMs = 250;
/** The longest query the API takes. */
export const maximumQueryLength = 100;

interface Answer {
  readonly query: string;
  readonly result: CallResult<typeof placeSearchRoute>;
}

/** What is typed, and what the place search found for it. */
export interface PlaceQuery {
  readonly text: string;
  readonly setText: (value: string) => void;
  /** True until two characters are typed: nothing is searched yet. */
  readonly idle: boolean;
  readonly answer: Answer | null;
  readonly retry: () => void;
}

/**
 * Runs the place search of spec 2, 3.4 as you type, from the second
 * character, and reads out what it found.
 */
export function usePlaceQuery(): PlaceQuery {
  const { t } = useLanguage();
  const session = useSession();
  const [text, setTypedText] = useState("");
  const query = text.trim();
  const searched = useDebounced(query, typingPauseMs);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [attempt, setAttempt] = useState(0);
  const idle = query.length < minimumQueryLength;
  // What is typed now, so that a search for older text waits for the pause.
  const typed = useRef("");

  // Also when the text stops being too short: text cut short and typed
  // again before the pause leaves `searched` as it was, and its answer was
  // cleared.
  useEffect(() => {
    if (idle || searched.length < minimumQueryLength || searched !== typed.current) return;
    let current = true;
    void session.call(placeSearchRoute, { query: { q: searched } }).then((result) => {
      if (current) setAnswer({ query: searched, result });
    });
    return () => {
      current = false;
    };
  }, [searched, idle, session, attempt]);

  // What the search found, in words. It is shown above the results and read
  // out when it changes: through the live region of `PlaceResults` on
  // Android and the web, and by announcing it on iPhones, which have no
  // live regions.
  useEffect(() => {
    const status = answer === null ? null : statusText(t, answer);
    if (status !== null && Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(status);
    }
    // Once per answer, even when two answers read the same.
  }, [answer]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    text,
    setText: (value) => {
      typed.current = value.trim();
      setTypedText(value);
      // A new search starts empty, not with the results of the last one.
      if (value.trim().length < minimumQueryLength) setAnswer(null);
    },
    idle,
    answer,
    retry: () => {
      setAttempt((count) => count + 1);
    },
  };
}

/**
 * What the place search found: a loading sign, the failure with a retry,
 * or the count and the meeting points and places to choose from. `compact`
 * shows them as rows in a list rather than as cards.
 */
export function PlaceResults({
  search,
  onChoose,
  compact = false,
}: {
  readonly search: PlaceQuery;
  readonly onChoose: (result: PlaceSearchResult) => void;
  readonly compact?: boolean;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const { answer } = search;
  const statusStyle = [styles.status, compact && styles.compactStatus];
  // While a newer query is on its way, the last results stay in place. The
  // live region is there, empty, while the first answer loads: screen
  // readers read a region's changes, not one that appears already filled.
  if (answer === null) {
    return (
      <>
        <View testID="search-status" accessibilityLiveRegion="polite" />
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </>
    );
  }
  if (!answer.result.ok) {
    return (
      <>
        <Notice message={errorText(t, answer.result)} />
        <Button variant="secondary" label={t("common.retry")} onPress={search.retry} />
      </>
    );
  }
  const found = answer.result.data.results;
  const status = statusText(t, answer);
  return (
    <>
      <View testID="search-status" accessibilityLiveRegion="polite" style={statusStyle}>
        {found.length === 0 ? (
          <>
            <Body align={compact ? "start" : "center"}>{status}</Body>
            <Body align={compact ? "start" : "center"}>{t("search.noResultsHint")}</Body>
          </>
        ) : (
          <Text style={[typography.small, { color: palette.textMuted }]}>{status}</Text>
        )}
      </View>
      {found.map((result) =>
        result.kind === "meetingPoint" ? (
          <MeetingPointCard
            key={result.meetingPoint.id}
            point={result.meetingPoint}
            compact={compact}
            onPress={() => {
              onChoose(result);
            }}
          />
        ) : (
          <PlaceCard
            key={result.place.id}
            place={result.place}
            compact={compact}
            onPress={() => {
              onChoose(result);
            }}
          />
        ),
      )}
    </>
  );
}

/**
 * The place search on a page of its own (spec 2, 3.4): on the meeting
 * points screen and when adding a stop to a trip. Shows `whenIdle` until
 * two characters are typed, then meeting points and places as you type.
 * From and To use `PlaceDropdown` instead.
 */
export function PlaceSearch({
  onChoose,
  whenIdle,
}: {
  readonly onChoose: (result: PlaceSearchResult) => void;
  readonly whenIdle?: ReactNode;
}) {
  const { t } = useLanguage();
  const search = usePlaceQuery();
  return (
    <>
      <TextField
        label={t("search.label")}
        value={search.text}
        onChangeText={search.setText}
        maxLength={maximumQueryLength}
        autoCapitalize="words"
      />
      {search.idle ? whenIdle : <PlaceResults search={search} onChoose={onChoose} />}
    </>
  );
}

/** "3 places found", or "No places found for …"; null when the search failed. */
function statusText(t: Translate, answer: Answer): string | null {
  if (!answer.result.ok) return null;
  const count = answer.result.data.results.length;
  return count === 0
    ? t("search.noResults", { query: answer.query })
    : t("search.resultCount", { count });
}

const styles = StyleSheet.create({
  status: { gap: spacing.xs },
  // In line with the text of the rows under it.
  compactStatus: { paddingHorizontal: spacing.ms, paddingTop: spacing.xs },
});
