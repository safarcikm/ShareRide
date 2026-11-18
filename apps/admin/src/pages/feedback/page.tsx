import {
  adminFeedbackListRoute,
  adminFeedbackReplyRoute,
  adminFeedbackScreenshotPath,
  adminFeedbackStatusRoute,
  type AdminFeedback,
  type AdminFeedbackList,
} from "@shareride/contracts";
import {
  feedbackKinds,
  feedbackRules,
  feedbackStatuses,
  icelandDate,
  type FeedbackKind,
  type FeedbackStatus,
} from "@shareride/domain";
import { formatClock, formatCount, formatDate } from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useConsole } from "../../console.tsx";
import { ConsoleLink } from "../../components/console-link.tsx";
import { usersPath } from "../reports/texts.ts";

type Loaded =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly list: AdminFeedbackList };

interface Filter {
  readonly status?: FeedbackStatus;
  readonly kind?: FeedbackKind;
}

const isStatus = (value: string): value is FeedbackStatus =>
  (feedbackStatuses as readonly string[]).includes(value);
const isKind = (value: string): value is FeedbackKind =>
  (feedbackKinds as readonly string[]).includes(value);

/**
 * Feedback from testers (spec 12, 3.3.4 and screen 6): newest first, by
 * status and kind, each with its details, a status the operator sets and
 * one reply. A screenshot is loaded only when asked for: opening one is
 * written to the audit log.
 */
export function FeedbackPage() {
  const { t, locale, call } = useConsole();
  const [filter, setFilter] = useState<Filter>({});
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const ids = { status: useId(), kind: useId() };

  const load = useCallback(async () => {
    const result = await call(adminFeedbackListRoute, { query: filter });
    setLoaded(result.ok ? { state: "ready", list: result.data } : { state: "failed" });
  }, [call, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  /** One feedback as the API gave it back after a change, in its place in the list. */
  const replace = (changed: AdminFeedback) => {
    setLoaded((current) =>
      current.state !== "ready"
        ? current
        : {
            state: "ready",
            list: {
              ...current.list,
              feedback: current.list.feedback.map((item) =>
                item.id === changed.id ? changed : item,
              ),
            },
          },
    );
    // The count of new ones, and the filter, may no longer fit.
    void load();
  };

  return (
    <section className="stack">
      <h1 className="type-title">{t("admin.feedback.title")}</h1>
      <p className="type-body muted">{t("admin.feedback.intro")}</p>
      <div className="filter-fields">
        <div className="field">
          <label htmlFor={ids.status} className="type-label">
            {t("admin.feedback.status")}
          </label>
          <select
            id={ids.status}
            className="input type-body"
            value={filter.status ?? ""}
            onChange={(event) => {
              const { value } = event.target;
              setFilter({
                ...(isStatus(value) ? { status: value } : {}),
                ...(filter.kind === undefined ? {} : { kind: filter.kind }),
              });
            }}
          >
            <option value="">{t("admin.feedback.any")}</option>
            {feedbackStatuses.map((status) => (
              <option key={status} value={status}>
                {t(`admin.feedback.status.${status}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={ids.kind} className="type-label">
            {t("admin.feedback.kind")}
          </label>
          <select
            id={ids.kind}
            className="input type-body"
            value={filter.kind ?? ""}
            onChange={(event) => {
              const { value } = event.target;
              setFilter({
                ...(filter.status === undefined ? {} : { status: filter.status }),
                ...(isKind(value) ? { kind: value } : {}),
              });
            }}
          >
            <option value="">{t("admin.feedback.any")}</option>
            {feedbackKinds.map((kind) => (
              <option key={kind} value={kind}>
                {t(`admin.feedback.kind.${kind}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {loaded.state === "loading" ? (
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      ) : loaded.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.feedback.loadFailed")}
          </p>
          <button
            type="button"
            className="button-secondary type-label"
            onClick={() => {
              setLoaded({ state: "loading" });
              void load();
            }}
          >
            {t("admin.retry")}
          </button>
        </div>
      ) : (
        <>
          <p className="notice type-body" role="status">
            {t("admin.feedback.newCount", {
              count: loaded.list.newCount,
              shown: formatCount(loaded.list.newCount, locale),
            })}
          </p>
          {loaded.list.feedback.length === 0 ? (
            <p className="type-body muted">{t("admin.feedback.none")}</p>
          ) : (
            <ul className="cards">
              {loaded.list.feedback.map((item) => (
                <FeedbackCard key={item.id} item={item} onChanged={replace} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function FeedbackCard({
  item,
  onChanged,
}: {
  readonly item: AdminFeedback;
  readonly onChanged: (changed: AdminFeedback) => void;
}) {
  const { t, locale, call } = useConsole();
  const [pictureShown, setPictureShown] = useState(false);
  const [pictureFailed, setPictureFailed] = useState(false);
  const [statusFailed, setStatusFailed] = useState(false);
  const [reply, setReply] = useState("");
  const [checked, setChecked] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyFailed, setReplyFailed] = useState(false);
  const replyField = useRef<HTMLTextAreaElement>(null);
  const ids = { title: useId(), status: useId(), reply: useId(), replyError: useId() };

  const sentAt = new Date(item.createdAt);
  const when = (moment: Date) =>
    t("admin.feedback.when", {
      date: formatDate(icelandDate(moment), locale),
      time: formatClock(moment),
    });
  const who = item.firstName ?? t("admin.feedback.noName");
  const system = [t(`admin.feedback.platform.${item.platform}`), item.osVersion]
    .filter((part) => part !== "")
    .join(" ");

  const trimmed = reply.trim();
  const replyProblem =
    trimmed === ""
      ? t("admin.feedback.replyMissing")
      : Array.from(trimmed).length > feedbackRules.replyMaxLength
        ? t("admin.feedback.replyTooLong", {
            max: formatCount(feedbackRules.replyMaxLength, locale),
          })
        : null;

  async function setStatus(status: FeedbackStatus) {
    setStatusFailed(false);
    const result = await call(adminFeedbackStatusRoute, {
      params: { id: item.id },
      body: { status },
    });
    if (result.ok) onChanged(result.data);
    else setStatusFailed(true);
  }

  async function send() {
    setChecked(true);
    setReplyFailed(false);
    if (replyProblem !== null) {
      replyField.current?.focus();
      return;
    }
    setSending(true);
    const result = await call(adminFeedbackReplyRoute, {
      params: { id: item.id },
      body: { reply: trimmed },
    });
    setSending(false);
    if (result.ok) onChanged(result.data);
    else setReplyFailed(true);
  }

  return (
    <li className="card stack" aria-labelledby={ids.title}>
      <h2 id={ids.title} className="type-heading">
        {t("admin.feedback.heading", { kind: t(`admin.feedback.kind.${item.kind}`), name: who })}
      </h2>
      <p className="type-small muted">{when(sentAt)}</p>
      <p className="type-body line-breaks">{item.message}</p>
      <dl className="facts type-body">
        <dt>{t("admin.feedback.app")}</dt>
        <dd>{t("admin.feedback.appValue", { version: item.appVersion, system })}</dd>
        <dt>{t("admin.feedback.screen")}</dt>
        <dd>
          <code>{item.screen}</code>
        </dd>
        <dt>{t("admin.feedback.language")}</dt>
        <dd>{t(`admin.reports.language.${item.language}`)}</dd>
      </dl>
      <ConsoleLink to={`${usersPath}/${item.userId}`} className="type-label">
        {t("admin.reports.personPage", { name: who })}
      </ConsoleLink>
      {!item.hasScreenshot ? (
        <p className="type-body muted">{t("admin.feedback.noScreenshot")}</p>
      ) : pictureFailed ? (
        <p className="problem type-body" role="alert">
          {t("admin.feedback.screenshotFailed")}
        </p>
      ) : pictureShown ? (
        <img
          className="screenshot"
          src={adminFeedbackScreenshotPath(item.id)}
          alt={t("admin.feedback.screenshotAlt", { name: who })}
          onError={() => {
            setPictureFailed(true);
          }}
        />
      ) : (
        <div className="actions">
          <button
            type="button"
            className="button-secondary type-label"
            aria-label={t("admin.feedback.showScreenshotNamed", { name: who })}
            onClick={() => {
              setPictureShown(true);
            }}
          >
            {t("admin.feedback.showScreenshot")}
          </button>
        </div>
      )}
      <div className="field">
        <label htmlFor={ids.status} className="type-label">
          {t("admin.feedback.status")}
        </label>
        <select
          id={ids.status}
          className="input type-body"
          value={item.status}
          onChange={(event) => {
            if (isStatus(event.target.value)) void setStatus(event.target.value);
          }}
        >
          {feedbackStatuses.map((status) => (
            <option key={status} value={status}>
              {t(`admin.feedback.status.${status}`)}
            </option>
          ))}
        </select>
        {statusFailed ? (
          <p className="problem type-body" role="alert">
            {t("admin.feedback.statusFailed")}
          </p>
        ) : null}
      </div>
      {item.reply !== null ? (
        <div className="stack">
          <h3 className="type-label">
            {item.repliedAt === null
              ? t("admin.feedback.replied")
              : t("admin.feedback.repliedAt", { when: when(new Date(item.repliedAt)) })}
          </h3>
          <p className="type-body line-breaks">{item.reply}</p>
        </div>
      ) : (
        <form
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <div className="field">
            <label htmlFor={ids.reply} className="type-label">
              {t("admin.feedback.reply")}
            </label>
            <textarea
              ref={replyField}
              id={ids.reply}
              className="input textarea type-body"
              rows={3}
              lang={item.language}
              value={reply}
              aria-invalid={checked && replyProblem !== null}
              aria-describedby={checked && replyProblem !== null ? ids.replyError : undefined}
              onChange={(event) => {
                setReply(event.target.value);
              }}
            />
            {checked && replyProblem !== null ? (
              <p id={ids.replyError} className="field-error type-small">
                {replyProblem}
              </p>
            ) : null}
          </div>
          <p className="type-small muted">{t("admin.feedback.replyHint")}</p>
          {replyFailed ? (
            <p className="problem type-body" role="alert">
              {t("admin.feedback.replyFailed")}
            </p>
          ) : null}
          <div className="actions">
            <button type="submit" className="button-primary type-button" disabled={sending}>
              {t("admin.feedback.send")}
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
