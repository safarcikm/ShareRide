import {
  adminAnnouncementReachRoute,
  adminAnnouncementsRoute,
  adminCreateAnnouncementRoute,
  adminSendAnnouncementRoute,
  adminTestAnnouncementRoute,
  adminUpdateAnnouncementRoute,
  type AdminAnnouncement,
  type AdminAnnouncements,
  type AnnouncementReach,
} from "@shareride/contracts";
import {
  announcementAudiences,
  announcementRules,
  announcementTexts,
  icelandDate,
  type AnnouncementAudience,
  type AnnouncementText,
} from "@shareride/domain";
import { formatClock, formatCount, formatDate } from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useConsole } from "../../console.tsx";

type Loaded =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly overview: AdminAnnouncements };

type Corridors = AdminAnnouncements["corridors"];

/**
 * Announcements (spec 10, 3.5 and screen 6): news about the beta, written
 * in both languages for an audience, tried on oneself and sent once. They
 * go to testers with "Beta news" on, and are never advertising (R10.7).
 */
export function AnnouncementsPage() {
  const { t, call } = useConsole();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await call(adminAnnouncementsRoute, {});
    setLoaded(result.ok ? { state: "ready", overview: result.data } : { state: "failed" });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  const after = (message: string) => {
    setNotice(message);
    void load();
  };

  return (
    <section className="stack">
      <h1 className="type-title">{t("admin.announcements.title")}</h1>
      <p className="type-body muted">{t("admin.announcements.intro")}</p>
      {loaded.state === "loading" ? (
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      ) : loaded.state === "failed" ? (
        <div className="stack">
          <p className="problem type-body" role="alert">
            {t("admin.announcements.loadFailed")}
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
        <Ready overview={loaded.overview} notice={notice} after={after} />
      )}
    </section>
  );
}

function Ready({
  overview,
  notice,
  after,
}: {
  readonly overview: AdminAnnouncements;
  readonly notice: string | null;
  readonly after: (message: string) => void;
}) {
  const { t } = useConsole();
  const drafts = overview.announcements.filter((announcement) => announcement.sentAt === null);
  const sent = overview.announcements.filter((announcement) => announcement.sentAt !== null);
  return (
    <>
      {notice === null ? null : (
        <p className="notice type-body" role="status">
          {notice}
        </p>
      )}
      <h2 className="type-heading">{t("admin.announcements.draftsTitle")}</h2>
      {drafts.length === 0 ? (
        <p className="type-body muted">{t("admin.announcements.noDrafts")}</p>
      ) : (
        <ul className="cards">
          {drafts.map((draft) => (
            <DraftCard key={draft.id} draft={draft} corridors={overview.corridors} after={after} />
          ))}
        </ul>
      )}
      <AnnouncementForm
        // A new, empty form after each draft saved.
        key={overview.announcements.length}
        corridors={overview.corridors}
        onSaved={(saved) => {
          after(t("admin.announcements.saved", { title: saved.titleEn }));
        }}
      />
      <h2 className="type-heading">{t("admin.announcements.sentTitle")}</h2>
      {sent.length === 0 ? (
        <p className="type-body muted">{t("admin.announcements.noneSent")}</p>
      ) : (
        <ul className="cards">
          {sent.map((announcement) => (
            <SentCard key={announcement.id} announcement={announcement} />
          ))}
        </ul>
      )}
    </>
  );
}

/** Who an announcement is for, in words. */
function useAudienceText() {
  const { t } = useConsole();
  return (announcement: Pick<AdminAnnouncement, "audience" | "corridor">) =>
    announcement.audience === "corridor"
      ? t("admin.announcements.forCorridor", { name: announcement.corridor?.name ?? "" })
      : t(`admin.announcements.audience.${announcement.audience}`);
}

const languageOf = (field: AnnouncementText) => (field.endsWith("Is") ? "is" : "en");
const maxOf = (field: AnnouncementText) =>
  field.startsWith("title") ? announcementRules.titleMaxLength : announcementRules.messageMaxLength;

/** The form for a new draft, or for changing `draft`. */
function AnnouncementForm({
  draft,
  corridors,
  onSaved,
  onCancel,
}: {
  readonly draft?: AdminAnnouncement;
  readonly corridors: Corridors;
  readonly onSaved: (saved: AdminAnnouncement) => void;
  readonly onCancel?: () => void;
}) {
  const { t, locale, call } = useConsole();
  const [audience, setAudience] = useState<AnnouncementAudience>(draft?.audience ?? "everyone");
  const [corridorId, setCorridorId] = useState(draft?.corridor?.id ?? "");
  const [texts, setTexts] = useState<Record<AnnouncementText, string>>({
    titleIs: draft?.titleIs ?? "",
    titleEn: draft?.titleEn ?? "",
    messageIs: draft?.messageIs ?? "",
    messageEn: draft?.messageEn ?? "",
  });
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const fields = useRef<Partial<Record<AnnouncementText, HTMLElement | null>>>({});
  const corridorSelect = useRef<HTMLSelectElement>(null);
  const id = useId();

  const problemOf = (field: AnnouncementText) => {
    const text = texts[field].trim();
    if (text === "") return t("admin.announcements.textMissing");
    return text.length > maxOf(field)
      ? t("admin.announcements.textTooLong", { max: formatCount(maxOf(field), locale) })
      : null;
  };
  const own = draft?.corridor ?? null;
  const keptCorridor =
    own !== null && !corridors.some((corridor) => corridor.id === own.id) ? own : null;
  const corridorProblem =
    audience === "corridor" && corridorId === "" ? t("admin.announcements.corridorMissing") : null;

  async function save() {
    setChecked(true);
    setFailed(false);
    if (corridorProblem !== null) {
      corridorSelect.current?.focus();
      return;
    }
    const wrong = announcementTexts.find((field) => problemOf(field) !== null);
    if (wrong !== undefined) {
      fields.current[wrong]?.focus();
      return;
    }
    setSaving(true);
    const body = {
      audience,
      corridorId: audience === "corridor" ? corridorId : null,
      titleIs: texts.titleIs.trim(),
      titleEn: texts.titleEn.trim(),
      messageIs: texts.messageIs.trim(),
      messageEn: texts.messageEn.trim(),
    };
    const result =
      draft === undefined
        ? await call(adminCreateAnnouncementRoute, { body })
        : await call(adminUpdateAnnouncementRoute, { params: { id: draft.id }, body });
    setSaving(false);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    onSaved(result.data);
  }

  const field = (name: AnnouncementText) => {
    const problem = checked ? problemOf(name) : null;
    const shared = {
      id: `${id}-${name}`,
      lang: languageOf(name),
      value: texts[name],
      "aria-invalid": problem !== null,
      "aria-describedby": problem !== null ? `${id}-${name}-error` : undefined,
    };
    return (
      <div className="field">
        <label htmlFor={shared.id} className="type-label">
          {t(`admin.announcements.field.${name}`)}
        </label>
        {name.startsWith("title") ? (
          <input
            {...shared}
            ref={(element) => {
              fields.current[name] = element;
            }}
            className="input type-body"
            onChange={(event) => {
              setTexts({ ...texts, [name]: event.target.value });
            }}
          />
        ) : (
          <textarea
            {...shared}
            ref={(element) => {
              fields.current[name] = element;
            }}
            className="input textarea type-body"
            rows={5}
            onChange={(event) => {
              setTexts({ ...texts, [name]: event.target.value });
            }}
          />
        )}
        {problem !== null ? (
          <p id={`${id}-${name}-error`} className="field-error type-small">
            {problem}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <form
      className="card stack"
      noValidate
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2 id={`${id}-title`} className="type-heading">
        {draft === undefined
          ? t("admin.announcements.newTitle")
          : t("admin.announcements.changeNamed", { title: draft.titleEn })}
      </h2>
      <div className="field">
        <label htmlFor={`${id}-audience`} className="type-label">
          {t("admin.announcements.audience")}
        </label>
        <select
          id={`${id}-audience`}
          className="input type-body"
          value={audience}
          onChange={(event) => {
            setAudience(event.target.value as AnnouncementAudience);
          }}
        >
          {announcementAudiences.map((option) => (
            <option key={option} value={option}>
              {t(`admin.announcements.audience.${option}`)}
            </option>
          ))}
        </select>
      </div>
      {audience !== "corridor" ? null : (
        <div className="field">
          <label htmlFor={`${id}-corridor`} className="type-label">
            {t("admin.announcements.corridor")}
          </label>
          <select
            ref={corridorSelect}
            id={`${id}-corridor`}
            className="input type-body"
            value={corridorId}
            aria-invalid={checked && corridorProblem !== null}
            aria-describedby={
              checked && corridorProblem !== null ? `${id}-corridor-error` : undefined
            }
            onChange={(event) => {
              setCorridorId(event.target.value);
            }}
          >
            <option value="">{t("admin.announcements.chooseCorridor")}</option>
            {/* A draft's corridor that is no longer counted can still be kept. */}
            {keptCorridor === null ? null : (
              <option value={keptCorridor.id}>{keptCorridor.name}</option>
            )}
            {corridors.map((corridor) => (
              <option key={corridor.id} value={corridor.id}>
                {corridor.name}
              </option>
            ))}
          </select>
          {checked && corridorProblem !== null ? (
            <p id={`${id}-corridor-error`} className="field-error type-small">
              {corridorProblem}
            </p>
          ) : null}
        </div>
      )}
      {field("titleIs")}
      {field("messageIs")}
      {field("titleEn")}
      {field("messageEn")}
      <p className="type-small muted">{t("admin.announcements.neverAdvertising")}</p>
      {failed ? (
        <p className="problem type-body" role="alert">
          {t("admin.announcements.saveFailed")}
        </p>
      ) : null}
      <div className="actions">
        <button type="submit" className="button-primary type-button" disabled={saving}>
          {draft === undefined ? t("admin.announcements.saveDraft") : t("admin.announcements.save")}
        </button>
        {onCancel === undefined ? null : (
          <button type="button" className="button-quiet type-label" onClick={onCancel}>
            {t("admin.announcements.cancel")}
          </button>
        )}
      </div>
    </form>
  );
}

/** Both languages of an announcement, each marked with its language. */
function Texts({ announcement }: { readonly announcement: AdminAnnouncement }) {
  return (
    <>
      <div className="stack" lang="is">
        <p className="type-label">{announcement.titleIs}</p>
        <p className="type-body line-breaks">{announcement.messageIs}</p>
      </div>
      <div className="stack" lang="en">
        <p className="type-label">{announcement.titleEn}</p>
        <p className="type-body line-breaks">{announcement.messageEn}</p>
      </div>
    </>
  );
}

function DraftCard({
  draft,
  corridors,
  after,
}: {
  readonly draft: AdminAnnouncement;
  readonly corridors: Corridors;
  readonly after: (message: string) => void;
}) {
  const { t, locale, call } = useConsole();
  const audienceText = useAudienceText();
  const [changing, setChanging] = useState(false);
  const [reach, setReach] = useState<AnnouncementReach | "failed" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  // Counted again whenever the draft changes: the audience may have.
  useEffect(() => {
    let current = true;
    setReach(null);
    void call(adminAnnouncementReachRoute, { params: { id: draft.id } }).then((result) => {
      if (current) setReach(result.ok ? result.data : "failed");
    });
    return () => {
      current = false;
    };
  }, [call, draft.id, draft.audience, draft.corridor?.id]);

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  async function test() {
    setBusy(true);
    setProblem(null);
    const result = await call(adminTestAnnouncementRoute, { params: { id: draft.id } });
    setBusy(false);
    if (result.ok) after(t("admin.announcements.tested", { title: draft.titleEn }));
    else setProblem(t("admin.announcements.testFailed"));
  }

  async function send() {
    setBusy(true);
    setProblem(null);
    const result = await call(adminSendAnnouncementRoute, { params: { id: draft.id } });
    setBusy(false);
    // Sent meanwhile, in another window: the list shows it.
    if (result.ok || result.error.code === "already_sent") {
      setConfirming(false);
      after(t("admin.announcements.sent", { title: draft.titleEn }));
    } else setProblem(t("admin.announcements.sendFailed"));
  }

  if (changing) {
    return (
      <li>
        <AnnouncementForm
          draft={draft}
          corridors={corridors}
          onSaved={(saved) => {
            setChanging(false);
            after(t("admin.announcements.saved", { title: saved.titleEn }));
          }}
          onCancel={() => {
            setChanging(false);
          }}
        />
      </li>
    );
  }
  const count = (number: number) => formatCount(number, locale);
  return (
    <li className="card stack">
      <h3 className="type-heading">{draft.titleEn}</h3>
      <p className="type-body muted">{audienceText(draft)}</p>
      <Texts announcement={draft} />
      <p className="type-body" role="status">
        {reach === null
          ? t("admin.announcements.reachCounting")
          : reach === "failed"
            ? t("admin.announcements.reachFailed")
            : t("admin.announcements.reach", {
                people: count(reach.people),
                push: count(reach.push),
                email: count(reach.email),
              })}
      </p>
      {draft.testSentAt === null ? null : (
        <p className="type-small muted">
          {t("admin.announcements.testedAt", {
            date: formatDate(icelandDate(new Date(draft.testSentAt)), locale),
            time: formatClock(new Date(draft.testSentAt)),
          })}
        </p>
      )}
      {problem === null ? null : (
        <p className="problem type-body" role="alert">
          {problem}
        </p>
      )}
      {confirming ? (
        <div className="stack">
          <p className="type-body">{t("admin.announcements.sendQuestion")}</p>
          <div className="actions">
            <button
              ref={confirmButton}
              type="button"
              className="button-primary type-button"
              disabled={busy}
              onClick={() => void send()}
            >
              {t("admin.announcements.sendConfirm", { title: draft.titleEn })}
            </button>
            <button
              type="button"
              className="button-quiet type-label"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {t("admin.announcements.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button
            type="button"
            className="button-secondary type-label"
            aria-label={t("admin.announcements.changeNamed", { title: draft.titleEn })}
            onClick={() => {
              setChanging(true);
            }}
          >
            {t("admin.announcements.change")}
          </button>
          <button
            type="button"
            className="button-secondary type-label"
            disabled={busy}
            aria-label={t("admin.announcements.testNamed", { title: draft.titleEn })}
            onClick={() => void test()}
          >
            {t("admin.announcements.test")}
          </button>
          <button
            type="button"
            className="button-primary type-button"
            aria-label={t("admin.announcements.sendNamed", { title: draft.titleEn })}
            onClick={() => {
              setConfirming(true);
            }}
          >
            {t("admin.announcements.send")}
          </button>
        </div>
      )}
    </li>
  );
}

function SentCard({ announcement }: { readonly announcement: AdminAnnouncement }) {
  const { t, locale } = useConsole();
  const audienceText = useAudienceText();
  const count = (number: number) => formatCount(number, locale);
  const sentAt = new Date(announcement.sentAt ?? announcement.createdAt);
  return (
    <li className="card stack">
      <h3 className="type-heading">{announcement.titleEn}</h3>
      <p className="type-body muted">
        {t("admin.announcements.sentAt", {
          date: formatDate(icelandDate(sentAt), locale),
          time: formatClock(sentAt),
        })}{" "}
        {audienceText(announcement)}
      </p>
      <Texts announcement={announcement} />
      <p className="type-body">
        {t("admin.announcements.wentTo", { people: count(announcement.reach ?? 0) })}{" "}
        {announcement.delivered === null
          ? t("admin.announcements.deliveryGone")
          : t("admin.announcements.delivered", {
              push: count(announcement.delivered.push),
              email: count(announcement.delivered.email),
            })}
      </p>
    </li>
  );
}
