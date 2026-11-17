import { myBlocksRoute, unblockRoute, type BlockedPerson } from "@shareride/contracts";
import { formatDate } from "@shareride/i18n";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useMe, useSession } from "@/auth/session";
import { Avatar } from "@/components/avatar";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { BackToMenu } from "@/navigation/back-to-menu";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * Blocked people (spec 9, 3.2, item 4), in Settings: whom I blocked and
 * since when, the latest first, each with Unblock. Only I see this list.
 */
export default function BlockedScreen() {
  const me = useMe();
  if (me === null) return <BackToMenu />;
  return <Blocked />;
}

function Blocked() {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const load = useCallback(() => session.call(myBlocksRoute, {}), [session]);
  const { value: answer, reload } = useLoaded(load);
  // Unblocked here: gone from the list without loading it again.
  const [unblocked, setUnblocked] = useState<readonly string[]>([]);
  // Counted, so each outcome takes focus anew: the button pressed may be gone.
  const [outcome, setOutcome] = useState<{
    text: string;
    failed: boolean;
    count: number;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function unblock(person: BlockedPerson) {
    setBusy(person.id);
    const result = await session.call(unblockRoute, { params: { id: person.id } });
    setBusy(null);
    if (result.ok) setUnblocked((done) => [...done, person.id]);
    setOutcome((last) => ({
      text: t(result.ok ? "blocks.unblocked" : "blocks.unblockFailed", {
        name: person.firstName,
      }),
      failed: !result.ok,
      count: (last?.count ?? 0) + 1,
    }));
  }

  const header = (
    <>
      <BackButton fallback="/settings" />
      <Title>{t("blocks.title")}</Title>
      <Body>{t("blocks.help")}</Body>
    </>
  );
  if (answer === undefined) {
    return (
      <Screen>
        {header}
        <ActivityIndicator accessibilityLabel={t("common.loading")} color={palette.primary} />
      </Screen>
    );
  }
  if (!answer.ok) {
    return (
      <Screen>
        {header}
        <Notice message={t("blocks.failed")} />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </Screen>
    );
  }
  const people = answer.data.blocked.filter((person) => !unblocked.includes(person.id));
  return (
    <Screen>
      {header}
      {outcome === null ? null : (
        <TakesFocus key={outcome.count}>
          <Notice
            kind={outcome.failed ? "error" : "info"}
            urgent={outcome.failed}
            message={outcome.text}
          />
        </TakesFocus>
      )}
      {people.length === 0 ? (
        <Body>{t("blocks.none")}</Body>
      ) : (
        <Card>
          {people.map((person) => (
            <View key={person.id} style={styles.person}>
              <Avatar firstName={person.firstName} colour={person.colour} />
              <View style={styles.name}>
                <Text style={[typography.bodyStrong, { color: palette.text }]}>
                  {person.firstName}
                </Text>
                <Text style={[typography.small, { color: palette.textMuted }]}>
                  {t("blocks.since", {
                    // With the year: a block lasts until lifted (Iceland keeps UTC).
                    date: formatDate(person.blockedAt.slice(0, 10), locale),
                  })}
                </Text>
              </View>
              <Button
                variant="secondary"
                label={t("blocks.unblock")}
                accessibilityLabel={t("blocks.unblockLabel", { name: person.firstName })}
                busy={busy === person.id}
                disabled={busy !== null}
                onPress={() => void unblock(person)}
              />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { flex: 1, gap: spacing.xs },
});
