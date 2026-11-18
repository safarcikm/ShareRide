import {
  adminAddMeetingPointPhotoRoute,
  adminDescribeMeetingPointPhotoRoute,
  adminMeetingPointPhotosRoute,
  adminOrderMeetingPointPhotosRoute,
  adminRemoveMeetingPointPhotoRoute,
  type AdminMeetingPoint,
  type AdminMeetingPointPhoto,
} from "@shareride/contracts";
import {
  checkPhotoFile,
  photoLimits,
  validatePhotoDescriptions,
  type PhotoDescriptions,
} from "@shareride/domain";
import type { MessageKey } from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useConsole } from "../../console.tsx";
import { toBase64 } from "../../photos.ts";

type Field = keyof PhotoDescriptions | "file";

interface Problem {
  readonly field: Field;
  readonly issue: string;
}

/** A photo's descriptions as typed, and the copy of the photo they were loaded from. */
interface Draft {
  readonly values: PhotoDescriptions;
  readonly updatedAt: string;
}

/**
 * The last change's result. It takes the focus, so it is read at once, as
 * the button that made the change may be gone or waiting; only a move keeps
 * the focus on the photo, and its result is read out where it appears.
 */
type Message = {
  readonly kind: "status" | "alert";
  readonly text: MessageKey;
  readonly focus: boolean;
} | null;

/** Where a refused change shows its field problems: the new photo's form, or a photo's. */
type Form = "add" | { readonly photoId: string };

const issueKeys: Record<string, MessageKey> = {
  required: "admin.meetingPoint.issue.required",
  too_long: "admin.meetingPoint.issue.tooLong",
};

const fileIssueKeys: Record<string, MessageKey> = {
  required: "admin.meetingPoint.photoIssue.required",
  unreadable: "admin.meetingPoint.photoIssue.unreadable",
  not_jpeg: "admin.meetingPoint.photoIssue.notJpeg",
  metadata: "admin.meetingPoint.photoIssue.metadata",
  too_large: "admin.meetingPoint.photoIssue.tooLarge",
};

const fieldOrder: readonly Field[] = ["file", "descriptionIs", "descriptionEn"];

const emptyDescriptions: PhotoDescriptions = { descriptionIs: "", descriptionEn: "" };

const draftOf = (photo: AdminMeetingPointPhoto): Draft => ({
  values: { descriptionIs: photo.descriptionIs, descriptionEn: photo.descriptionEn },
  updatedAt: photo.updatedAt,
});

/**
 * A meeting point's photos (spec 2, 3.6.3; ADR 0029): each with its
 * descriptions for screen readers in both languages, in the order the app
 * shows them, and a form to add one. The browser makes each photo ready
 * (`PhotoBrowser`) and the domain's `checkPhotoFile` checks it before it is
 * sent. A retired point's photos are shown as they are.
 */
export function PhotosPanel({
  point,
  onChange,
}: {
  readonly point: AdminMeetingPoint;
  /** Called after a photo is added, described, moved or removed here. */
  readonly onChange?: () => void;
}) {
  const { t, locale, call, photos: browser } = useConsole();
  const base = useId();
  const [photos, setPhotos] = useState<readonly AdminMeetingPointPhoto[] | "loading" | "failed">(
    "loading",
  );
  const [drafts, setDrafts] = useState<Readonly<Record<string, Draft>>>({});
  const [problems, setProblems] = useState<Readonly<Record<string, readonly Problem[]>>>({});
  const [file, setFile] = useState<File | null>(null);
  // A new key empties the file field once a photo is added.
  const [fileField, setFileField] = useState(0);
  const [adding, setAdding] = useState<PhotoDescriptions>(emptyDescriptions);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  // Where the focus goes once the list is drawn again, by element ID.
  const focusAfter = useRef<string | null>(null);
  // Retired by someone else while this page was open.
  const [retiredHere, setRetiredHere] = useState(false);
  const readOnly = point.status === "retired" || retiredHere;

  const idOf = (form: Form, field: Field) =>
    `${base}-${form === "add" ? "add" : form.photoId}-${field}`;
  const keyOf = (form: Form) => (form === "add" ? "add" : form.photoId);

  /** Shows a list from the API, keeping what was typed for photos unchanged since. */
  const show = useCallback((next: readonly AdminMeetingPointPhoto[], drop?: string) => {
    setPhotos(next);
    setDrafts((current) =>
      Object.fromEntries(
        next.map((photo) => {
          const typed = current[photo.id];
          const keep =
            typed !== undefined && typed.updatedAt === photo.updatedAt && photo.id !== drop;
          return [photo.id, keep ? typed : draftOf(photo)];
        }),
      ),
    );
  }, []);

  const load = useCallback(
    async (drop?: string) => {
      const result = await call(adminMeetingPointPhotosRoute, { params: { id: point.id } });
      if (result.ok) show(result.data.photos, drop);
      else setPhotos((current) => (current === "loading" ? "failed" : current));
    },
    [call, point.id, show],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (message?.focus === true) messageRef.current?.focus();
  }, [message]);

  useEffect(() => {
    if (focusAfter.current !== null) {
      document.getElementById(focusAfter.current)?.focus();
      focusAfter.current = null;
    }
  });

  if (photos === "loading") {
    return (
      <Panel base={base} title={t("admin.meetingPoint.photos")}>
        <p className="type-body" role="status">
          {t("common.loading")}
        </p>
      </Panel>
    );
  }
  if (photos === "failed") {
    return (
      <Panel base={base} title={t("admin.meetingPoint.photos")}>
        <p className="problem type-body" role="alert">
          {t("admin.meetingPoint.photosFailed")}
        </p>
        <div className="actions">
          <button
            type="button"
            className="button-secondary type-label"
            onClick={() => {
              setPhotos("loading");
              void load();
            }}
          >
            {t("common.retry")}
          </button>
        </div>
      </Panel>
    );
  }

  const list = photos;

  function setFormProblems(form: Form, found: readonly Problem[]) {
    setProblems((current) => ({ ...current, [keyOf(form)]: found }));
    const first = fieldOrder.find((field) => found.some((problem) => problem.field === field));
    if (first !== undefined) document.getElementById(idOf(form, first))?.focus();
  }

  function clearProblem(form: Form, field: Field) {
    setProblems((current) => ({
      ...current,
      [keyOf(form)]: (current[keyOf(form)] ?? []).filter((problem) => problem.field !== field),
    }));
  }

  /** Starts a change: the last message goes, and the buttons wait. */
  function begin() {
    setMessage(null);
    setBusy(true);
  }

  function done(next: readonly AdminMeetingPointPhoto[], text: MessageKey, focus = true) {
    setBusy(false);
    show(next);
    onChange?.();
    setMessage({ kind: "status", text, focus });
  }

  function say(kind: "status" | "alert", text: MessageKey) {
    setMessage({ kind, text, focus: true });
  }

  function refused(
    form: Form,
    error: { code: string; details?: readonly { path: string; issue: string }[] },
  ) {
    setBusy(false);
    const details = error.details ?? [];
    switch (error.code) {
      case "validation_failed":
        if (details.length > 0) {
          setFormProblems(
            form,
            details.map((detail) => ({ field: detail.path as Field, issue: detail.issue })),
          );
          return;
        }
        break;
      case "photo_changed":
        void load(form === "add" ? undefined : form.photoId);
        say("status", "admin.meetingPoint.photoChanged");
        return;
      case "photos_changed":
      case "too_many_photos":
      case "not_found":
        void load();
        say("status", "admin.meetingPoint.photosChanged");
        return;
      case "meeting_point_retired":
        setRetiredHere(true);
        void load();
        say("status", "admin.meetingPoint.photosRetired");
        return;
      case "photo_storage_off":
        say("alert", "admin.meetingPoint.photoStorageOff");
        return;
      case "photo_storage_unavailable":
        say("alert", "admin.meetingPoint.photoStorageUnavailable");
        return;
    }
    say("alert", "admin.meetingPoint.photoFailed");
  }

  async function add() {
    const found: Problem[] = [];
    if (file === null) found.push({ field: "file", issue: "required" });
    const checked = validatePhotoDescriptions(adding);
    if (!checked.ok) found.push(...checked.error);
    if (file === null || !checked.ok) {
      setFormProblems("add", found);
      return;
    }
    begin();
    let bytes: Uint8Array;
    try {
      bytes = await browser.prepare(file);
    } catch {
      setBusy(false);
      setFormProblems("add", [{ field: "file", issue: "unreadable" }]);
      return;
    }
    const ready = checkPhotoFile(bytes);
    if (!ready.ok) {
      setBusy(false);
      setFormProblems("add", [{ field: "file", issue: ready.error }]);
      return;
    }
    const result = await call(adminAddMeetingPointPhotoRoute, {
      params: { id: point.id },
      body: { ...checked.value, file: toBase64(bytes) },
    });
    if (!result.ok) {
      refused("add", result.error);
      return;
    }
    setFile(null);
    setFileField((key) => key + 1);
    setAdding(emptyDescriptions);
    setProblems((current) => ({ ...current, add: [] }));
    done(result.data.photos, "admin.meetingPoint.photoAdded");
  }

  async function describe(photo: AdminMeetingPointPhoto) {
    const form = { photoId: photo.id };
    const draft = drafts[photo.id] ?? draftOf(photo);
    const checked = validatePhotoDescriptions(draft.values);
    if (!checked.ok) {
      setFormProblems(form, checked.error);
      return;
    }
    begin();
    const result = await call(adminDescribeMeetingPointPhotoRoute, {
      params: { id: point.id, photoId: photo.id },
      body: { ...checked.value, updatedAt: draft.updatedAt },
    });
    if (!result.ok) {
      refused(form, result.error);
      return;
    }
    setProblems((current) => ({ ...current, [photo.id]: [] }));
    done(result.data.photos, "admin.meetingPoint.descriptionsSaved");
  }

  async function move(index: number, by: -1 | 1) {
    const order = list.map((photo) => photo.id);
    const moved = order[index];
    const other = order[index + by];
    if (moved === undefined || other === undefined) return;
    order[index] = other;
    order[index + by] = moved;
    begin();
    const result = await call(adminOrderMeetingPointPhotosRoute, {
      params: { id: point.id },
      body: { order },
    });
    if (!result.ok) {
      refused({ photoId: moved }, result.error);
      return;
    }
    // The focus stays with the photo that moved: on the same button, or the other at an end.
    const at = index + by;
    const hasEarlier = at > 0;
    const hasLater = at < order.length - 1;
    const button = by === -1 ? (hasEarlier ? "earlier" : "later") : hasLater ? "later" : "earlier";
    focusAfter.current = `${base}-${moved}-${button}`;
    done(result.data.photos, "admin.meetingPoint.photosOrdered", false);
  }

  async function remove(photo: AdminMeetingPointPhoto) {
    begin();
    const result = await call(adminRemoveMeetingPointPhotoRoute, {
      params: { id: point.id, photoId: photo.id },
    });
    setRemoving(null);
    if (!result.ok) {
      refused({ photoId: photo.id }, result.error);
      return;
    }
    done(result.data.photos, "admin.meetingPoint.photoRemoved");
  }

  const problemOf = (form: Form, field: Field) =>
    (problems[keyOf(form)] ?? []).find((problem) => problem.field === field);

  const problemText = (field: Field, issue: string) =>
    t(
      (field === "file" ? fileIssueKeys[issue] : issueKeys[issue]) ??
        "admin.meetingPoint.issue.unknown",
    );

  const hintId = `${base}-description-hint`;

  const description = (
    form: Form,
    field: keyof PhotoDescriptions,
    value: string,
    change: (value: string) => void,
  ) => {
    const id = idOf(form, field);
    const problem = problemOf(form, field);
    return (
      <div className="field">
        <label htmlFor={id} className="type-label">
          {t(
            field === "descriptionIs"
              ? "admin.meetingPoint.photoDescriptionIs"
              : "admin.meetingPoint.photoDescriptionEn",
          )}
        </label>
        <textarea
          id={id}
          className="input textarea type-body"
          rows={2}
          lang={field === "descriptionIs" ? "is" : "en"}
          value={value}
          aria-invalid={problem !== undefined}
          aria-describedby={[hintId, problem === undefined ? null : `${id}-error`]
            .filter((part) => part !== null)
            .join(" ")}
          onChange={(event) => {
            change(event.target.value);
            clearProblem(form, field);
          }}
        />
        {problem === undefined ? null : (
          <p id={`${id}-error`} className="field-error type-small">
            {problemText(field, problem.issue)}
          </p>
        )}
      </div>
    );
  };

  const fileId = idOf("add", "file");
  const fileProblem = problemOf("add", "file");

  return (
    <Panel base={base} title={t("admin.meetingPoint.photos")}>
      <p className="type-body">
        {t("admin.meetingPoint.photoCount", {
          count: list.length,
          max: photoLimits.maxPerPoint,
        })}
      </p>
      {readOnly ? null : (
        <p id={hintId} className="hint type-small">
          {t("admin.meetingPoint.photoDescriptionHint", { max: photoLimits.descriptionMaxLength })}
        </p>
      )}
      {message?.focus === true ? (
        <p
          ref={messageRef}
          className={`${message.kind === "alert" ? "problem" : "notice"} type-body`}
          role={message.kind}
          tabIndex={-1}
        >
          {t(message.text)}
        </p>
      ) : null}
      {/* Always there, so a result put in it is read out while the focus stays put. */}
      <div aria-live="polite">
        {message === null || message.focus ? null : (
          <p className="notice type-body">{t(message.text)}</p>
        )}
      </div>

      {list.length === 0 ? null : (
        <ol className="photo-list" aria-label={t("admin.meetingPoint.photoList")}>
          {list.map((photo, index) => {
            const number = index + 1;
            const headingId = `${base}-${photo.id}-heading`;
            const draft = drafts[photo.id] ?? draftOf(photo);
            const form = { photoId: photo.id };
            const removeId = `${base}-${photo.id}-remove`;
            const setDraft = (values: PhotoDescriptions) => {
              setDrafts((current) => ({ ...current, [photo.id]: { ...draft, values } }));
            };
            return (
              <li key={photo.id} className="stack" aria-labelledby={headingId}>
                <h3 id={headingId} className="type-body-strong">
                  {t("admin.meetingPoint.photoNumber", { number })}
                </h3>
                <img
                  className="photo"
                  src={photo.url}
                  alt={locale === "is" ? photo.descriptionIs : photo.descriptionEn}
                  width={photo.width}
                  height={photo.height}
                  loading="lazy"
                />
                {readOnly ? (
                  <dl className="facts type-body">
                    <dt>{t("admin.meetingPoint.photoDescriptionIs")}</dt>
                    <dd lang="is">{photo.descriptionIs}</dd>
                    <dt>{t("admin.meetingPoint.photoDescriptionEn")}</dt>
                    <dd lang="en">{photo.descriptionEn}</dd>
                  </dl>
                ) : (
                  <>
                    <form
                      className="stack"
                      noValidate
                      onSubmit={(event) => {
                        event.preventDefault();
                        void describe(photo);
                      }}
                    >
                      {description(form, "descriptionIs", draft.values.descriptionIs, (value) => {
                        setDraft({ ...draft.values, descriptionIs: value });
                      })}
                      {description(form, "descriptionEn", draft.values.descriptionEn, (value) => {
                        setDraft({ ...draft.values, descriptionEn: value });
                      })}
                      <div className="actions">
                        <button
                          type="submit"
                          className="button-secondary type-label"
                          disabled={busy}
                        >
                          {t("admin.meetingPoint.saveDescriptions")}
                        </button>
                      </div>
                    </form>
                    {removing === photo.id ? (
                      <RemoveQuestion
                        number={number}
                        busy={busy}
                        onRemove={() => void remove(photo)}
                        onKeep={() => {
                          focusAfter.current = removeId;
                          setRemoving(null);
                        }}
                      />
                    ) : (
                      <div className="actions">
                        {index > 0 ? (
                          <button
                            id={`${base}-${photo.id}-earlier`}
                            type="button"
                            className="button-quiet type-label"
                            disabled={busy}
                            onClick={() => void move(index, -1)}
                          >
                            {t("admin.meetingPoint.moveEarlier")}
                          </button>
                        ) : null}
                        {index < list.length - 1 ? (
                          <button
                            id={`${base}-${photo.id}-later`}
                            type="button"
                            className="button-quiet type-label"
                            disabled={busy}
                            onClick={() => void move(index, 1)}
                          >
                            {t("admin.meetingPoint.moveLater")}
                          </button>
                        ) : null}
                        <button
                          id={removeId}
                          type="button"
                          className="button-secondary type-label"
                          disabled={busy}
                          onClick={() => {
                            setMessage(null);
                            setRemoving(photo.id);
                          }}
                        >
                          {t("admin.meetingPoint.removePhoto")}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {readOnly ? null : list.length >= photoLimits.maxPerPoint ? (
        <p className="type-body">{t("admin.meetingPoint.maxPhotos")}</p>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <fieldset className="stack">
            <legend className="type-body-strong">{t("admin.meetingPoint.addPhoto")}</legend>
            <div className="field">
              <label htmlFor={fileId} className="type-label">
                {t("admin.meetingPoint.photoFile")}
              </label>
              <input
                key={fileField}
                id={fileId}
                type="file"
                accept="image/*"
                className="type-body"
                aria-invalid={fileProblem !== undefined}
                aria-describedby={[
                  `${fileId}-hint`,
                  fileProblem === undefined ? null : `${fileId}-error`,
                ]
                  .filter((part) => part !== null)
                  .join(" ")}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  clearProblem("add", "file");
                }}
              />
              <p id={`${fileId}-hint`} className="hint type-small">
                {t("admin.meetingPoint.photoFileHint")}
              </p>
              {fileProblem === undefined ? null : (
                <p id={`${fileId}-error`} className="field-error type-small">
                  {problemText("file", fileProblem.issue)}
                </p>
              )}
            </div>
            {description("add", "descriptionIs", adding.descriptionIs, (value) => {
              setAdding({ ...adding, descriptionIs: value });
            })}
            {description("add", "descriptionEn", adding.descriptionEn, (value) => {
              setAdding({ ...adding, descriptionEn: value });
            })}
            <div className="actions">
              <button type="submit" className="button-primary type-button" disabled={busy}>
                {t("admin.meetingPoint.addPhotoConfirm")}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </Panel>
  );
}

function Panel({
  base,
  title,
  children,
}: {
  readonly base: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="panel stack" aria-labelledby={`${base}-title`}>
      <h2 id={`${base}-title`} className="type-heading">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Asks before a photo is deleted for good; the focus starts on the answer that deletes it. */
function RemoveQuestion({
  number,
  busy,
  onRemove,
  onKeep,
}: {
  readonly number: number;
  readonly busy: boolean;
  readonly onRemove: () => void;
  readonly onKeep: () => void;
}) {
  const { t } = useConsole();
  const confirm = useRef<HTMLButtonElement>(null);
  const noteId = useId();
  useEffect(() => {
    confirm.current?.focus();
  }, []);
  const question = t("admin.meetingPoint.removePhotoQuestion", { number });
  return (
    <div className="stack" role="group" aria-label={question}>
      <p className="type-body-strong">{question}</p>
      <p id={noteId} className="type-body">
        {t("admin.meetingPoint.removePhotoNote")}
      </p>
      <div className="actions">
        <button
          ref={confirm}
          type="button"
          className="button-danger type-label"
          disabled={busy}
          aria-describedby={noteId}
          onClick={onRemove}
        >
          {t("admin.meetingPoint.removePhotoConfirm", { number })}
        </button>
        <button type="button" className="button-quiet type-label" disabled={busy} onClick={onKeep}>
          {t("admin.meetingPoint.keep")}
        </button>
      </div>
    </div>
  );
}
