import { withdrawRequestRoute, type Booking } from "@shareride/contracts";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { TakesFocus } from "@/components/takes-focus";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { firstNameOf } from "@/people/texts";
import { spacing } from "@/theme/tokens";

export interface Withdrawing {
  /** The question is open: withdraw, or keep the request. */
  readonly asking: boolean;
  /** The request was kept after asking, so focus goes back to what opened the question. */
  readonly kept: boolean;
  /** Withdrawing is on its way. */
  readonly busy: boolean;
  /** Why the last try did not withdraw it, if it did not. */
  readonly notice: string | null;
  readonly ask: () => void;
  readonly keep: () => void;
  readonly withdraw: () => Promise<void>;
}

/**
 * Withdrawing a request that waits for the driver (spec 5, 3.4; R5.8): at
 * any time, after a second press to make sure. Its state lives with the
 * page, so the question stays open when the window crosses the breakpoint
 * and the question moves from the bar to the side column. `onWithdrawn`
 * hears the booking as withdrawing left it; `onStale` why it could not be
 * withdrawn any more, such as the driver answering first.
 */
export function useWithdraw({
  booking,
  onStart,
  onWithdrawn,
  onStale,
}: {
  readonly booking: Booking;
  readonly onStart: () => void;
  readonly onWithdrawn: (booking: Booking) => void;
  readonly onStale: (why: string) => void;
}): Withdrawing {
  const { t } = useLanguage();
  const session = useSession();
  const [asking, setAsking] = useState(false);
  const [kept, setKept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  return {
    asking,
    kept,
    busy,
    notice,
    ask: () => {
      setNotice(null);
      setAsking(true);
    },
    keep: () => {
      setNotice(null);
      setAsking(false);
      setKept(true);
    },
    withdraw: async () => {
      setNotice(null);
      onStart();
      setBusy(true);
      const answer = await session.call(withdrawRequestRoute, {
        params: { id: booking.id },
        body: {},
      });
      setBusy(false);
      if (answer.ok) {
        setAsking(false);
        onWithdrawn(answer.data);
        return;
      }
      if (answer.error.code === "booking_not_requested" || answer.error.code === "not_found") {
        // The driver answered, or the deadline passed, meanwhile.
        setAsking(false);
        onStale(t("booking.notRequested"));
        return;
      }
      // A lost connection leaves the question open, to try again.
      setNotice(errorText(t, answer));
    },
  };
}

/**
 * The question itself, where the page has its main button: "Withdraw your
 * request to Anna for 1 seat?", with the button that does it and the one
 * that keeps the request. It takes focus as it opens.
 */
export function WithdrawQuestion({
  booking,
  withdrawing,
}: {
  readonly booking: Booking;
  readonly withdrawing: Withdrawing;
}) {
  const { t } = useLanguage();
  const driver = firstNameOf(t, booking.driver);
  return (
    <TakesFocus>
      <View testID="withdraw-question" style={styles.question}>
        <Body align="start">{t("booking.withdrawAsk", { driver, seats: booking.seats })}</Body>
        {withdrawing.notice === null ? null : (
          <TakesFocus key={withdrawing.notice}>
            <Notice message={withdrawing.notice} />
          </TakesFocus>
        )}
        <Button
          main
          busy={withdrawing.busy}
          label={t("booking.withdraw")}
          onPress={() => {
            void withdrawing.withdraw();
          }}
        />
        <Button
          variant="secondary"
          fill
          disabled={withdrawing.busy}
          label={t("booking.withdrawKeep")}
          onPress={withdrawing.keep}
        />
      </View>
    </TakesFocus>
  );
}

const styles = StyleSheet.create({ question: { gap: spacing.sm } });
