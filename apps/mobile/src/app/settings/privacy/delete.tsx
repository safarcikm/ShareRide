import type { CallFailure } from "@shareride/api-client";
import {
  deleteAccountRoute,
  deletionCheckRoute,
  type DeletionCheck,
  type OpenItem,
} from "@shareride/contracts";
import { formatClock, formatDay, formatDayAndMonth } from "@shareride/i18n";
import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Loading } from "@/components/loading";
import { Notice } from "@/components/notice";
import { Row } from "@/components/row";
import { Screen } from "@/components/screen";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { BackToMenu } from "@/navigation/back-to-menu";
import { openPlace } from "@/navigation/open-place";
import { ConfirmWithCode } from "@/privacy/confirm-with-code";
import { spacing } from "@/theme/tokens";

type Check = { readonly ok: true; readonly data: DeletionCheck } | CallFailure;

/**
 * Delete my account (spec 11, 3.4; plan 4.5 and 4.9): what is still open,
 * each opened where it is cancelled under the normal rules (spec 6), and
 * looked at again on coming back; what happens; then, once nothing is open,
 * deleting with a fresh code. Every session ends, this one too, and the
 * screen says when the data goes.
 */
export default function DeleteScreen() {
  const me = useMe();
  // When the data goes, once deleted: shown after this device is signed out.
  const [deleteAfter, setDeleteAfter] = useState<string | null>(null);
  // While deleting, another call may find every session ended before the
  // answer comes: the screen stays for it rather than closing.
  const [deleting, setDeleting] = useState(false);
  if (deleteAfter !== null) return <Deleted deleteAfter={deleteAfter} />;
  if (me === null && !deleting) return <BackToMenu />;
  return <DeleteMyAccount onDeleting={setDeleting} onDeleted={setDeleteAfter} />;
}

function DeleteMyAccount({
  onDeleting,
  onDeleted,
}: {
  readonly onDeleting: (deleting: boolean) => void;
  readonly onDeleted: (deleteAfter: string) => void;
}) {
  const { t } = useLanguage();
  const session = useSession();
  const [check, setCheck] = useState<Check>();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When a code was last sent, so opening the form again inside the wait
  // uses that code rather than asking for another.
  const [codeWait, setCodeWait] = useState(0);

  const look = useCallback(async () => {
    const result = await session.call(deletionCheckRoute, {});
    setCheck(result.ok ? { ok: true, data: result.data } : result);
  }, [session]);

  // Again each time the screen shows: something may have been cancelled.
  useFocusEffect(
    useCallback(() => {
      void look();
    }, [look]),
  );

  async function remove(code: string) {
    onDeleting(true);
    const result = await session.call(deleteAccountRoute, { body: { code } });
    if (result.ok) {
      onDeleted(result.data.deleteAfter);
      // Every session has ended on the API's side; this device forgets its own.
      await session.ended();
      return { ok: true } as const;
    }
    onDeleting(false);
    if (result.error.code === "deletion_blocked") {
      // Something opened meanwhile: say so and show what.
      setConfirming(false);
      setError(errorText(t, result));
      await look();
      return { ok: true } as const;
    }
    return result;
  }

  return (
    <Screen>
      <BackButton fallback="/settings/privacy" />
      <Title>{t("privacy.delete")}</Title>
      <Body align="start">{t("privacy.deleteExplain")}</Body>
      {check === undefined ? (
        <Loading />
      ) : !check.ok ? (
        <View style={styles.group}>
          <Notice message={errorText(t, check)} />
          <Button
            variant="secondary"
            label={t("common.retry")}
            onPress={() => {
              setCheck(undefined);
              void look();
            }}
          />
        </View>
      ) : (
        <View style={styles.group}>
          <Notice message={error} />
          {check.data.allowed ? (
            confirming ? (
              <ConfirmWithCode
                confirmLabel={t("privacy.deleteConfirm")}
                sentUntil={codeWait}
                onSent={setCodeWait}
                onConfirm={remove}
                onCancel={() => {
                  setConfirming(false);
                }}
              />
            ) : (
              <>
                <Body align="start">{t("privacy.delete.wait")}</Body>
                <Button
                  label={t("privacy.deleteConfirm")}
                  onPress={() => {
                    setError(null);
                    setConfirming(true);
                  }}
                />
              </>
            )
          ) : (
            <Open check={check.data} />
          )}
        </View>
      )}
    </Screen>
  );
}

/** What is still open: what can be cancelled from here, then what must be settled first. */
function Open({ check }: { readonly check: DeletionCheck }) {
  const { t } = useLanguage();
  return (
    <>
      <Body align="start">{t("privacy.deleteOpen")}</Body>
      {check.canCancel.length > 0 ? (
        <Card>
          {check.canCancel.map((item) => (
            <Cancellable key={`${item.kind}-${"id" in item ? item.id : item.tripId}`} item={item} />
          ))}
        </Card>
      ) : null}
      {check.mustSettle.map((item) => (
        <Settle key={`${item.kind}-${"id" in item ? item.id : item.tripId}`} item={item} />
      ))}
    </>
  );
}

/**
 * A trip, booking or request the person can end under the normal rules:
 * a trip or booking on its cancel screen, a request on its own page, where
 * it is withdrawn.
 */
function Cancellable({ item }: { readonly item: OpenItem }) {
  const { locale, t } = useLanguage();
  const when = (iso: string) => {
    const at = new Date(iso);
    return t("privacy.when", { date: formatDay(at, locale), time: formatClock(at) });
  };
  let action: string;
  let href: Href;
  switch (item.kind) {
    case "trip":
      action = t("privacy.delete.trip", { when: when(item.departsAt) });
      href = { pathname: "/drive/trips/[id]/cancel", params: { id: item.id } };
      break;
    case "booking":
      action = t("privacy.delete.booking", { when: when(item.boardsAt) });
      href = { pathname: "/bookings/[id]/cancel", params: { id: item.id } };
      break;
    case "request":
      action = t("privacy.delete.request", { when: when(item.boardsAt) });
      href = { pathname: "/bookings/[id]", params: { id: item.id } };
      break;
    default:
      return null;
  }
  return (
    <Row
      title={t("privacy.delete.route", {
        from: item.places.from[locale],
        to: item.places.to[locale],
      })}
      value={action}
      onPress={() => {
        router.push(href);
      }}
    />
  );
}

/** Something settled elsewhere first, which deleting waits for. */
function Settle({ item }: { readonly item: OpenItem }) {
  const { locale, t } = useLanguage();
  switch (item.kind) {
    case "trip_under_way": {
      const at = new Date(item.completesAt);
      return (
        <Notice
          kind="info"
          urgent={false}
          message={t("privacy.delete.underWay", {
            from: item.places.from[locale],
            to: item.places.to[locale],
            when: t("privacy.when", { date: formatDay(at, locale), time: formatClock(at) }),
          })}
        />
      );
    }
    case "dispute":
      return <Notice kind="info" urgent={false} message={t("privacy.delete.dispute")} />;
    case "held_payout":
      return <Notice kind="info" urgent={false} message={t("privacy.delete.heldPayout")} />;
    default:
      return null;
  }
}

/** Deleted: signed out everywhere, and when the data goes. */
function Deleted({ deleteAfter }: { readonly deleteAfter: string }) {
  const { locale, t } = useLanguage();
  return (
    <Screen>
      <Title>
        {t("privacy.deletionScheduled", {
          date: formatDayAndMonth(new Date(deleteAfter), locale),
        })}
      </Title>
      <Body>{t("privacy.delete.signedOut")}</Body>
      <View style={styles.group}>
        <Button
          label={t("common.close")}
          onPress={() => {
            openPlace("/");
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ group: { gap: spacing.md, marginTop: spacing.md } });
