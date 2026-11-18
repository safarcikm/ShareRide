import {
  adminActivateMeetingPointRoute,
  adminActivationChecklistRoute,
  type AdminActivationChecklist,
  type AdminMeetingPoint,
} from "@shareride/contracts";
import { activationItems, type ActivationItem } from "@shareride/domain";
import type { MessageKey } from "@shareride/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useConsole } from "../../console.tsx";
import type { StatusResult } from "./status-panel.tsx";

const itemKeys: Record<ActivationItem, MessageKey> = {
  details: "admin.activation.item.details",
  whereToStand: "admin.activation.item.whereToStand",
  photos: "admin.activation.item.photos",
  amenities: "admin.activation.item.amenities",
  season: "admin.activation.item.season",
  confirmed: "admin.activation.item.confirmed",
  legs: "admin.activation.item.legs",
};

type Checklist = AdminActivationChecklist | "loading" | "failed";

/**
 * A draft's activation checklist (R2.3) and its Activate button (spec 2,
 * 3.6.3). The API checks what is saved, so the list is loaded again when
 * the point or one of its photos is saved (`version`). Activate always
 * asks the API, which checks again, as the list shown can be older: if
 * something is still to do, the list shows what the API found and says
 * how much is left.
 */
export function ActivationChecklist({
  point,
  version,
  onResult,
}: {
  readonly point: AdminMeetingPoint;
  /** Changes when a photo is added, described, moved or removed. */
  readonly version: number;
  readonly onResult: (result: StatusResult) => void;
}) {
  const { t, call } = useConsole();
  const base = useId();
  const [checklist, setChecklist] = useState<Checklist>("loading");
  // The API refused to activate it: the list says what is still to do.
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  // Counts the times the "still to do" message is shown, so each one takes the focus.
  const [shown, setShown] = useState(0);
  const notReady = useRef<HTMLParagraphElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  // "Try again" was pressed: the list's title takes the focus once it is there.
  const retried = useRef(false);
  // The last load asked for, so an older answer arriving late is dropped.
  const latest = useRef(0);

  const load = useCallback(async () => {
    const asked = ++latest.current;
    const result = await call(adminActivationChecklistRoute, { params: { id: point.id } });
    if (asked === latest.current) setChecklist(result.ok ? result.data : "failed");
  }, [call, point.id]);

  // Saving the point gives it a new `updatedAt`; saving a photo, a new `version`.
  useEffect(() => {
    void load();
  }, [load, point.updatedAt, version]);

  useEffect(() => {
    if (shown > 0) notReady.current?.focus();
  }, [shown]);

  useEffect(() => {
    if (retried.current && typeof checklist === "object") {
      retried.current = false;
      title.current?.focus();
    }
  }, [checklist]);

  const showNotReady = () => {
    setTried(true);
    setShown((count) => count + 1);
  };

  async function activate() {
    if (busy) return;
    setBusy(true);
    // A load started after this is newer than the API's answer.
    const loadsBefore = latest.current;
    const result = await call(adminActivateMeetingPointRoute, {
      params: { id: point.id },
      body: { updatedAt: point.updatedAt },
    });
    setBusy(false);
    if (result.ok) {
      onResult({ kind: "done", point: result.data, change: "activate" });
      return;
    }
    const { code, details } = result.error;
    if (code === "activation_not_ready") {
      // What the API found, unless a load started since, after a photo was
      // saved meanwhile, has a newer list.
      if (latest.current === loadsBefore) {
        const missing = new Set((details ?? []).map((detail) => detail.path));
        latest.current++;
        setChecklist({
          items: activationItems.map((item) => ({ item, done: !missing.has(item) })),
          ready: false,
        });
      }
      showNotReady();
    } else if (code === "meeting_point_changed" || code === "status_change_not_allowed") {
      onResult({ kind: "changed" });
    } else {
      onResult({ kind: "failed" });
    }
  }

  const titleId = `${base}-title`;
  const noteId = `${base}-note`;

  if (checklist === "loading") {
    return (
      <p className="type-body" role="status">
        {t("common.loading")}
      </p>
    );
  }
  if (checklist === "failed") {
    return (
      <div className="stack">
        <p className="problem type-body">{t("admin.activation.failed")}</p>
        <div className="actions">
          <button
            type="button"
            className="button-secondary type-label"
            // The button keeps the focus until the list is there.
            onClick={() => {
              retried.current = true;
              void load();
            }}
          >
            {t("common.retry")}
          </button>
        </div>
      </div>
    );
  }

  const toDo = checklist.items.filter((check) => !check.done).length;

  return (
    <div className="stack">
      <div className="card-text">
        <h3 ref={title} id={titleId} className="checklist-title type-body-strong" tabIndex={-1}>
          {t("admin.activation.title")}
        </h3>
        <p className="hint type-small">{t("admin.activation.fromSaved")}</p>
      </div>
      <ul className="checklist" aria-labelledby={titleId}>
        {checklist.items.map((check) => (
          <li key={check.item} className="checklist-item type-body">
            <span>{t(itemKeys[check.item])}</span>{" "}
            <span className={check.done ? "tag type-small" : "tag tag-warning type-small"}>
              {t(check.done ? "admin.activation.done" : "admin.activation.toDo")}
            </span>
          </li>
        ))}
      </ul>
      {tried && toDo > 0 ? (
        <p ref={notReady} className="problem type-body" role="alert" tabIndex={-1}>
          {t("admin.activation.notReady", { count: toDo, name: point.nameIs })}
        </p>
      ) : null}
      <p id={noteId} className="type-body">
        {t("admin.activation.note")}
      </p>
      <div className="actions">
        <button
          type="button"
          className="button-primary type-button"
          aria-disabled={busy}
          aria-describedby={noteId}
          onClick={() => void activate()}
        >
          {t(busy ? "admin.activation.activating" : "admin.activation.activate", {
            name: point.nameIs,
          })}
        </button>
      </div>
    </div>
  );
}
