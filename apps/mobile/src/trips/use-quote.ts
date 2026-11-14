import type { CallResult } from "@shareride/api-client";
import { quoteRoute, type QuoteRequest } from "@shareride/contracts";
import { useEffect, useState } from "react";
import { useSession } from "@/auth/session";

type QuoteResult = CallResult<typeof quoteRoute>;

interface Quoted {
  /** The latest answer, kept on screen while a newer one is on its way. */
  readonly result: QuoteResult | undefined;
  /** Whether the answer shown is for an older request. */
  readonly stale: boolean;
  readonly retry: () => void;
}

/**
 * Quotes a route whenever the request changes (spec 3, 3.4 to 3.6): its
 * distances, typical times, prices, planned times and problems. Nothing is
 * asked while the request is null. Answers to older requests are dropped.
 */
export function useQuote(request: QuoteRequest | null): Quoted {
  const session = useSession();
  const key = request === null ? null : JSON.stringify(request);
  const [answer, setAnswer] = useState<{ key: string; result: QuoteResult }>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (key === null) return;
    let current = true;
    void session.call(quoteRoute, { body: JSON.parse(key) as QuoteRequest }).then((result) => {
      if (current) setAnswer({ key, result });
    });
    return () => {
      current = false;
    };
  }, [key, session, attempt]);

  return {
    result: key === null ? undefined : answer?.result,
    stale: answer?.key !== key,
    retry: () => {
      setAttempt((count) => count + 1);
    },
  };
}
