import type { CallFailure } from "@shareride/api-client";
import {
  startPaymentRoute,
  testPaymentRoute,
  type Booking,
  type Payment,
} from "@shareride/contracts";
import { formatMoney } from "@shareride/i18n";
import { useRef, useState } from "react";
import { Text } from "react-native";
import { errorText } from "@/auth/errors";
import { useSession } from "@/auth/session";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { TakesFocus } from "@/components/takes-focus";
import { Body } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

// Paying for a booking (spec 5, 3.5; rule M1), on Check and pay and on the
// booking page. Until the real provider comes (spec 13), paying opens the
// test sheet, where the person picks what the payment does and no money
// moves.

type Paying =
  | { readonly stage: "idle" }
  | { readonly stage: "starting" }
  | { readonly stage: "sheet"; readonly payment: Payment }
  | { readonly stage: "settling"; readonly payment: Payment };

export interface PaymentState {
  /** Starting a payment is on its way. */
  readonly starting: boolean;
  /** The payment the sheet is open for, if it is. */
  readonly sheet: Payment | null;
  /** The sheet's answer is on its way. */
  readonly settling: boolean;
  /** Why the last try did not pay, if it did not. */
  readonly notice: string | null;
  /** Starts paying for the booking, or picks up the payment already started. */
  readonly start: (bookingId: string) => Promise<void>;
  /** The test sheet's answer: the payment goes through or fails. */
  readonly settle: (outcome: "succeeded" | "failed") => Promise<void>;
  readonly clearNotice: () => void;
}

/**
 * The steps of paying. `onSettled` hears the booking as the payment left
 * it: confirmed, or still accepted after a failed payment, with the notice
 * set. `onStale` hears why the booking can no longer be paid here, such as
 * the time to pay running out meanwhile.
 */
export function usePayment({
  onSettled,
  onStale,
}: {
  readonly onSettled: (booking: Booking) => void;
  readonly onStale: (why: string) => void;
}): PaymentState {
  const { t } = useLanguage();
  const session = useSession();
  const [paying, setPaying] = useState<Paying>({ stage: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  // Set at once on a press, before the button shows busy, so a double tap
  // makes one call.
  const callingNow = useRef(false);

  const failed = (failure: CallFailure) => {
    switch (failure.error.code) {
      case "booking_not_payable":
      case "payment_settled":
      case "not_found":
        onStale(t("booking.paymentClosed"));
        return;
      case "payments_unavailable":
        setNotice(t("booking.paymentsUnavailable"));
        return;
      default:
        setNotice(errorText(t, failure));
    }
  };

  const start = async (bookingId: string) => {
    if (callingNow.current) return;
    callingNow.current = true;
    setNotice(null);
    setPaying({ stage: "starting" });
    const answer = await session.call(startPaymentRoute, {
      params: { id: bookingId },
      body: {},
    });
    callingNow.current = false;
    if (answer.ok) {
      setPaying({ stage: "sheet", payment: answer.data });
      return;
    }
    setPaying({ stage: "idle" });
    failed(answer);
  };

  const settle = async (outcome: "succeeded" | "failed") => {
    if (callingNow.current || paying.stage !== "sheet") return;
    callingNow.current = true;
    const { payment } = paying;
    setNotice(null);
    setPaying({ stage: "settling", payment });
    const answer = await session.call(testPaymentRoute, {
      params: { id: payment.paymentId },
      body: { outcome },
    });
    callingNow.current = false;
    if (!answer.ok) {
      // A failed call leaves the payment as it was: the sheet stays.
      setPaying(
        answer.error.code === "network_error" ? { stage: "sheet", payment } : { stage: "idle" },
      );
      failed(answer);
      return;
    }
    setPaying({ stage: "idle" });
    if (answer.data.status === "accepted") setNotice(t("booking.paymentFailed"));
    onSettled(answer.data);
  };

  return {
    starting: paying.stage === "starting",
    sheet: paying.stage === "sheet" || paying.stage === "settling" ? paying.payment : null,
    settling: paying.stage === "settling",
    notice,
    start,
    settle,
    clearNotice: () => {
      setNotice(null);
    },
  };
}

/** The test provider's sheet, which takes focus as it opens in place of Pay. */
export function PaymentSheet({ payment }: { readonly payment: PaymentState }) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const { sheet, settling, settle } = payment;
  if (sheet === null) return null;
  return (
    <Card>
      <TakesFocus>
        <Text accessibilityRole="header" style={[typography.heading, { color: palette.text }]}>
          {t("booking.testPayment.title")}
        </Text>
      </TakesFocus>
      <Body align="start">{t("booking.testPayment.body")}</Body>
      <Button
        main
        busy={settling}
        label={t("booking.pay", { total: formatMoney(sheet.amount, locale) })}
        onPress={() => {
          void settle("succeeded");
        }}
      />
      <Button
        variant="secondary"
        disabled={settling}
        label={t("booking.testPayment.fail")}
        onPress={() => {
          void settle("failed");
        }}
      />
    </Card>
  );
}
