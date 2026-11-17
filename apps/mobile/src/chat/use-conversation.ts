import type { CallFailure } from "@shareride/api-client";
import {
  conversationMessagesRoute,
  readMessagesRoute,
  sendMessageRoute,
  type ChatMessage,
  type Conversation,
} from "@shareride/contracts";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useSession } from "@/auth/session";
import { useLanguage } from "@/i18n/language";
import { showConversation } from "@/notifications/open-conversation";
import { newClientId } from "./client-id";
import { merged, newestTheirs, type Outgoing, type Pending } from "./messages";
import { otherPerson, outgoingText, spokenMessage } from "./texts";
import { useUnread } from "./unread";
import { firstNameOf } from "@/people/texts";

/** While a conversation is open, new messages are fetched this often (spec 7, 3.1, item 10). */
export const pollMs = 5_000;

export interface Shown {
  readonly conversation: Conversation;
  /** Oldest first. */
  readonly messages: readonly ChatMessage[];
  /** There are messages before the first one shown. */
  readonly hasEarlier: boolean;
}

/**
 * A booking's conversation while it is open: the messages loaded so far,
 * new ones every 5 seconds while the screen is in view, marked read as they
 * come; sending with a client ID that a retry keeps (plan 4.3); and earlier
 * messages a page at a time.
 */
export function useConversation(bookingId: string) {
  const { locale, t } = useLanguage();
  const session = useSession();
  const { refresh: refreshUnread } = useUnread();
  const [loaded, setLoaded] = useState<Shown | CallFailure>();
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<readonly Pending[]>([]);
  const [tooFast, setTooFast] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  // What to read out: new messages from the other person, and a send that failed.
  const [announcement, setAnnouncement] = useState<{ text: string; count: number } | null>(null);
  const announce = useCallback((text: string) => {
    setAnnouncement((last) => ({ text, count: (last?.count ?? 0) + 1 }));
  }, []);
  // Fetches of new messages that answered, so a failed read is tried again with the next.
  const [polls, setPolls] = useState(0);
  // The other person's message the conversation was last marked read up to.
  const markedUpTo = useRef<string | null>(null);
  // What is on its way now, so a double tap does not send it twice.
  const onItsWay = useRef(new Set<string>());
  const shown = loaded !== undefined && "messages" in loaded ? loaded : null;
  // What shows now, for the timer that fetches new messages.
  const shownNow = useRef(shown);
  useEffect(() => {
    shownNow.current = shown;
  });

  const page = useCallback(
    (before?: string) =>
      session.call(conversationMessagesRoute, {
        params: { id: bookingId },
        query: before === undefined ? {} : { before },
      }),
    [session, bookingId],
  );

  useEffect(() => {
    let current = true;
    void page().then((answer) => {
      if (!current) return;
      setLoaded(
        answer.ok
          ? {
              conversation: answer.data.conversation,
              messages: merged([], answer.data.messages),
              hasEarlier: answer.data.hasMore,
            }
          : answer,
      );
    });
    return () => {
      current = false;
    };
  }, [page, attempt]);

  // New messages, while the screen is in view and the app in front. One
  // fetch at a time, and an answer that comes after leaving is dropped.
  useFocusEffect(
    useCallback(() => {
      let inView = true;
      let fetching = false;
      const inFront = () => {
        const state = AppState.currentState;
        return state !== "background" && state !== "inactive";
      };
      const fetchNew = () => {
        if (fetching || !inFront()) return;
        fetching = true;
        void page().then((answer) => {
          fetching = false;
          if (!inView || !inFront() || !answer.ok || shownNow.current === null) return;
          // New messages from the other person are read out (plan 4.3).
          const known = new Set(shownNow.current.messages.map((message) => message.id));
          const other = firstNameOf(t, otherPerson(answer.data.conversation.booking));
          const arrived = answer.data.messages
            .filter((message) => message.from === "them" && !known.has(message.id))
            .reverse()
            .map((message) => spokenMessage(t, locale, message, other, false));
          if (arrived.length > 0) announce(arrived.join(" "));
          setLoaded((last) =>
            last === undefined || !("messages" in last)
              ? last
              : {
                  ...last,
                  conversation: answer.data.conversation,
                  messages: merged(last.messages, answer.data.messages),
                },
          );
          setPolls((count) => count + 1);
        });
      };
      const timer = setInterval(fetchNew, pollMs);
      // A push about this conversation fetches it at once (plan 4.5).
      const hide = showConversation(bookingId, fetchNew);
      return () => {
        inView = false;
        clearInterval(timer);
        hide();
      };
    }, [page, t, locale, announce, bookingId]),
  );

  // Reads the other person's messages as they show, and the badge follows;
  // one that failed is tried again after the next fetch.
  const upTo = shown === null ? null : (newestTheirs(shown.messages)?.id ?? null);
  useEffect(() => {
    if (upTo === null || upTo === markedUpTo.current) return;
    markedUpTo.current = upTo;
    void session
      .call(readMessagesRoute, { params: { id: bookingId }, body: { upTo } })
      .then((answer) => {
        if (answer.ok) refreshUnread();
        else if (markedUpTo.current === upTo) markedUpTo.current = null;
      });
  }, [session, bookingId, upTo, polls, refreshUnread]);

  const send = async (outgoing: Outgoing, clientId: string = newClientId()) => {
    // The same message tapped twice while the first is on its way goes once.
    const content = JSON.stringify(outgoing);
    if (onItsWay.current.has(content)) return;
    onItsWay.current.add(content);
    try {
      await sendNow(outgoing, clientId);
    } finally {
      onItsWay.current.delete(content);
    }
  };

  const sendNow = async (outgoing: Outgoing, clientId: string) => {
    setTooFast(false);
    setPending((last) => [
      ...last.filter((item) => item.clientId !== clientId),
      { clientId, outgoing, state: "sending" },
    ]);
    const answer = await session.call(sendMessageRoute, {
      params: { id: bookingId },
      body: { clientId, ...outgoing },
    });
    if (answer.ok) {
      setLoaded((last) =>
        last === undefined || !("messages" in last)
          ? last
          : { ...last, messages: merged(last.messages, [answer.data]) },
      );
      setPending((last) => last.filter((item) => item.clientId !== clientId));
      return;
    }
    setPending((last) =>
      last.map((item) => (item.clientId === clientId ? { ...item, state: "failed" } : item)),
    );
    announce(`${t("chat.notSent")} ${outgoingText(t, outgoing)}`);
    if (answer.error.code === "too_many_messages") setTooFast(true);
    if (answer.error.code === "chat_closed") {
      // Shows it closed, read-only.
      const again = await page();
      if (again.ok) {
        setLoaded((last) =>
          last === undefined || !("messages" in last)
            ? last
            : {
                ...last,
                conversation: again.data.conversation,
                messages: merged(last.messages, again.data.messages),
              },
        );
      }
    }
  };

  const showEarlier = async () => {
    const oldest = shown?.messages[0];
    if (oldest === undefined || loadingEarlier) return;
    setLoadingEarlier(true);
    const answer = await page(oldest.id);
    setLoadingEarlier(false);
    if (!answer.ok) return;
    setLoaded((last) =>
      last === undefined || !("messages" in last)
        ? last
        : {
            ...last,
            messages: merged(last.messages, answer.data.messages),
            hasEarlier: answer.data.hasMore,
          },
    );
  };

  // A message the server has, such as one whose answer was lost, is no longer on its way.
  const sentIds = new Set(shown?.messages.map((message) => message.clientId) ?? []);
  return {
    loaded,
    pending: pending.filter((item) => !sentIds.has(item.clientId)),
    announcement,
    tooFast,
    loadingEarlier,
    reload: () => {
      setLoaded(undefined);
      setAttempt((count) => count + 1);
    },
    send: (outgoing: Outgoing) => {
      void send(outgoing);
    },
    retry: (item: Pending) => {
      void send(item.outgoing, item.clientId);
    },
    showEarlier: () => {
      void showEarlier();
    },
  };
}
