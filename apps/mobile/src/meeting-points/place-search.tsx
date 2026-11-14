import { placeSearchRoute, type PlaceSearchResult } from "@shareride/contracts";
import { minimumQueryLength } from "@shareride/domain";
import type { Translate } from "@shareride/i18n";
import type { CallResult } from "@shareride/api-client";
import { useEffect, useState, type ReactNode } from "react";
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
const maximumLength = 100;

interface Answer {
  readonly query: string;
  readonly result: CallResult<typeof placeSearchRoute>;
}

/**
 * The one place search used wherever a place is chosen (spec 2, 3.4): here,
 * and later when searching and posting trips. Shows `whenIdle` until two
 * characters are typed, then meeting points and places as you type.
 */
export function PlaceSearch({
  onChoose,
  whenIdle,
}: {
  readonly onChoose: (result: PlaceSearchResult) => void;
  readonly whenIdle?: ReactNode;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const [text, setText] = useState("");
  const query = text.trim();
  const searched = useDebounced(query, typingPauseMs);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (searched.length < minimumQueryLength) return;
    let current = true;
    void session.call(placeSearchRoute, { query: { q: searched } }).then((result) => {
      if (current) setAnswer({ query: searched, result });
    });
    return () => {
      current = false;
    };
  }, [searched, session, attempt]);

  // What the search found, in words. It is shown above the results and read
  // out when it changes: through the live region below on Android and the
  // web, and by announcing it on iPhones, which have no live regions.
  const status = answer === null ? null : statusText(t, answer);
  useEffect(() => {
    if (status !== null && Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(status);
    }
    // Once per answer, even when two answers read the same.
  }, [answer]); // eslint-disable-line react-hooks/exhaustive-deps

  // While a newer query is on its way, the last results stay in place.
  let results: ReactNode;
  if (query.length < minimumQueryLength) {
    results = whenIdle;
  } else if (answer === null) {
    results = (
      <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
    );
  } else if (!answer.result.ok) {
    results = (
      <>
        <Notice message={errorText(t, answer.result)} />
        <Button
          variant="secondary"
          label={t("common.retry")}
          onPress={() => {
            setAttempt((count) => count + 1);
          }}
        />
      </>
    );
  } else {
    const found = answer.result.data.results;
    results = (
      <>
        <View testID="search-status" accessibilityLiveRegion="polite" style={styles.status}>
          {found.length === 0 ? (
            <>
              <Body>{status}</Body>
              <Body>{t("search.noResultsHint")}</Body>
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
              onPress={() => {
                onChoose(result);
              }}
            />
          ) : (
            <PlaceCard
              key={result.place.id}
              place={result.place}
              onPress={() => {
                onChoose(result);
              }}
            />
          ),
        )}
      </>
    );
  }

  return (
    <>
      <TextField
        label={t("search.label")}
        value={text}
        onChangeText={(value) => {
          setText(value);
          // A new search starts empty, not with the results of the last one.
          if (value.trim().length < minimumQueryLength) setAnswer(null);
        }}
        maxLength={maximumLength}
        autoCapitalize="words"
      />
      {results}
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

const styles = StyleSheet.create({ status: { gap: spacing.xs } });
